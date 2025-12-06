import { Ledger } from "./managed/wordle/contract/index.cjs";
import { WitnessContext } from "@midnight-ntwrk/compact-runtime";

export type BBoardPrivateState = {
  readonly secretKey: Uint8Array;
  readonly salt: Uint8Array;
  readonly word: Uint8Array;
};

export const createBBoardPrivateState = (secretKey: Uint8Array, salt: Uint8Array, word: Uint8Array) => ({
  secretKey,
  salt, 
  word,
});

export const witnesses = {
  local_secret_key: ({
    privateState,
  }: WitnessContext<Ledger, BBoardPrivateState>): [
    BBoardPrivateState,
    Uint8Array,
  ] => [privateState, privateState.secretKey],

  player_word: ({
    privateState,
  }: WitnessContext<Ledger, BBoardPrivateState>): [
    BBoardPrivateState,
    bigint[],
  ] => {
    // Debug: Log what word the witness function is actually receiving
    const wordStr = new TextDecoder().decode(privateState.word.slice(0, 5));
    console.log(`WITNESS DEBUG: player_word received word: "${wordStr}"`);
    console.log(`WITNESS DEBUG: word bytes: [${Array.from(privateState.word.slice(0, 5)).join(', ')}]`);
    
    // Convert Uint8Array to bigint array (Vector<5, Uint<8>>)
    const wordArray = Array.from(privateState.word.slice(0, 5)).map(byte => BigInt(byte));
    console.log(`WITNESS DEBUG: returning word array: [${wordArray.join(', ')}]`);
    
    return [privateState, wordArray];
  },

  player_salt: ({
    privateState,
  }: WitnessContext<Ledger, BBoardPrivateState>): [
    BBoardPrivateState,
    Uint8Array,
  ] => [privateState, privateState.salt],
};
