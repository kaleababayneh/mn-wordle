import contractModule from '../../contract/src/managed/wordle/contract/index.cjs';
const { Contract, ledger, pureCircuits } = contractModule;

import { type ContractAddress } from '@midnight-ntwrk/compact-runtime';
import { type Logger } from 'pino';
import {
  type WordleDerivedState,
  type WordleContract,
  type WordleProviders,
  type DeployedWordleContract,
  type Word,
  GameState,
  type GuessResult,
  bboardPrivateStateKey,
} from './common-types.js';
import { type BBoardPrivateState, createBBoardPrivateState, witnesses } from '../../contract/src/witnesses.js';
import * as utils from './utils/index.js';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { combineLatest, map, tap, from, type Observable, firstValueFrom, BehaviorSubject, switchMap, take } from 'rxjs';
import { toHex } from '@midnight-ntwrk/midnight-js-utils';

// localStorage polyfill for Node.js environments
if (typeof localStorage === 'undefined') {
  const localStorageMap = new Map<string, string>();
  // @ts-ignore - Adding localStorage to global for Node.js
  globalThis.localStorage = {
    getItem: (key: string) => localStorageMap.get(key) ?? null,
    setItem: (key: string, value: string) => localStorageMap.set(key, value),
    removeItem: (key: string) => localStorageMap.delete(key),
    clear: () => localStorageMap.clear(),
    get length() { return localStorageMap.size; },
    key: (index: number) => [...localStorageMap.keys()][index] ?? null
  };
}

/** @internal */
const wordleContractInstance: WordleContract = new Contract(witnesses);

/**
 * An API for a deployed P2P ZK Wordle game.
 */
export interface DeployedWordleAPI {
  readonly deployedContractAddress: ContractAddress;
  readonly state$: Observable<WordleDerivedState>;

  // Player joining
  joinAsPlayer1: (word: string) => Promise<void>;
  joinAsPlayer2: (word: string) => Promise<void>;
  
  // Game actions - now streamlined with automatic verification
  makeGuess: (word: string) => Promise<void>;
  
  // Legacy verification methods (rarely needed with new streamlined workflow)
  verifyP1Guess: () => Promise<void>;  
  verifyP2Guess: () => Promise<void>;  
  
  // Utility methods
  stringToWord: (word: string) => Word;
  wordToString: (word: Word) => string;
  clearPrivateState: () => Promise<void>;
  debugLocalStorage: () => void;
  forceRefreshFromLocalStorage: () => Promise<void>;
  
  // Word validation methods
  isValidWord: (word: string) => boolean;
  getRandomValidWord: () => string;
  getValidWordCount: () => number;

  // New helper methods for competitive display
  getPlayerGuesses: (player: 'player1' | 'player2') => Promise<Array<{word: string, result: number[] | null}>>;
  getOpponentGuesses: () => Promise<Array<{word: string, result: number[] | null}>>;
  getMyGuesses: () => Promise<Array<{word: string, result: number[] | null}>>;
}

/**
 * Provides an implementation of {@link DeployedWordleAPI} by adapting a deployed P2P ZK Wordle
 * contract.
 *
 * @remarks
 * The `BBoardPrivateState` is managed at the DApp level by a private state provider. The private
 * state includes the player's secret key, salt, and their chosen word for the game.
 */
export class WordleAPI implements DeployedWordleAPI {
  private readonly privateStateRefresh$ = new BehaviorSubject<number>(0);
  
