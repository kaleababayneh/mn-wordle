# How Guess Results Work in P2P ZK Wordle

## The Challenge You Identified

You asked a crucial question: **"If it's truly peer to peer, one party guesses and the other party verifies, is there a way for the guesser to know the result?"**

This is exactly the right concern! In our P2P system, we need to ensure Bob can see the results of his guesses after Alice verifies them.

## The Solution: Blockchain-Published Results

Our smart contract solves this with the `last_result` ledger variable:

```compact
export ledger last_result: GuessResult;
```

## Complete P2P Flow

### 1. **Bob Makes a Guess** 📤
```typescript
// Bob submits guess to shared contract
await bob.makeGuess(guess, contractAddress);
```
- Bob's guess is submitted to the blockchain
- Alice receives notification of the guess event

### 2. **Alice Generates ZK Proof** 🔒
```typescript  
// Alice verifies with her secret word (CRANE) vs Bob's guess (CROWS)
const result = alice.contract.impureCircuits.guess(
  context,
  secretWord, // "CRANE" - stays private!
  bobGuess,   // "CROWS" - public
  bobPublicKey
);
```
- Alice proves the guess result using zero-knowledge
- **Her word "CRANE" never leaves her device**
- ZK proof is generated: `[C✓, R✓, O✗, W✗, S✗]`

### 3. **Result Published to Blockchain** 📡
```compact
// In the smart contract, the result gets stored
last_result = GuessResult {
  first_letter_result: 2,  // C correct position
  second_letter_result: 2, // R correct position  
  third_letter_result: 0,  // O not in word
  fourth_letter_result: 0, // W not in word
  fifth_letter_result: 0,  // S not in word
};
```

### 4. **Bob Reads Result from Blockchain** 📖
```typescript
// Bob queries the shared contract state
const result = await bob.getLastGuessResult();
// Returns: [C✓, R✓, O✗, W✗, S✗]
```

## Key Properties

### ✅ **Privacy Preserved**
- Alice's word "CRANE" **never appears on blockchain**
- Only the guess result is published
- ZK proof guarantees result correctness without revealing secrets

### ✅ **Trustlessness**
- Bob doesn't need to trust Alice
- Blockchain verifies Alice's ZK proof is valid
- Result is cryptographically guaranteed correct

### ✅ **Transparency**
- All players can see the guess history
- Results are publicly verifiable
- Game state is immutable on blockchain

## Real-World Implementation

In production on Midnight Network:

```typescript
// Bob makes guess transaction
const guessTx = await contract.guess(bobGuess, bobPublicKey);
await guessTx.wait(); // Waits for Alice to respond

// Alice generates ZK proof transaction  
const verifyTx = await contract.verifyGuess(aliceProof);
await verifyTx.wait(); // Publishes result to blockchain

// Bob reads result from contract state
const result = await contract.query.last_result();
```

## Why This Works

1. **Shared Contract State**: Both players interact with the same blockchain contract
2. **Event-Driven**: Bob's guess triggers Alice's verification process
3. **Cryptographic Verification**: Network validates Alice's ZK proof before accepting result
4. **Public Results**: Once verified, results are readable by all players

## Comparison to Traditional Gaming

| Traditional Wordle | P2P ZK Wordle |
|-------------------|---------------|
| **Server knows all words** | **Words stay completely private** |
| **Players trust server** | **Players trust cryptographic math** |
| **Central verification** | **Decentralized blockchain verification** |
| **Server can manipulate** | **Mathematically impossible to cheat** |

## The Magic

Bob gets his guess results through **blockchain transparency** while Alice's word remains **cryptographically private**. This is the power of zero-knowledge proofs - proving statements without revealing the underlying secrets!

🎯 **Result**: True peer-to-peer gaming with mathematical privacy guarantees and trustless verification!