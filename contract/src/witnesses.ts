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
    // Convert Uint8Array to bigint array (Vector<5, Uint<8>>)
    const wordArray = Array.from(privateState.word.slice(0, 5)).map(byte => BigInt(byte));
    return [privateState, wordArray];
  },

  player_salt: ({
    privateState,
  }: WitnessContext<Ledger, BBoardPrivateState>): [
    BBoardPrivateState,
    Uint8Array,
  ] => [privateState, privateState.salt],
};