  /** @internal */
  private constructor(
    public readonly deployedContract: DeployedWordleContract,
    private readonly providers: WordleProviders,
    private readonly logger?: Logger,
  ) {
    this.deployedContractAddress = deployedContract.deployTxData.public.contractAddress;
    this.state$ = combineLatest(
      [
        // Combine public (ledger) state with...
        this.providers.publicDataProvider.contractStateObservable(this.deployedContractAddress, { type: 'latest' }).pipe(
          map((contractState) => ledger(contractState.data)),
          tap((ledgerState) =>
            logger?.trace({
              ledgerStateChanged: {
                ledgerState: {
                  ...ledgerState,
                  gameState: ledgerState.game_state,
                  p1: ledgerState.p1.is_some ? toHex(ledgerState.p1.value) : null,
                  p2: ledgerState.p2.is_some ? toHex(ledgerState.p2.value) : null,
                },
              },
            }),
          ),
        ),
        // ...private state (reactive to changes)...
        this.privateStateRefresh$.pipe(
          switchMap(() => this.providers.privateStateProvider.get(bboardPrivateStateKey) as Promise<BBoardPrivateState>),
        ),
      ],
      // ...and combine them to produce the required derived state.
      (ledgerState, privateState) => {
        const playerIdentity = pureCircuits.public_key(privateState.secretKey);

        // Debug logging for player detection
        console.log('=== PLAYER DETECTION DEBUG ===');
        console.log('Player identity (from private key):', toHex(playerIdentity));
        console.log('P1 from contract:', ledgerState.p1.is_some ? toHex(ledgerState.p1.value) : 'none');
        console.log('P2 from contract:', ledgerState.p2.is_some ? toHex(ledgerState.p2.value) : 'none');

        const isPlayer1 = ledgerState.p1.is_some && toHex(ledgerState.p1.value) === toHex(playerIdentity);
        const isPlayer2 = ledgerState.p2.is_some && toHex(ledgerState.p2.value) === toHex(playerIdentity);
        
        console.log('Is Player 1:', isPlayer1);
        console.log('Is Player 2:', isPlayer2);
        //console.log('P1 Results:', ledgerState.p1_results);
        //console.log('P2 Results:', ledgerState.p2_results);
        console.log('==============================');
        
        let playerRole: 'player1' | 'player2' | 'spectator' = 'spectator';
        if (isPlayer1) playerRole = 'player1';
        else if (isPlayer2) playerRole = 'player2';

        // Updated for simplified contract - only P1_GUESS_TURN and P2_GUESS_TURN during gameplay
        const isMyTurn = 
          (ledgerState.game_state === GameState.P1_GUESS_TURN && isPlayer1) ||
          (ledgerState.game_state === GameState.P2_GUESS_TURN && isPlayer2);

        const canJoin = 
          (ledgerState.game_state === GameState.WAITING_P1 && !ledgerState.p1.is_some) ||
          (ledgerState.game_state === GameState.WAITING_P2 && !ledgerState.p2.is_some && !isPlayer1);

        return {
          gameState: ledgerState.game_state as GameState,
          p1CurrentGuess: ledgerState.p1_current_guess,
          p2CurrentGuess: ledgerState.p2_current_guess,
          
          p1: ledgerState.p1.is_some ? ledgerState.p1.value : null,
          p1GuessCount: ledgerState.p1_guess_count,
          p1LastGuessResult: ledgerState.p1_last_guess_result.is_some ? ledgerState.p1_last_guess_result.value : null,
          p1Results: ledgerState.p1_results, // NEW: Full P1 results array
          
          p2: ledgerState.p2.is_some ? ledgerState.p2.value : null,
          p2GuessCount: ledgerState.p2_guess_count,
          p2LastGuessResult: ledgerState.p2_last_guess_result.is_some ? ledgerState.p2_last_guess_result.value : null,
          p2Results: ledgerState.p2_results, // NEW: Full P2 results array
          
          isPlayer1,
          isPlayer2,
          isMyTurn,
          canJoin,
          playerRole,
        };
      },
    );
  }

  /**
   * Gets the address of the current deployed contract.
   */
  readonly deployedContractAddress: ContractAddress;

  /**
   * Gets an observable stream of state changes based on the current public (ledger),
   * and private state data.
   */
  readonly state$: Observable<WordleDerivedState>;

  /**
   * Join the game as Player 1 with a secret word.
   *
   * @param word The 5-letter word to use for the game.
   */
  async joinAsPlayer1(word: string): Promise<void> {
    this.logger?.info(`joinAsPlayer1: ${word} -> ${word.toUpperCase()}`);

    // Validate word before proceeding
    const normalizedWord = utils.validateAndNormalizeWord(word);
    if (!normalizedWord) {
      throw new Error(`Invalid word: ${word}. Must be a valid 5-letter English word.`);
    }
    this.logger?.info(`Word validation passed for: ${normalizedWord}`);

    // Always get fresh private state to ensure it's valid, using contract-specific keys
    const currentPrivateState = await WordleAPI.getPrivateState(this.providers, this.deployedContractAddress);
    
    this.logger?.info(`Current private state details: secretKey=${!!currentPrivateState.secretKey}, salt=${!!currentPrivateState.salt}, word=${!!currentPrivateState.word}`);

    // Use the validated normalized word
    const wordBytes = new Uint8Array([...normalizedWord].map(c => c.charCodeAt(0)));
    this.logger?.info(`Word bytes: [${Array.from(wordBytes).join(', ')}]`);
    const updatedPrivateState = createBBoardPrivateState(
      currentPrivateState.secretKey,
      currentPrivateState.salt,
      wordBytes
    );
    
    this.logger?.info(`Updated private state: secretKey=${!!updatedPrivateState.secretKey}, salt=${!!updatedPrivateState.salt}, word=${!!updatedPrivateState.word}`);
    this.logger?.info(`Salt buffer check: ${updatedPrivateState.salt?.constructor.name}, length: ${updatedPrivateState.salt?.length}, buffer: ${!!updatedPrivateState.salt?.buffer}`);
    
    // Debug: Log what word is being stored
    const storedWord = new TextDecoder().decode(updatedPrivateState.word).slice(0, 5);
    this.logger?.info(`Debug - Storing word for Player 1: "${storedWord}"`);
    this.logger?.info(`Debug - Word bytes being stored: [${Array.from(updatedPrivateState.word.slice(0, 5)).join(', ')}]`);
    
    // CRITICAL: Save to both provider and localStorage BEFORE calling contract
    await this.savePrivateState(updatedPrivateState);
    
    // IMPORTANT: Add a small delay to ensure private state is fully propagated
    await new Promise(resolve => setTimeout(resolve, 100));
    
    this.logger?.info(`About to call join_p1 with word: ${storedWord}`);

    const txData = await this.deployedContract.callTx.join_p1();

    this.logger?.trace({
      transactionAdded: {
        circuit: 'join_p1',
        txHash: txData.public.txHash,
        blockHeight: txData.public.blockHeight,
      },
    });
  }

