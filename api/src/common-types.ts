
import { type MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import { type FoundContract } from '@midnight-ntwrk/midnight-js-contracts';
import type { BBoardPrivateState, Contract, Witnesses } from '../../contract/src/index';
import type { Word, GuessResult, Maybe, Ledger } from '../../contract/src/managed/wordle/contract/index.cjs';

export type PlayerResult = {
  guess_words: Word[];
  guess_results: GuessResult[];
};

export const bboardPrivateStateKey = 'bboardPrivateState';
export type PrivateStateId = typeof bboardPrivateStateKey;

// Game states enum matching the contract
export enum GameState {
  WAITING_P1 = 0,
  WAITING_P2 = 1,
  P1_GUESS_TURN = 2,
  P2_GUESS_TURN = 3,
  P1_WINS = 4,
  P2_WINS = 5,
  DRAW = 6,
}

/**
 * The private states consumed throughout the application.
 *
 * @remarks
 * {@link PrivateStates} can be thought of as a type that describes a schema for all
 * private states for all contracts used in the application. Each key represents
 * the type of private state consumed by a particular type of contract.
 * The key is used by the deployed contract when interacting with a private state provider,
 * and the type (i.e., `typeof PrivateStates[K]`) represents the type of private state
 * expected to be returned.
 *
 * Since there is only one contract type for the P2P Wordle game, we only define a
 * single key/type in the schema.
 *
 * @public
 */
export type PrivateStates = {
  /**
   * Key used to provide the private state for {@link WordleContract} deployments.
   */
  readonly bboardPrivateState: BBoardPrivateState;
};

/**
 * Represents a P2P Wordle contract and its private state.
 *
 * @public
 */
export type WordleContract = Contract<BBoardPrivateState, Witnesses<BBoardPrivateState>>;

/**
 * The keys of the circuits exported from {@link WordleContract}.
 *
 * @public
 */
export type WordleCircuitKeys = Exclude<keyof WordleContract['impureCircuits'], number | symbol>;

/**
 * The providers required by {@link WordleContract}.
 *
 * @public
 */
export type WordleProviders = MidnightProviders<WordleCircuitKeys, PrivateStateId, BBoardPrivateState>;

/**
 * A {@link WordleContract} that has been deployed to the network.
 *
 * @public
 */
export type DeployedWordleContract = FoundContract<WordleContract>;

/**
 * A type that represents the derived combination of public (or ledger), and private state.
 */
export type WordleDerivedState = {
  readonly gameState: GameState;
  readonly currentGuess: Word | null;
  readonly lastGuessResult: GuessResult | null;
  
  // Player 1 state
  readonly p1: Uint8Array | null;
  readonly p1GuessCount: bigint;
  readonly p1LastGuessResult: GuessResult | null;
  readonly p1Results: PlayerResult; // NEW: Full P1 results array
  
  // Player 2 state  
  readonly p2: Uint8Array | null;
  readonly p2GuessCount: bigint;
  readonly p2LastGuessResult: GuessResult | null;
  readonly p2Results: PlayerResult; // NEW: Full P2 results array
  
  // Current user info
  readonly isPlayer1: boolean;
  readonly isPlayer2: boolean;
  readonly isMyTurn: boolean;
  readonly canJoin: boolean;
  readonly playerRole: 'player1' | 'player2' | 'spectator';
};

/**
 * Player information for the game.
 */
export type PlayerInfo = {
  readonly identity: Uint8Array;
  readonly guessCount: bigint;
  readonly isConnected: boolean;
};

/**
 * Game result information.
 */
export type GameResult = {
  readonly winner: 'player1' | 'player2' | 'draw' | null;
  readonly isFinished: boolean;
  readonly totalGuesses: {
    player1: bigint;
    player2: bigint;
  };
};

// Re-export types from contract for convenience
export type { Word, GuessResult, Maybe, Ledger };

// Legacy types for compatibility (keeping the BBoardContract naming for now)
export type BBoardContract = WordleContract;
export type BBoardCircuitKeys = WordleCircuitKeys;
export type BBoardProviders = WordleProviders;
export type DeployedBBoardContract = DeployedWordleContract;
export type BBoardDerivedState = WordleDerivedState;
