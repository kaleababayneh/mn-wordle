
import contractModule from '../../contract/src/managed/bboard/contract/index.cjs';
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
  
  // Game actions
  makeGuess: (word: string) => Promise<void>;
  verifyP1Guess: () => Promise<void>;  // Player 2 verifies Player 1's guess
  verifyP2Guess: () => Promise<void>;  // Player 1 verifies Player 2's guess
  
  // Utility methods
  stringToWord: (word: string) => Word;
  wordToString: (word: Word) => string;
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

        const isMyTurn = 
          (ledgerState.game_state === GameState.P1_GUESS_TURN && isPlayer1) ||
          (ledgerState.game_state === GameState.P2_GUESS_TURN && isPlayer2) ||
          (ledgerState.game_state === GameState.P1_VERIFY_TURN && isPlayer1) ||
          (ledgerState.game_state === GameState.P2_VERIFY_TURN && isPlayer2);

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
    this.logger?.info(`joinAsPlayer1: ${word}`);

    // Update private state with the chosen word
    const currentPrivateState = await this.providers.privateStateProvider.get(bboardPrivateStateKey);
    if (!currentPrivateState) {
      throw new Error("Private state not found. Make sure you've deployed or joined a contract first.");
    }
    const wordBytes = new Uint8Array([...word].map(c => c.charCodeAt(0)));
    const updatedPrivateState = createBBoardPrivateState(
      currentPrivateState.secretKey,
      currentPrivateState.salt,
      wordBytes
    );
    await this.providers.privateStateProvider.set(bboardPrivateStateKey, updatedPrivateState);

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
    this.logger?.info(`joinAsPlayer2: ${word}`);

    // Update private state with the chosen word
    const currentPrivateState = await this.providers.privateStateProvider.get(bboardPrivateStateKey);
    if (!currentPrivateState) {
      throw new Error("Private state not found. Make sure you've deployed or joined a contract first.");
    }
    const wordBytes = new Uint8Array([...word].map(c => c.charCodeAt(0)));
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
   * @param word The 5-letter word to guess.
   */
  async makeGuess(word: string): Promise<void> {
    this.logger?.info(`makeGuess: ${word}`);

    const wordStruct = this.stringToWord(word);

    // Get current private state and ledger state directly (bypassing potentially stale observable)
    const currentPrivateState = await this.providers.privateStateProvider.get(bboardPrivateStateKey);
    const ledgerStateObservable = this.providers.publicDataProvider.contractStateObservable(this.deployedContractAddress, { type: 'latest' });
    const ledgerState = await firstValueFrom(ledgerStateObservable);
    
    if (!currentPrivateState) {
      throw new Error("Private state not found");
    }
    
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
    
    let txData;
    if (isPlayer1) {
      txData = await this.deployedContract.callTx.turn_player1(wordStruct);
    } else if (isPlayer2) {
      txData = await this.deployedContract.callTx.turn_player2(wordStruct);
    } else {
      throw new Error("Not a player in this game");
    }

    this.logger?.trace({
      transactionAdded: {
        circuit: isPlayer1 ? 'turn_player1' : 'turn_player2',
        txHash: txData.public.txHash,
        blockHeight: txData.public.blockHeight,
      },
    });
  }

  /**
   * Player 2 verifies Player 1's guess.
   */
  async verifyP1Guess(): Promise<void> {
    this.logger?.info('verifyP1Guess');

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
   */
  async verifyP2Guess(): Promise<void> {
    this.logger?.info('verifyP2Guess');

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
   * Convert a string to a Word struct.
   *
   * @param word The 5-letter string to convert.
   * @returns A Word struct with letter values.
   */
  stringToWord(word: string): Word {
    if (word.length !== 5) {
      throw new Error("Word must be exactly 5 characters");
    }
    
    const letters = word.toUpperCase().split('').map(char => BigInt(char.charCodeAt(0)));
    
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
      initialPrivateState: await WordleAPI.getPrivateState(providers),
    });

    logger?.trace({
      contractJoined: {
        finalizedDeployTxData: deployedWordleContract.deployTxData.public,
      },
    });

    return new WordleAPI(deployedWordleContract, providers, logger);
  }

  private static async getPrivateState(providers: WordleProviders): Promise<BBoardPrivateState> {
    const existingPrivateState = await providers.privateStateProvider.get(bboardPrivateStateKey);
    return existingPrivateState ?? createBBoardPrivateState(
      utils.randomBytes(32), // secretKey
      utils.randomBytes(32), // salt
      new Uint8Array([67, 82, 65, 78, 69]) // default word "CRANE"
    );
  }
}

export * as utils from './utils/index.js';
export * from './common-types.js';

// Legacy exports for compatibility
export { WordleAPI as BBoardAPI };
export type { DeployedWordleAPI as DeployedBBoardAPI };