  /**
   * Join the game as Player 2 with a secret word.
   *
   * @param word The 5-letter word to use for the game.
   */
  async joinAsPlayer2(word: string): Promise<void> {
    this.logger?.info(`joinAsPlayer2: ${word} -> ${word.toUpperCase()}`);

    // Validate word before proceeding
    const normalizedWord = utils.validateAndNormalizeWord(word);
    if (!normalizedWord) {
      throw new Error(`Invalid word: ${word}. Must be a valid 5-letter English word.`);
    }
    this.logger?.info(`Word validation passed for: ${normalizedWord}`);

    // Always get fresh private state to ensure it's valid, using contract-specific keys
    const currentPrivateState = await WordleAPI.getPrivateState(this.providers, this.deployedContractAddress);

    // Use the validated normalized word
    const wordBytes = new Uint8Array([...normalizedWord].map(c => c.charCodeAt(0)));
    this.logger?.info(`Word bytes: [${Array.from(wordBytes).join(', ')}]`);
    const updatedPrivateState = createBBoardPrivateState(
      currentPrivateState.secretKey,
      currentPrivateState.salt,
      wordBytes
    );
    
    // Debug: Log what word is being stored
    const storedWord = new TextDecoder().decode(updatedPrivateState.word).slice(0, 5);
    this.logger?.info(`Debug - Storing word for Player 2: "${storedWord}"`);
    this.logger?.info(`Debug - Word bytes being stored: [${Array.from(updatedPrivateState.word.slice(0, 5)).join(', ')}]`);
    
    // CRITICAL: Save to both provider and localStorage BEFORE calling contract
    await this.savePrivateState(updatedPrivateState);
    
    // IMPORTANT: Add a small delay to ensure private state is fully propagated
    await new Promise(resolve => setTimeout(resolve, 100));
    
    this.logger?.info(`About to call join_p2 with word: ${storedWord}`);

    const txData = await this.deployedContract.callTx.join_p2();

    this.logger?.trace({
      transactionAdded: {
        circuit: 'join_p2',
        txHash: txData.public.txHash,
        blockHeight: txData.public.blockHeight,
      },
    });
  }

