// Test to verify the fix for the verification bug (WORDX vs WORKS issue)
import { describe, test, expect } from 'vitest';
import {
  P2PWordleSimulator,
  stringToWord,
  randomSecretKey,
  randomSalt,
  GAME_STATE
} from './wordle-simulator.js';

describe('Verification Bug Fix Test', () => {
  test('WORDX vs WORKS should give correct results [2,2,2,0,0]', () => {
    // Setup: P2 has word "WORKS", P1 will guess "WORDX" 
    const p1SecretKey = randomSecretKey();
    const p1Salt = randomSalt();
    const p1Word = "HELLO"; // P1's word doesn't matter for this test

    const p2SecretKey = randomSecretKey();
    const p2Salt = randomSalt();
    const p2Word = "WORKS"; // P2 has the target word

    const simulator = P2PWordleSimulator.deployWordleContract(
      p1SecretKey,
      p1Salt,
      p1Word
    );

    simulator.createPlayerPrivateState('p2', p2SecretKey, p2Salt, p2Word);

    // Game setup
    simulator.as('p1').join_p1();
    simulator.as('p2').join_p2();

    // P1 guesses "WORDX" at P2's word "WORKS"
    simulator.as('p1').turn_player1(stringToWord("WORDX"));

    // P2 verifies P1's guess and makes counter-guess
    const p2State = simulator.as('p2').turn_player2(stringToWord("DUMMY"));

    // Check P1's guess result: "WORDX" vs P2's word "WORKS"
    expect(p2State.p1_last_guess_result.is_some).toBe(true);
    const result = p2State.p1_last_guess_result.value;

    // Expected: [2,2,2,0,0] for WORDX vs WORKS
    // W - correct position (2)
    // O - correct position (2) 
    // R - correct position (2)
    // D - not in WORKS (0)
    // X - not in WORKS (0)
    expect(result.first_letter_result).toBe(2n);   // W
    expect(result.second_letter_result).toBe(2n);  // O
    expect(result.third_letter_result).toBe(2n);   // R
    expect(result.fourth_letter_result).toBe(0n);  // D
    expect(result.fifth_letter_result).toBe(0n);   // X
  });

  test('Verify both players can make guesses without interference', () => {
    const p1SecretKey = randomSecretKey();
    const p1Salt = randomSalt();
    const p1Word = "HELLO";

    const p2SecretKey = randomSecretKey();
    const p2Salt = randomSalt();
    const p2Word = "WORLD";

    const simulator = P2PWordleSimulator.deployWordleContract(
      p1SecretKey,
      p1Salt,
      p1Word
    );

    simulator.createPlayerPrivateState('p2', p2SecretKey, p2Salt, p2Word);

    // Game setup
    simulator.as('p1').join_p1();
    simulator.as('p2').join_p2();

    // P1 guesses at P2's word
    simulator.as('p1').turn_player1(stringToWord("SWORD"));
    let state = simulator.getLedgerState();
    
    // Verify P1's guess is stored in p1_current_guess
    expect(state.p1_current_guess.first_letter).toBe(BigInt('S'.charCodeAt(0)));

    // P2 guesses at P1's word
    const p2State = simulator.as('p2').turn_player2(stringToWord("JELLY"));
    
    // Verify both guesses are stored separately and P1's guess was verified
    expect(p2State.p1_last_guess_result.is_some).toBe(true);
    expect(p2State.p2_current_guess.first_letter).toBe(BigInt('J'.charCodeAt(0)));
    expect(p2State.p1_current_guess.first_letter).toBe(BigInt('S'.charCodeAt(0)));
  });
});