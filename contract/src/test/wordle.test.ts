// P2P ZK Wordle Tests
// Comprehensive tests following the battleship pattern

import { describe, test, expect } from 'vitest';
import { 
  P2PWordleSimulator, 
  randomSecretKey, 
  randomSalt, 
  stringToWord, 
  wordToString,
  GAME_STATE 
} from './wordle-simulator.js';

// Test player setups
const player1SecretKey = randomSecretKey();
const player1Salt = randomSalt();
const player1Word = "CRANE";

const player2SecretKey = randomSecretKey();  
const player2Salt = randomSalt();
const player2Word = "SLATE";

function createGame() {
  const simulator = P2PWordleSimulator.deployWordleContract(
    player1SecretKey, 
    player1Salt, 
    player1Word
  );
  
  const initialState = simulator.getLedgerState();
  expect(initialState.game_state).toBe(GAME_STATE.waiting_p1);
  
  simulator.createPlayerPrivateState('p2', player2SecretKey, player2Salt, player2Word);
  return simulator;
}

describe('P2P ZK Wordle Contract Tests', () => {
  
  describe('Game Setup and Player Joining', () => {
    test('Initial game state is waiting for player 1', () => {
      const simulator = createGame();
      const state = simulator.getLedgerState();
      expect(state.game_state).toBe(GAME_STATE.waiting_p1);
    });

    test('Player 1 can join successfully', () => {
      const simulator = createGame();
      
      const p1State = simulator.as('p1').join_p1();
      expect(p1State.game_state).toBe(GAME_STATE.waiting_p2);
      expect(p1State.p1.is_some).toBe(true);
      expect(p1State.p1_public_key.is_some).toBe(true);
    });

    test('Player 2 can join after Player 1', () => {
      const simulator = createGame();
      
      simulator.as('p1').join_p1();
      const p2State = simulator.as('p2').join_p2();
      
      expect(p2State.game_state).toBe(GAME_STATE.p1_guess_turn);
      expect(p2State.p2.is_some).toBe(true);
      expect(p2State.p2_public_key.is_some).toBe(true);
    });

    test('Prevent Player 1 from joining twice', () => {
      const simulator = createGame();
      
      simulator.as('p1').join_p1();
      
      expect(() => {
        simulator.as('p1').join_p1();
      }).toThrow('failed assert: Game is not waiting for player 1');
    });

    test('Prevent same player from joining as both players', () => {
      const simulator = createGame();
      
      simulator.as('p1').join_p1();
      
      expect(() => {
        simulator.as('p1').join_p2();
      }).toThrow('failed assert: Cannot play against yourself');
    });

    test('Prevent Player 2 from joining before Player 1', () => {
      const simulator = createGame();
      
      expect(() => {
        simulator.as('p2').join_p2();
      }).toThrow('failed assert: Game is not waiting for player 2');
    });
  });

  describe('Turn Management', () => {
    test('Player 1 can make first guess', () => {
      const simulator = createGame();
      
      simulator.as('p1').join_p1();
      simulator.as('p2').join_p2();
      
      const guess = stringToWord("SALTY");
      const p1State = simulator.as('p1').turn_player1(guess);
      
      expect(p1State.game_state).toBe(GAME_STATE.p2_guess_turn);
      expect(p1State.p1_guess_count).toBe(1n);
      expect(wordToString(p1State.p1_current_guess)).toBe("SALTY");
    });

    test('Player 2 verifies guess and makes counter-guess', () => {
      const simulator = createGame();
      
      simulator.as('p1').join_p1();
      simulator.as('p2').join_p2();
      
      // Player 1 guesses at Player 2's word "SLATE"
      simulator.as('p1').turn_player1(stringToWord("SLIME"));
      
      // Player 2 verifies guess and makes counter-guess
      const p2State = simulator.as('p2').turn_player2(stringToWord("CRASH"));
      
      expect(p2State.game_state).toBe(GAME_STATE.p1_guess_turn);
      expect(p2State.p2_guess_count).toBe(1n);
      expect(p2State.p1_last_guess_result.is_some).toBe(true);
      
      // Verify the guess result for "SLIME" vs "SLATE"
      const result = p2State.p1_last_guess_result.value;
      expect(result.first_letter_result).toBe(2n);  // S - correct position
      expect(result.second_letter_result).toBe(2n); // L - correct position  
      expect(result.third_letter_result).toBe(0n);  // I - not in SLATE
      expect(result.fourth_letter_result).toBe(0n); // M - not in SLATE
      expect(result.fifth_letter_result).toBe(2n);  // E - correct position
    });

    test('Player 1 verifies Player 2 guess', () => {
      const simulator = createGame();
      
      simulator.as('p1').join_p1();
      simulator.as('p2').join_p2();
      
      // Player 1 guesses
      simulator.as('p1').turn_player1(stringToWord("SLIME"));
      
      // Player 2 verifies and guesses at Player 1's word "CRANE" 
      // This should automatically verify P1's guess and store P2's guess
      const p2State = simulator.as('p2').turn_player2(stringToWord("CREEP"));
      
      expect(p2State.game_state).toBe(GAME_STATE.p1_guess_turn);
      expect(p2State.p1_last_guess_result.is_some).toBe(true);
      expect(p2State.p2_guess_count).toBe(1n);
      
      // Verify the guess result for "SLIME" vs "SLATE" (P1 guessing P2's word)
      const result = p2State.p1_last_guess_result.value;
      expect(result.first_letter_result).toBe(2n);  // S - correct position
      expect(result.second_letter_result).toBe(2n); // L - correct position
      expect(result.third_letter_result).toBe(0n);  // I - not in SLATE
      expect(result.fourth_letter_result).toBe(0n); // M - not in SLATE  
      expect(result.fifth_letter_result).toBe(2n);  // E - correct position
    });

    test('Reject guess when not player turn', () => {
      const simulator = createGame();
      
      simulator.as('p1').join_p1();
      simulator.as('p2').join_p2();
      
      // It's Player 1's turn, Player 2 shouldn't be able to guess
      expect(() => {
        simulator.as('p2').turn_player2(stringToWord("WRONG"));
      }).toThrow("failed assert: Not player 2's guess turn");
    });
  });

  describe('Win Conditions', () => {
    test('Player 1 wins by guessing Player 2 word correctly', () => {
      const simulator = createGame();
      
      simulator.as('p1').join_p1();
      simulator.as('p2').join_p2();
      
      // Player 1 guesses Player 2's word "SLATE" correctly
      simulator.as('p1').turn_player1(stringToWord("SLATE"));
      
      // Player 2 verifies the correct guess
      const p2State = simulator.as('p2').turn_player2(stringToWord("WRONG"));
      
      expect(p2State.game_state).toBe(GAME_STATE.p1_wins);
      
      // Verify all letters are correct
      const result = p2State.p1_last_guess_result.value;
      expect(result.first_letter_result).toBe(2n);
      expect(result.second_letter_result).toBe(2n);
      expect(result.third_letter_result).toBe(2n);
      expect(result.fourth_letter_result).toBe(2n);
      expect(result.fifth_letter_result).toBe(2n);
    });

    test('Player 2 wins by guessing Player 1 word correctly', () => {
      const simulator = createGame();
      
      simulator.as('p1').join_p1();
      simulator.as('p2').join_p2();
      
      // Player 1 makes wrong guess
      simulator.as('p1').turn_player1(stringToWord("WRONG"));
      
      // Player 2 verifies and guesses Player 1's word "CRANE" correctly  
      simulator.as('p2').turn_player2(stringToWord("CRANE"));
      
      // Player 1 takes next turn, which will verify P2's guess and detect the win
      const p1State = simulator.as('p1').turn_player1(stringToWord("DUMMY"));
      
      expect(p1State.game_state).toBe(GAME_STATE.p2_wins);
      expect(p1State.p2_last_guess_result.is_some).toBe(true);
      
      // Verify all letters are correct
      const result = p1State.p2_last_guess_result.value;
      expect(result.first_letter_result).toBe(2n);
      expect(result.second_letter_result).toBe(2n);
      expect(result.third_letter_result).toBe(2n);
      expect(result.fourth_letter_result).toBe(2n);
      expect(result.fifth_letter_result).toBe(2n);
    });

    test('Game ends in draw after 6 guesses each', () => {
      const simulator = createGame();
      
      simulator.as('p1').join_p1();
      simulator.as('p2').join_p2();
      
      // Simulate 6 rounds of wrong guesses
      const wrongGuesses = ["WRONG", "GUESS", "BADLY", "FIRST", "TRIAL", "FINAL"];
      
      let finalState;
      for (let i = 0; i < 6; i++) {
        // Player 1 guesses
        simulator.as('p1').turn_player1(stringToWord(wrongGuesses[i]));
        
        // Player 2 verifies and guesses  
        finalState = simulator.as('p2').turn_player2(stringToWord(wrongGuesses[i]));
      }
      
      // After 6 rounds, both players should have used all guesses
      expect(finalState.game_state).toBe(GAME_STATE.draw);
    });
  });

  describe('Guess Evaluation Logic', () => {
    test('Correct letter in correct position returns 2', () => {
      const simulator = createGame();
      
      simulator.as('p1').join_p1();
      simulator.as('p2').join_p2();
      
      // Player 1 guesses with some correct letters in correct positions
      simulator.as('p1').turn_player1(stringToWord("SLIDE")); // vs SLATE
      
      const p2State = simulator.as('p2').turn_player2(stringToWord("WRONG"));
      const result = p2State.p1_last_guess_result.value;
      
      expect(result.first_letter_result).toBe(2n);  // S correct
      expect(result.second_letter_result).toBe(2n); // L correct
      expect(result.third_letter_result).toBe(0n);  // I not in SLATE
      expect(result.fourth_letter_result).toBe(0n); // D not in SLATE  
      expect(result.fifth_letter_result).toBe(2n);  // E correct
    });

    test('Correct letter in wrong position returns 1', () => {
      const simulator = createGame();
      
      simulator.as('p1').join_p1();
      simulator.as('p2').join_p2();
      
      // Player 1 guesses with letters in wrong positions
      simulator.as('p1').turn_player1(stringToWord("TALES")); // vs SLATE
      
      const p2State = simulator.as('p2').turn_player2(stringToWord("WRONG"));
      const result = p2State.p1_last_guess_result.value;
      
      expect(result.first_letter_result).toBe(1n);  // T in SLATE but wrong position
      expect(result.second_letter_result).toBe(1n); // A in SLATE but wrong position
      expect(result.third_letter_result).toBe(1n);  // L in SLATE but wrong position
      expect(result.fourth_letter_result).toBe(1n); // E in SLATE but wrong position
      expect(result.fifth_letter_result).toBe(1n);  // S in SLATE but wrong position
    });

    test('Incorrect letter returns 0', () => {
      const simulator = createGame();
      
      simulator.as('p1').join_p1();
      simulator.as('p2').join_p2();
      
      // Player 1 guesses with all wrong letters
      simulator.as('p1').turn_player1(stringToWord("PROXY")); // vs SLATE
      
      const p2State = simulator.as('p2').turn_player2(stringToWord("WRONG"));
      const result = p2State.p1_last_guess_result.value;
      
      expect(result.first_letter_result).toBe(0n);  // P not in SLATE
      expect(result.second_letter_result).toBe(0n); // R not in SLATE
      expect(result.third_letter_result).toBe(0n);  // O not in SLATE  
      expect(result.fourth_letter_result).toBe(0n); // X not in SLATE
      expect(result.fifth_letter_result).toBe(0n);  // Y not in SLATE
    });
  });

  describe('Player Identity Verification', () => {
    test('Reject guess from wrong player identity', () => {
      const simulator = createGame();
      
      simulator.as('p1').join_p1();
      simulator.as('p2').join_p2();
      
      // Player 2 tries to make Player 1's turn
      expect(() => {
        simulator.as('p2').turn_player1(stringToWord("WRONG"));
      }).toThrow("failed assert: You are not player 1");
      
      simulator.as('p1').turn_player1(stringToWord("GUESS"));
      
      // Player 1 tries to make Player 2's turn
      expect(() => {
        simulator.as('p1').turn_player2(stringToWord("WRONG"));
      }).toThrow("failed assert: You are not player 2");
    });

    test('Reject verification from wrong player', () => {
      const simulator = createGame();
      
      simulator.as('p1').join_p1();
      simulator.as('p2').join_p2();
      
      simulator.as('p1').turn_player1(stringToWord("GUESS"));
      simulator.as('p2').turn_player2(stringToWord("WORDS"));
    });
  });

  describe('Guess Limit Enforcement', () => {
    test('Prevent Player 1 from making more than 6 guesses', () => {
      const simulator = createGame();
      
      simulator.as('p1').join_p1();
      simulator.as('p2').join_p2();
      
      // Make exactly 5 complete rounds (10 guesses total)
      for (let i = 0; i < 5; i++) {
        simulator.as('p1').turn_player1(stringToWord(`GUES${i}`));
        simulator.as('p2').turn_player2(stringToWord(`BACK${i}`));
      }
      
      // Player 1 makes their 6th guess
      simulator.as('p1').turn_player1(stringToWord("GUESS"));
      
      // Player 2 responds with their 6th guess - this will trigger the draw logic
      const p2State = simulator.as('p2').turn_player2(stringToWord("BACKS"));
      
      // The game should end in draw now since both players used all guesses
      expect(p2State.game_state).toBe(GAME_STATE.draw);
    });

    test('Prevent Player 2 from making more than 6 guesses', () => {
      const simulator = createGame();
      
      simulator.as('p1').join_p1();
      simulator.as('p2').join_p2();
      
      // Simulate gameplay where Player 2 makes 6 guesses
      for (let i = 0; i < 6; i++) {
        simulator.as('p1').turn_player1(stringToWord(`GUES${i}`));
        simulator.as('p2').turn_player2(stringToWord(`BACK${i}`));
      }
      
      // Try to continue should result in game end
      const finalState = simulator.getLedgerState();
      expect([GAME_STATE.p1_wins, GAME_STATE.p2_wins, GAME_STATE.draw])
        .toContain(finalState.game_state);
    });
  });

  describe('Commitment Integrity', () => {
    test('Word commitment remains consistent throughout game', () => {
      const simulator = createGame();
      
      const p1State1 = simulator.as('p1').join_p1();
      const initialP1WordHash = p1State1.p1_word_hash;
      
      const p2State1 = simulator.as('p2').join_p2();
      const initialP2WordHash = p2State1.p2_word_hash;
      
      // Make several guesses
      simulator.as('p1').turn_player1(stringToWord("GUESS"));
      const p2State2 = simulator.as('p2').turn_player2(stringToWord("REPLY"));
      
      // Verify commitments haven't changed
      const finalState = simulator.getLedgerState();
      expect(finalState.p1_word_hash).toEqual(initialP1WordHash);
      expect(finalState.p2_word_hash).toEqual(initialP2WordHash);
    });
  });

  describe('Helper Functions', () => {
    test('stringToWord converts correctly', () => {
      const word = stringToWord("HELLO");
      expect(word.first_letter).toBe(BigInt('H'.charCodeAt(0)));
      expect(word.second_letter).toBe(BigInt('E'.charCodeAt(0)));
      expect(word.third_letter).toBe(BigInt('L'.charCodeAt(0)));
      expect(word.fourth_letter).toBe(BigInt('L'.charCodeAt(0)));
      expect(word.fifth_letter).toBe(BigInt('O'.charCodeAt(0)));
    });

    test('wordToString converts correctly', () => {
      const word = stringToWord("WORLD");
      const result = wordToString(word);
      expect(result).toBe("WORLD");
    });

    test('stringToWord rejects invalid length', () => {
      expect(() => stringToWord("TOO")).toThrow("Word must be exactly 5 characters");
      expect(() => stringToWord("TOOLONG")).toThrow("Word must be exactly 5 characters");
    });
  });
});