  /**
   * Make a guess at the opponent's word.
   * 
   * This now automatically handles verification of the previous opponent's guess
   * when applicable, making it a streamlined single-step operation.
   * 
   * Contract behavior:
   * - turn_player1: Verifies P2's previous guess (if p2_guess_count != 0), then makes P1's guess
   * - turn_player2: Verifies P1's previous guess, then makes P2's guess
   *
   * @param word The 5-letter word to guess.
   */
  async makeGuess(word: string): Promise<void> {
    this.logger?.info(`makeGuess: ${word}`);

    // Validate word before proceeding
    const normalizedWord = utils.validateAndNormalizeWord(word);
    if (!normalizedWord) {
      throw new Error(`Invalid word: ${word}. Must be a valid 5-letter English word.`);
    }
    this.logger?.info(`Word validation passed for makeGuess: ${normalizedWord}`);

    const wordStruct = this.stringToWord(normalizedWord);

    // CRITICAL: FORCE refresh private state from localStorage before EVERY contract call
    this.logger?.info(`FORCING private state refresh from localStorage before makeGuess`);
    await this.forceRefreshFromLocalStorage();

    // Get current private state and validate it thoroughly
    const currentPrivateState = await this.providers.privateStateProvider.get(bboardPrivateStateKey);
    
    if (!currentPrivateState) {
      this.logger?.error("Private state not found - this should not happen");
      throw new Error("Private state not found. Please refresh and reconnect your wallet.");
    }
    
    // Validate private state integrity
    if (!currentPrivateState.secretKey || currentPrivateState.secretKey.length !== 32) {
      this.logger?.error(`Invalid secret key: length=${currentPrivateState.secretKey?.length}`);
      throw new Error("Invalid private state - secret key malformed. Please refresh and reconnect.");
    }
    
    if (!currentPrivateState.salt || currentPrivateState.salt.length !== 32) {
      this.logger?.error(`Invalid salt: length=${currentPrivateState.salt?.length}`);
      throw new Error("Invalid private state - salt malformed. Please refresh and reconnect.");
    }
    
    if (!currentPrivateState.word || currentPrivateState.word.length !== 5) {
      this.logger?.error(`Invalid word: length=${currentPrivateState.word?.length}`);
      throw new Error("Invalid private state - word malformed. Please refresh and reconnect.");
    }
    
    this.logger?.info(`Private state validation passed - secretKey: ${currentPrivateState.secretKey.length}B, salt: ${currentPrivateState.salt.length}B, word: ${currentPrivateState.word.length}B`);
    
    // Debug: Show what word is being used for verification
    const myWord = new TextDecoder().decode(currentPrivateState.word).slice(0, 5);
    this.logger?.info(`Debug - My stored word for verification: "${myWord}"`);
    this.logger?.info(`Debug - My stored word bytes: [${Array.from(currentPrivateState.word.slice(0, 5)).join(', ')}]`);
    this.logger?.info(`Debug - Contract address: ${this.deployedContractAddress}`);
    
    // Call our debug function to show localStorage state
    this.debugLocalStorage();
    
    // CRITICAL: Double-check that privateStateProvider has the same word as localStorage
    const contractSuffix = this.deployedContractAddress.slice(-8);
    const storedStateKey = `wordle_privateState_${contractSuffix}`;
    const storedState = localStorage.getItem(storedStateKey);
    if (storedState) {
      try {
        const parsed = JSON.parse(storedState);
        const localStorageWord = new TextDecoder().decode(new Uint8Array(parsed.word)).slice(0, 5);
        const privateProviderWord = new TextDecoder().decode(currentPrivateState.word).slice(0, 5);
        this.logger?.info(`VERIFICATION - localStorage word: "${localStorageWord}"`);
        this.logger?.info(`VERIFICATION - privateProvider word: "${privateProviderWord}"`);
        
        if (localStorageWord !== privateProviderWord) {
          this.logger?.error(`MISMATCH DETECTED! localStorage has "${localStorageWord}" but privateProvider has "${privateProviderWord}"`);
          throw new Error(`State mismatch detected. Please use the "Force Refresh Word" button to sync state.`);
        } else {
          this.logger?.info(`VERIFICATION PASSED - Both localStorage and privateProvider have word: "${localStorageWord}"`);
        }
      } catch (e) {
        this.logger?.warn(`Could not verify localStorage vs privateProvider consistency: ${e}`);
      }
    }
    
    // Get current ledger state
    const ledgerStateObservable = this.providers.publicDataProvider.contractStateObservable(this.deployedContractAddress, { type: 'latest' });
    const ledgerState = await firstValueFrom(ledgerStateObservable);
    
    // Compute player identity and role directly
    const playerIdentity = pureCircuits.public_key(currentPrivateState.secretKey);
    const ledgerData = ledger(ledgerState.data);
    
    const isPlayer1 = ledgerData.p1.is_some && toHex(ledgerData.p1.value) === toHex(playerIdentity);
    const isPlayer2 = ledgerData.p2.is_some && toHex(ledgerData.p2.value) === toHex(playerIdentity);
    
    // Debug logging with fresh data
    this.logger?.info(`makeGuess debug - isPlayer1: ${isPlayer1}, isPlayer2: ${isPlayer2}`);
    this.logger?.info(`makeGuess debug - gameState: ${ledgerData.game_state}, computed identity: ${toHex(playerIdentity)}`);
    this.logger?.info(`makeGuess debug - P1 identity: ${ledgerData.p1.is_some ? toHex(ledgerData.p1.value) : 'none'}`);
    this.logger?.info(`makeGuess debug - P2 identity: ${ledgerData.p2.is_some ? toHex(ledgerData.p2.value) : 'none'}`);
    
    if (!isPlayer1 && !isPlayer2) {
      throw new Error("Not a player in this game - identity mismatch");
    }
    
    // FINAL VERIFICATION: Check what's in private state provider RIGHT before contract call
    const finalCheck = await this.providers.privateStateProvider.get(bboardPrivateStateKey);
    if (finalCheck) {
      const finalWord = new TextDecoder().decode(finalCheck.word).slice(0, 5);
      this.logger?.info(`FINAL CHECK - Private state provider word right before contract call: "${finalWord}"`);
      this.logger?.info(`FINAL CHECK - Word bytes: [${Array.from(finalCheck.word.slice(0, 5)).join(', ')}]`);
    }
    
    try {
      let txData;
      if (isPlayer1) {
        // turn_player1 automatically verifies P2's previous guess if p2_guess_count != 0
        this.logger?.info("Calling turn_player1 (with automatic P2 verification)");
        txData = await this.deployedContract.callTx.turn_player1(wordStruct);
      } else if (isPlayer2) {
        // turn_player2 automatically verifies P1's previous guess
        this.logger?.info("Calling turn_player2 (with automatic P1 verification)");
        txData = await this.deployedContract.callTx.turn_player2(wordStruct);
      } else {
        throw new Error("Not a player in this game - invalid player state");
      }

      this.logger?.trace({
        transactionAdded: {
          circuit: isPlayer1 ? 'turn_player1' : 'turn_player2',
          txHash: txData.public.txHash,
          blockHeight: txData.public.blockHeight,
        },
      });
    } catch (error) {
      this.logger?.error(`Circuit call failed: ${error}`);
      if (error instanceof Error && error.message.includes("Invalid proof")) {
        throw new Error("Proof generation failed. This may indicate a private state inconsistency. Please refresh and try again.");
      }
      throw error;
    }
  }

  /**
   * Player 2 verifies Player 1's guess.
   * 
   * @deprecated This is rarely needed with the new streamlined workflow since makeGuess() 
   * handles verification automatically. Only use for manual verification in edge cases.
   */
  async verifyP1Guess(): Promise<void> {
    this.logger?.info('verifyP1Guess (manual verification - rarely needed)');

    const txData = await this.deployedContract.callTx.verify_p1_guess();

    this.logger?.trace({
      transactionAdded: {
        circuit: 'verify_p1_guess',
        txHash: txData.public.txHash,
        blockHeight: txData.public.blockHeight,
      },
    });
  }

  /**
   * Player 1 verifies Player 2's guess.
   * 
   * @deprecated This is rarely needed with the new streamlined workflow since makeGuess() 
   * handles verification automatically. Only use for manual verification in edge cases.
   */
  async verifyP2Guess(): Promise<void> {
    this.logger?.info('verifyP2Guess (manual verification - rarely needed)');

    const txData = await this.deployedContract.callTx.verify_p2_guess();

    this.logger?.trace({
      transactionAdded: {
        circuit: 'verify_p2_guess',
        txHash: txData.public.txHash,
        blockHeight: txData.public.blockHeight,
      },
    });
  }

