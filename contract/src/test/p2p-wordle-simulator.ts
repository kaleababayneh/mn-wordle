// P2P ZK Wordle Test Simulator
// Follows the battleship test pattern for true peer-to-peer gameplay

import {
  type CircuitContext,
  type CircuitResults,
  QueryContext,
  sampleContractAddress,
  constructorContext,
} from "@midnight-ntwrk/compact-runtime";
import {
  Contract,
  type Ledger,
  ledger,
  type Word,
  type GuessResult,
  type Witnesses,
} from "../managed/bboard/contract/index.cjs";
import { type BBoardPrivateState, witnesses, createBBoardPrivateState } from "../witnesses.js";
import * as crypto from 'node:crypto';

export const randomSecretKey = (): Uint8Array => crypto.getRandomValues(Buffer.alloc(32));
export const randomSalt = (): Uint8Array => crypto.getRandomValues(Buffer.alloc(32));

// Helper functions for word manipulation
export function stringToWord(word: string): Word {
  if (word.length !== 5) {
    throw new Error("Word must be exactly 5 characters");
  }
  
  return {
    first_letter: BigInt(word.charCodeAt(0)),
    second_letter: BigInt(word.charCodeAt(1)),
    third_letter: BigInt(word.charCodeAt(2)),
    fourth_letter: BigInt(word.charCodeAt(3)),
    fifth_letter: BigInt(word.charCodeAt(4)),
  };
}

export function wordToString(word: Word): string {
  return String.fromCharCode(
    Number(word.first_letter),
    Number(word.second_letter),
    Number(word.third_letter),
    Number(word.fourth_letter),
    Number(word.fifth_letter)
  );
}

export function stringToWordBytes(word: string): Uint8Array {
  if (word.length !== 5) {
    throw new Error("Word must be exactly 5 characters");
  }
  return new Uint8Array(word.split('').map(c => c.charCodeAt(0)));
}

// Game state enum values (from contract)
export const GAME_STATE = {
  waiting_p1: 0,
  waiting_p2: 1,
  p1_turn: 2,
  p2_turn: 3,
  p1_wins: 4,
  p2_wins: 5,
  draw: 6,
} as const;

type WordleContract = Contract<BBoardPrivateState, Witnesses<BBoardPrivateState>>;

/**
 * P2P Wordle Simulator - Manages multiple players in a true P2P Wordle game
 * Following the battleship simulator pattern
 */
export class P2PWordleSimulator {
  readonly contract: WordleContract;
  userPrivateStates: Record<string, BBoardPrivateState>;
  turnContext: CircuitContext<BBoardPrivateState>;
  updateUserPrivateState: (newPrivateState: BBoardPrivateState) => void;

  constructor(privateState: BBoardPrivateState) {
    this.contract = new Contract(witnesses);
    const { currentPrivateState, currentContractState, currentZswapLocalState } = 
      this.contract.initialState(constructorContext(privateState, "0".repeat(64)));
    
    this.userPrivateStates = { ['p1']: currentPrivateState };
    this.turnContext = {
      currentPrivateState,
      currentZswapLocalState,
      originalState: currentContractState,
      transactionContext: new QueryContext(
        currentContractState.data,
        sampleContractAddress()
      ),
    };
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    this.updateUserPrivateState = (newPrivateState: BBoardPrivateState) => {};
  }

  /**
   * Deploy a new P2P Wordle contract with the first player's state
   */
  static deployWordleContract(
    secretKey: Uint8Array, 
    salt: Uint8Array, 
    word: string
  ): P2PWordleSimulator {
    const wordBytes = stringToWordBytes(word);
    const privateState: BBoardPrivateState = createBBoardPrivateState(secretKey, salt, wordBytes);
    return new P2PWordleSimulator(privateState);
  }

  private buildTurnContext(currentPrivateState: BBoardPrivateState): CircuitContext<BBoardPrivateState> {
    return {
      ...this.turnContext,
      currentPrivateState,
    };
  }

  /**
   * Create private state for a player
   */
  createPlayerPrivateState(
    playerName: string,
    secretKey: Uint8Array,
    salt: Uint8Array,
    word: string
  ): void {
    const wordBytes = stringToWordBytes(word);
    this.userPrivateStates[playerName] = createBBoardPrivateState(secretKey, salt, wordBytes);
  }

  /**
   * Get current ledger state
   */
  getLedgerState(): Ledger {
    return ledger(this.turnContext.transactionContext.state);
  }

  /**
   * Get current private state
   */
  getPrivateState(): BBoardPrivateState {
    return this.turnContext.currentPrivateState;
  }

  private updateUserPrivateStateByName = 
    (name: string) => 
    (newPrivateState: BBoardPrivateState): void => {
      this.userPrivateStates[name] = newPrivateState;
    };

  /**
   * Switch to a different player's context
   */
  as(name: string): P2PWordleSimulator {
    this.turnContext = this.buildTurnContext(this.userPrivateStates[name]);
    this.updateUserPrivateState = this.updateUserPrivateStateByName(name);
    return this;
  }

  /**
   * Update state and return ledger
   */
  updateStateAndGetLedger<T>(circuitResults: CircuitResults<BBoardPrivateState, T>): Ledger {
    this.turnContext = circuitResults.context;
    this.updateUserPrivateState(circuitResults.context.currentPrivateState);
    return this.getLedgerState();
  }

  /**
   * Player 1 joins the game
   */
  join_p1(): Ledger {
    return this.updateStateAndGetLedger(
      this.contract.impureCircuits.join_p1(this.turnContext)
    );
  }

  /**
   * Player 2 joins the game  
   */
  join_p2(): Ledger {
    return this.updateStateAndGetLedger(
      this.contract.impureCircuits.join_p2(this.turnContext)
    );
  }

  /**
   * Player 1 makes a guess
   */
  turn_player1(guess: Word): Ledger {
    return this.updateStateAndGetLedger(
      this.contract.impureCircuits.turn_player1(this.turnContext, guess)
    );
  }

  /**
   * Player 2 verifies Player 1's guess and makes own guess
   */
  turn_player2(guess: Word): Ledger {
    return this.updateStateAndGetLedger(
      this.contract.impureCircuits.turn_player2(this.turnContext, guess)
    );
  }

  /**
   * Player 1 verifies Player 2's guess
   */
  verify_guess(): Ledger {
    return this.updateStateAndGetLedger(
      this.contract.impureCircuits.verify_p1_guess(this.turnContext)
    );
  }
}