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
import { type BBoardPrivateState, createBBoardPrivateState, witnesses } from '../../contract/src/index';
import * as utils from './utils/index.js';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { combineLatest, map, tap, from, type Observable, firstValueFrom, BehaviorSubject, switchMap } from 'rxjs';
import { toHex } from '@midnight-ntwrk/midnight-js-utils';

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

        const isPlayer1 = ledgerState.p1.is_some && toHex(ledgerState.p1.value) === toHex(playerIdentity);
        const isPlayer2 = ledgerState.p2.is_some && toHex(ledgerState.p2.value) === toHex(playerIdentity);
        
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
          currentGuess: ledgerState.current_guess,
          lastGuessResult: ledgerState.last_guess_result.is_some ? ledgerState.last_guess_result.value : null,
          
          p1: ledgerState.p1.is_some ? ledgerState.p1.value : null,
          p1GuessCount: ledgerState.p1_guess_count,
          
          p2: ledgerState.p2.is_some ? ledgerState.p2.value : null,
          p2GuessCount: ledgerState.p2_guess_count,
          
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

    // Always get fresh private state to ensure it's valid, using contract-specific keys
    const currentPrivateState = await WordleAPI.getPrivateState(this.providers, this.deployedContractAddress);
    
    this.logger?.info(`Current private state details: secretKey=${!!currentPrivateState.secretKey}, salt=${!!currentPrivateState.salt}, word=${!!currentPrivateState.word}`);

    // Ensure consistent case handling - convert to uppercase
    const normalizedWord = word.toUpperCase();
    const wordBytes = new Uint8Array([...normalizedWord].map(c => c.charCodeAt(0)));
    this.logger?.info(`Word bytes: [${Array.from(wordBytes).join(', ')}]`);
    const updatedPrivateState = createBBoardPrivateState(
      currentPrivateState.secretKey,
      currentPrivateState.salt,
      wordBytes
    );
    
    this.logger?.info(`Updated private state: secretKey=${!!updatedPrivateState.secretKey}, salt=${!!updatedPrivateState.salt}, word=${!!updatedPrivateState.word}`);
    this.logger?.info(`Salt buffer check: ${updatedPrivateState.salt?.constructor.name}, length: ${updatedPrivateState.salt?.length}, buffer: ${!!updatedPrivateState.salt?.buffer}`);
    
    await this.providers.privateStateProvider.set(bboardPrivateStateKey, updatedPrivateState);
    this.logger?.info('Private state saved to provider');

    // Verify the save worked
    const verifyState = await this.providers.privateStateProvider.get(bboardPrivateStateKey);
    this.logger?.info(`Verification - private state retrieved: secretKey=${!!verifyState?.secretKey}, salt=${!!verifyState?.salt}, word=${!!verifyState?.word}`);
    if (verifyState?.salt) {
      this.logger?.info(`Verification - salt details: ${verifyState.salt.constructor.name}, length: ${verifyState.salt.length}, buffer: ${!!verifyState.salt.buffer}`);
    }

    // Trigger state refresh
    this.privateStateRefresh$.next(Date.now());

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

    // Always get fresh private state to ensure it's valid, using contract-specific keys
    const currentPrivateState = await WordleAPI.getPrivateState(this.providers, this.deployedContractAddress);

    // Ensure consistent case handling - convert to uppercase
    const normalizedWord = word.toUpperCase();
    const wordBytes = new Uint8Array([...normalizedWord].map(c => c.charCodeAt(0)));
    this.logger?.info(`Word bytes: [${Array.from(wordBytes).join(', ')}]`);
    const updatedPrivateState = createBBoardPrivateState(
      currentPrivateState.secretKey,
      currentPrivateState.salt,
      wordBytes
    );
    
    await this.providers.privateStateProvider.set(bboardPrivateStateKey, updatedPrivateState);

    // Trigger state refresh
    this.privateStateRefresh$.next(Date.now());

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

    const wordStruct = this.stringToWord(word);

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
    
    // Try to get from private state provider first
    const existingPrivateState = await providers.privateStateProvider.get(bboardPrivateStateKey);
    
    if (existingPrivateState && existingPrivateState.salt && existingPrivateState.secretKey) {
      console.log('getPrivateState: found valid existing state from provider');
      
      // Verify the state is properly formed
      if (existingPrivateState.salt.length === 32 && 
          existingPrivateState.secretKey.length === 32 && 
          existingPrivateState.word && existingPrivateState.word.length === 5) {
        console.log('getPrivateState: existing state is valid, using it');
        return existingPrivateState;
      } else {
        console.warn('getPrivateState: existing state has invalid dimensions, creating new one');
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
}

export * as utils from './utils/index.js';
export * from './common-types.js';

// Legacy exports for compatibility
export { WordleAPI as BBoardAPI };
export type { DeployedWordleAPI as DeployedBBoardAPI };