  /**
   * Clear private state for this contract to force regeneration.
   * Use this if you encounter persistent "Invalid proof" or key mismatch errors.
   */
  async clearPrivateState(): Promise<void> {
    this.logger?.info('Clearing private state');
    
    const contractSuffix = this.deployedContractAddress.slice(-8);
    
    // Remove from localStorage
    const keysToRemove = [
      `wordle_secretKey_${contractSuffix}`,
      `wordle_salt_${contractSuffix}`,
      `wordle_privateState_${contractSuffix}`
    ];
    
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      this.logger?.info(`Removed localStorage key: ${key}`);
    });
    
    // Clear from private state provider
    await this.providers.privateStateProvider.set(bboardPrivateStateKey, await WordleAPI.getPrivateState(this.providers, this.deployedContractAddress));
    
    // Trigger state refresh
    this.privateStateRefresh$.next(Date.now());
    
    this.logger?.info('Private state cleared and regenerated');
  }

  /**
   * Save private state to both privateStateProvider and localStorage for persistence.
   * This ensures consistency between provider and localStorage storage.
   */
  private async savePrivateState(privateState: BBoardPrivateState): Promise<void> {
    // Save to private state provider
    await this.providers.privateStateProvider.set(bboardPrivateStateKey, privateState);
    
    // Also save to localStorage for persistence
    const contractSuffix = this.deployedContractAddress.slice(-8);
    const contractSpecificKey = `wordle_privateState_${contractSuffix}`;
    const stateToStore = {
      secretKey: Array.from(privateState.secretKey),
      salt: Array.from(privateState.salt),
      word: Array.from(privateState.word)
    };
    localStorage.setItem(contractSpecificKey, JSON.stringify(stateToStore));
    
    this.logger?.info(`Private state saved to both provider and localStorage for contract ${contractSuffix}`);
    this.logger?.info(`Word saved: ${new TextDecoder().decode(privateState.word).slice(0, 5)}`);
    
    // Trigger state refresh
    this.privateStateRefresh$.next(Date.now());
  }

  /**
   * Debug method to check localStorage contents for troubleshooting.
   */
  debugLocalStorage(): void {
    const contractSuffix = this.deployedContractAddress.slice(-8);
    const keys = [
      `wordle_secretKey_${contractSuffix}`,
      `wordle_salt_${contractSuffix}`,
      `wordle_privateState_${contractSuffix}`
    ];
    
    console.log(`=== DEBUG: localStorage for contract ${contractSuffix} ===`);
    keys.forEach(key => {
      const value = localStorage.getItem(key);
      if (value) {
        try {
          const parsed = JSON.parse(value);
          if (key.includes('privateState')) {
            const word = parsed.word ? new TextDecoder().decode(new Uint8Array(parsed.word)).slice(0, 5) : 'N/A';
            console.log(`${key}: Found complete state with word "${word}"`);
          } else {
            console.log(`${key}: Found array of length ${parsed.length}`);
          }
        } catch (e) {
          console.log(`${key}: Found value but failed to parse`);
        }
      } else {
        console.log(`${key}: Not found`);
      }
    });
    console.log(`=== END DEBUG ===`);
  }

  /**
   * Force refresh private state from localStorage for this contract.
   * Use this to ensure the correct word is loaded from localStorage.
   */
  async forceRefreshFromLocalStorage(): Promise<void> {
    const contractSuffix = this.deployedContractAddress.slice(-8);
    console.log(`Force refreshing private state for contract ${contractSuffix}`);
    
    // Get complete state from localStorage
    const storedStateKey = `wordle_privateState_${contractSuffix}`;
    const storedState = localStorage.getItem(storedStateKey);
    
    if (storedState) {
      try {
        const parsed = JSON.parse(storedState);
        if (parsed.secretKey && parsed.salt && parsed.word &&
            parsed.secretKey.length === 32 && parsed.salt.length === 32 && parsed.word.length === 5) {
          const refreshedState = createBBoardPrivateState(
            new Uint8Array(parsed.secretKey),
            new Uint8Array(parsed.salt),
            new Uint8Array(parsed.word)
          );
          
          const word = new TextDecoder().decode(refreshedState.word).slice(0, 5);
          console.log(`Force refreshing with word: "${word}"`);
          console.log(`Force refreshing with word bytes: [${Array.from(refreshedState.word.slice(0, 5)).join(', ')}]`);
          
          // Force update the private state provider
          await this.providers.privateStateProvider.set(bboardPrivateStateKey, refreshedState);
          
          // Trigger state refresh
          this.privateStateRefresh$.next(Date.now());
          
          console.log('Private state force refreshed successfully');
        } else {
          throw new Error('Invalid stored state dimensions');
        }
      } catch (error) {
        console.error('Failed to force refresh from localStorage:', error);
        throw error;
      }
    } else {
      throw new Error(`No stored state found for contract ${contractSuffix}`);
    }
  }

  /**
   * Convert a string to a Word struct.
   *
   * @param word The 5-letter string to convert.
   * @returns A Word struct with letter values.
   */
  stringToWord(word: string): Word {
    if (word.length !== 5) {
      throw new Error("Word must be exactly 5 characters");
    }
    
    const normalizedWord = word.toUpperCase();
    const letters = normalizedWord.split('').map(char => BigInt(char.charCodeAt(0)));
    
    this.logger?.info(`stringToWord: ${word} -> ${normalizedWord} -> [${letters.join(', ')}]`);
    
    return {
      first_letter: letters[0],
      second_letter: letters[1],
      third_letter: letters[2],
      fourth_letter: letters[3],
      fifth_letter: letters[4],
    };
  }

  /**
   * Convert a Word struct to a string.
   *
   * @param word The Word struct to convert.
   * @returns A 5-letter string.
   */
  wordToString(word: Word): string {
    return String.fromCharCode(
      Number(word.first_letter),
      Number(word.second_letter),
      Number(word.third_letter),
      Number(word.fourth_letter),
      Number(word.fifth_letter)
    );
  }

  /**
   * Validates if a word is a valid English 5-letter word for Wordle.
   *
   * @param word The word to validate.
   * @returns true if valid, false otherwise.
   */
  isValidWord(word: string): boolean {
    return utils.isValidWordleWord(word);
  }

  /**
   * Gets a random valid Wordle word.
   *
   * @returns A random valid 5-letter English word.
   */
  getRandomValidWord(): string {
    return utils.getRandomValidWord();
  }

  /**
   * Gets the total number of valid Wordle words available.
   *
   * @returns The count of valid words.
   */
  getValidWordCount(): number {
    return utils.getValidWordCount();
  }

  /**
   * Deploys a new P2P ZK Wordle contract to the network.
   *
   * @param providers The Wordle providers.
   * @param logger An optional 'pino' logger to use for logging.
   * @returns A `Promise` that resolves with a {@link WordleAPI} instance that manages the newly deployed
   * {@link DeployedWordleContract}; or rejects with a deployment error.
   */
  static async deploy(providers: WordleProviders, logger?: Logger): Promise<WordleAPI> {
    logger?.info('deployContract');

    const deployedWordleContract = await deployContract<typeof wordleContractInstance>(providers, {
      privateStateId: bboardPrivateStateKey,
      contract: wordleContractInstance,
      initialPrivateState: await WordleAPI.getPrivateState(providers),
    });

    logger?.trace({
      contractDeployed: {
        finalizedDeployTxData: deployedWordleContract.deployTxData.public,
      },
    });

    return new WordleAPI(deployedWordleContract, providers, logger);
  }

  /**
   * Finds an already deployed P2P ZK Wordle contract on the network, and joins it.
   *
   * @param providers The Wordle providers.
   * @param contractAddress The contract address of the deployed Wordle contract to search for and join.
   * @param logger An optional 'pino' logger to use for logging.
   * @returns A `Promise` that resolves with a {@link WordleAPI} instance that manages the joined
   * {@link DeployedWordleContract}; or rejects with an error.
   */
  static async join(providers: WordleProviders, contractAddress: ContractAddress, logger?: Logger): Promise<WordleAPI> {
    logger?.info({
      joinContract: {
        contractAddress,
      },
    });

    const deployedWordleContract = await findDeployedContract<WordleContract>(providers, {
      contractAddress,
      contract: wordleContractInstance,
      privateStateId: bboardPrivateStateKey,
      initialPrivateState: await WordleAPI.getPrivateState(providers, contractAddress),
    });

    logger?.trace({
      contractJoined: {
        finalizedDeployTxData: deployedWordleContract.deployTxData.public,
      },
    });

    return new WordleAPI(deployedWordleContract, providers, logger);
  }

  private static async getPrivateState(providers: WordleProviders, contractAddress?: ContractAddress): Promise<BBoardPrivateState> {
    // Use contract address to create unique storage keys for each game
    const contractSuffix = contractAddress ? contractAddress.slice(-8) : 'default';
    console.log(`Getting private state for contract: ${contractSuffix}`);
    
    // PRIORITY: Try to load complete state from localStorage FIRST (this is most up-to-date)
    const storedStateKey = `wordle_privateState_${contractSuffix}`;
    const storedState = localStorage.getItem(storedStateKey);
    if (storedState) {
      try {
        const parsed = JSON.parse(storedState);
        if (parsed.secretKey && parsed.salt && parsed.word &&
            parsed.secretKey.length === 32 && parsed.salt.length === 32 && parsed.word.length === 5) {
          const restoredState = createBBoardPrivateState(
            new Uint8Array(parsed.secretKey),
            new Uint8Array(parsed.salt),
            new Uint8Array(parsed.word)
          );
          console.log(`getPrivateState: restored complete private state from localStorage for contract ${contractSuffix}`);
          console.log(`getPrivateState: restored word: ${new TextDecoder().decode(restoredState.word).slice(0, 5)}`);
          console.log(`getPrivateState: restored word bytes: [${Array.from(restoredState.word.slice(0, 5)).join(', ')}]`);
          
          // Save to provider for consistency
          await providers.privateStateProvider.set(bboardPrivateStateKey, restoredState);
          return restoredState;
        }
      } catch (e) {
        console.warn(`Failed to parse stored complete state for contract ${contractSuffix}:`, e);
      }
    }
    
    // FALLBACK: Try to get from private state provider if localStorage doesn't have complete state
    const existingPrivateState = await providers.privateStateProvider.get(bboardPrivateStateKey);
    
    if (existingPrivateState && existingPrivateState.salt && existingPrivateState.secretKey) {
      console.log('getPrivateState: found fallback state from provider');
      
      // Verify the state is properly formed
      if (existingPrivateState.salt.length === 32 && 
          existingPrivateState.secretKey.length === 32 && 
          existingPrivateState.word && existingPrivateState.word.length === 5) {
        console.log('getPrivateState: fallback provider state is valid, using it');
        return existingPrivateState;
      } else {
        console.warn('getPrivateState: fallback provider state has invalid dimensions, creating new one');
      }
    }
    
    console.log('getPrivateState: creating new state');
    
    // Generate or retrieve persistent keys from localStorage with contract-specific keys
    const getOrCreateKey = (keyName: string): Uint8Array => {
      const storageKey = `wordle_${keyName}_${contractSuffix}`;
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          const key = new Uint8Array(parsed);
          if (key.length === 32) {
            console.log(`Retrieved valid ${keyName} for contract ${contractSuffix}`);
            return key;
          } else {
            console.warn(`Stored ${keyName} has invalid length: ${key.length}, generating new one`);
          }
        } catch (e) {
          console.warn(`Failed to parse stored ${keyName} for contract ${contractSuffix}, generating new one`);
        }
      }
      
      // Generate new key
      const newKey = utils.randomBytes(32);
      localStorage.setItem(storageKey, JSON.stringify(Array.from(newKey)));
      console.log(`Generated new ${keyName} for contract ${contractSuffix}`);
      return newKey;
    };
    
    const secretKey = getOrCreateKey('secretKey');
    const salt = getOrCreateKey('salt');
    const defaultWord = new Uint8Array([67, 82, 65, 78, 69]); // "CRANE"
    
    console.log('getPrivateState: created components', {
      contractSuffix,
      secretKey: !!secretKey,
      salt: !!salt,
      word: !!defaultWord,
      secretKeyLength: secretKey?.length,
      saltLength: salt?.length,
      wordLength: defaultWord?.length
    });
    
    const newState = createBBoardPrivateState(secretKey, salt, defaultWord);
    
    console.log('getPrivateState: created private state', {
      contractSuffix,
      secretKey: !!newState.secretKey,
      salt: !!newState.salt,
      word: !!newState.word,
      secretKeyLength: newState.secretKey?.length,
      saltLength: newState.salt?.length,
      wordLength: newState.word?.length
    });
    
    // Save to private state provider for consistency
    await providers.privateStateProvider.set(bboardPrivateStateKey, newState);
    
    // Also save to contract-specific localStorage for persistence
    const stateToStore = {
      secretKey: Array.from(newState.secretKey),
      salt: Array.from(newState.salt),
      word: Array.from(newState.word)
    };
    const contractSpecificKey = `wordle_privateState_${contractSuffix}`;
    localStorage.setItem(contractSpecificKey, JSON.stringify(stateToStore));
    console.log(`Saved private state to localStorage for contract ${contractSuffix}`);
    
    return newState;
  }

  /**
   * Get the current state synchronously (latest value from state$).
   * 
   * @returns The current derived state or null if not available
   */
  private getCurrentState(): WordleDerivedState | null {
    try {
      // Get the latest emitted value from the observable
      let currentState: WordleDerivedState | null = null;
      const subscription = this.state$.pipe(take(1)).subscribe(state => currentState = state as WordleDerivedState);
      subscription.unsubscribe();
      return currentState;
    } catch (error) {
      this.logger?.error('Failed to get current state');
      return null;
    }
  }

  /**
   * Get all guesses and results for a specific player.
   * 
   * @param player Which player's guesses to retrieve ('player1' or 'player2')
   * @returns Array of {word: string, result: number[] | null} objects
   */
  async getPlayerGuesses(player: 'player1' | 'player2'): Promise<Array<{word: string, result: number[] | null}>> {
    const currentState = this.getCurrentState();
    console.log(`=== getPlayerGuesses(${player}) DEBUG ===`);
    console.log('getCurrentState() returned:', currentState);
    
    if (!currentState) {
      console.log(`getPlayerGuesses(${player}): No current state available`);
      
      // Try alternative: access ledger state directly like in makeGuess method
      try {
        console.log('Attempting direct ledger state access...');
        const ledgerStateObservable = this.providers.publicDataProvider.contractStateObservable(this.deployedContractAddress, { type: 'latest' });
        
        // Use async pattern like makeGuess method
        const ledgerState = await firstValueFrom(ledgerStateObservable);
        console.log('Got ledger state directly:', !!ledgerState?.data);
        
        if (ledgerState && ledgerState.data) {
          const ledgerData = ledger(ledgerState.data);
          console.log('Processed ledger data:', !!ledgerData);
          
          const playerResults = player === 'player1' ? ledgerData.p1_results : ledgerData.p2_results;
          const guessCount = player === 'player1' ? ledgerData.p1_guess_count : ledgerData.p2_guess_count;
          
          console.log(`Direct ledger - Player results:`, playerResults);
          console.log(`Direct ledger - Guess count:`, guessCount);
          
          if (playerResults && guessCount > 0) {
            const guesses = [];
            for (let i = 0; i < Number(guessCount); i++) {
              const word = this.wordToString(playerResults.guess_words[i]);
              const result = playerResults.guess_results[i];
              
              const resultArray = result && (
                result.first_letter_result || result.second_letter_result || 
                result.third_letter_result || result.fourth_letter_result || 
                result.fifth_letter_result
              ) ? [
                Number(result.first_letter_result),
                Number(result.second_letter_result), 
                Number(result.third_letter_result),
                Number(result.fourth_letter_result),
                Number(result.fifth_letter_result)
              ] : null;
              
              guesses.push({ word, result: resultArray });
            }
            console.log(`Direct ledger result for ${player}:`, guesses);
            return guesses;
          }
        }
      } catch (error) {
        console.log('Direct ledger access failed:', error);
      }
      
      return [];
    }
    
    const playerResults = player === 'player1' ? currentState.p1Results : currentState.p2Results;
    const guessCount = player === 'player1' ? currentState.p1GuessCount : currentState.p2GuessCount;
    
    console.log(`Player results object:`, playerResults);
    console.log(`Guess count:`, guessCount);
    console.log(`Guess count as number:`, Number(guessCount));
    
    if (!playerResults) {
      console.log(`No player results available for ${player}`);
      return [];
    }
    
    console.log(`Player results guess_words array:`, playerResults?.guess_words);
    console.log(`Player results guess_results array:`, playerResults?.guess_results);
    
    const guesses = [];
    for (let i = 0; i < Number(guessCount); i++) {
      console.log(`Processing guess ${i}:`);
      const word = this.wordToString(playerResults.guess_words[i]);
      const result = playerResults.guess_results[i];
      console.log(`  Raw word array:`, playerResults.guess_words[i]);
      console.log(`  Converted word:`, word);
      console.log(`  Result:`, result);
      
      // Convert GuessResult to array of numbers, or null if it's empty/default
      const resultArray = result && (
        result.first_letter_result || result.second_letter_result || 
        result.third_letter_result || result.fourth_letter_result || 
        result.fifth_letter_result
      ) ? [
        Number(result.first_letter_result),
        Number(result.second_letter_result), 
        Number(result.third_letter_result),
        Number(result.fourth_letter_result),
        Number(result.fifth_letter_result)
      ] : null;
      
      console.log(`  Result array:`, resultArray);
      guesses.push({ word, result: resultArray });
    }
    
    console.log(`Final guesses for ${player}:`, guesses);
    console.log(`=== END getPlayerGuesses(${player}) ===`);
    return guesses;
  }

  /**
   * Get all opponent guesses visible to the current player.
   * 
   * @returns Array of {word: string, result: number[] | null} objects for opponent
   */
  async getOpponentGuesses(): Promise<Array<{word: string, result: number[] | null}>> {
    const currentState = this.getCurrentState();
    
    if (currentState) {
      // Use current state if available
      if (currentState.isPlayer1) {
        return await this.getPlayerGuesses('player2');
      } else if (currentState.isPlayer2) {
        return await this.getPlayerGuesses('player1');
      }
    } else {
      // Fallback: determine player identity using direct ledger access
      try {
        console.log('getOpponentGuesses: Using direct ledger access to determine player identity');
        const ledgerStateObservable = this.providers.publicDataProvider.contractStateObservable(this.deployedContractAddress, { type: 'latest' });
        const ledgerState = await firstValueFrom(ledgerStateObservable);
        
        if (ledgerState?.data) {
          const privateState = await this.providers.privateStateProvider.get(bboardPrivateStateKey) as BBoardPrivateState;
          const playerIdentity = pureCircuits.public_key(privateState.secretKey);
          const ledgerData = ledger(ledgerState.data);
          
          const isPlayer1 = ledgerData.p1.is_some && toHex(ledgerData.p1.value) === toHex(playerIdentity);
          const isPlayer2 = ledgerData.p2.is_some && toHex(ledgerData.p2.value) === toHex(playerIdentity);
          
          console.log(`getOpponentGuesses: Direct access - isPlayer1: ${isPlayer1}, isPlayer2: ${isPlayer2}`);
          
          if (isPlayer1) {
            return await this.getPlayerGuesses('player2');
          } else if (isPlayer2) {
            return await this.getPlayerGuesses('player1');
          }
        }
      } catch (error) {
        console.log('getOpponentGuesses: Direct access failed:', error);
      }
    }
    
    return [];
  }

  /**
   * Get own guesses for the current player.
   * 
   * @returns Array of {word: string, result: number[] | null} objects for current player
   */
  async getMyGuesses(): Promise<Array<{word: string, result: number[] | null}>> {
    const currentState = this.getCurrentState();
    
    if (currentState) {
      // Use current state if available
      if (currentState.isPlayer1) {
        return await this.getPlayerGuesses('player1');
      } else if (currentState.isPlayer2) {
        return await this.getPlayerGuesses('player2');
      }
    } else {
      // Fallback: determine player identity using direct ledger access
      try {
        console.log('getMyGuesses: Using direct ledger access to determine player identity');
        const ledgerStateObservable = this.providers.publicDataProvider.contractStateObservable(this.deployedContractAddress, { type: 'latest' });
        const ledgerState = await firstValueFrom(ledgerStateObservable);
        
        if (ledgerState?.data) {
          const privateState = await this.providers.privateStateProvider.get(bboardPrivateStateKey) as BBoardPrivateState;
          const playerIdentity = pureCircuits.public_key(privateState.secretKey);
          const ledgerData = ledger(ledgerState.data);
          
          const isPlayer1 = ledgerData.p1.is_some && toHex(ledgerData.p1.value) === toHex(playerIdentity);
          const isPlayer2 = ledgerData.p2.is_some && toHex(ledgerData.p2.value) === toHex(playerIdentity);
          
          console.log(`getMyGuesses: Direct access - isPlayer1: ${isPlayer1}, isPlayer2: ${isPlayer2}`);
          
          if (isPlayer1) {
            return await this.getPlayerGuesses('player1');
          } else if (isPlayer2) {
            return await this.getPlayerGuesses('player2');
          }
        }
      } catch (error) {
        console.log('getMyGuesses: Direct access failed:', error);
      }
    }
    
    return [];
  }
}

export * as utils from './utils/index.js';
export * from './common-types.js';

// Legacy exports for compatibility
export { WordleAPI as BBoardAPI };
export type { DeployedWordleAPI as DeployedBBoardAPI };