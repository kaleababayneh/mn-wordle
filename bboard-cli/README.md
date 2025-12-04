# P2P ZK Wordle CLI

A command-line interface for playing peer-to-peer zero-knowledge Wordle games on the Midnight network.

## Overview

This CLI allows two players to play a private Wordle game where:
- Each player chooses a secret 5-letter word
- Players take turns guessing each other's words
- Zero-knowledge proofs ensure word privacy until verification
- True peer-to-peer gameplay with cryptographic player identity
- 6 guesses per player with automatic win/loss/draw detection

## Game Rules

1. **Game Setup**: One player deploys a contract, the other joins
2. **Player Joining**: 
   - Player 1 joins first with their secret word
   - Player 2 joins with their secret word
3. **Gameplay**:
   - Player 1 makes the first guess at Player 2's word
   - Player 2 verifies the guess and makes their own guess
   - Player 1 verifies Player 2's guess, and so on
4. **Scoring**: Each letter gets a score:
   - `2` = Correct letter in correct position (green)
   - `1` = Correct letter in wrong position (yellow) 
   - `0` = Letter not in word (gray)
5. **Win Conditions**:
   - Player wins by guessing opponent's word correctly
   - Game draws if both players use all 6 guesses without winning

## Features

- **Zero-Knowledge Privacy**: Words remain secret until verification
- **Cryptographic Security**: Player identity verified through ZK proofs
- **True P2P**: No central authority beyond the smart contract
- **Real-time State**: Observable game state updates
- **Complete Game Flow**: Join, guess, verify, win/lose/draw

## CLI Commands

1. **Deploy a new P2P Wordle game contract** - Start a new game
2. **Join an existing P2P Wordle game contract** - Join a game by contract address
3. **Join as Player 1 (with your word)** - Enter the game as Player 1
4. **Join as Player 2 (with your word)** - Enter the game as Player 2
5. **Make a guess at opponent's word** - Submit a 5-letter guess
6. **Verify opponent's guess (Player 1 only)** - Verify and score a guess
7. **Display the current ledger state** - View public game state
8. **Display the current private state** - View your secret key, salt, and word
9. **Display the current derived state** - View computed game state

## Usage

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run in standalone mode (local development)
npm run standalone

# Run on testnet
npm run testnet-remote
```

## Game State Information

The CLI displays various game states:
- `waiting_p1` - Waiting for Player 1 to join
- `waiting_p2` - Waiting for Player 2 to join  
- `p1_turn` - Player 1's turn to guess or verify
- `p2_turn` - Player 2's turn to guess and verify
- `p1_wins` - Player 1 guessed Player 2's word
- `p2_wins` - Player 2 guessed Player 1's word
- `draw` - Both players used all guesses

## Example Gameplay

1. **Player A**: Deploy contract, join as Player 1 with word "CRANE"
2. **Player B**: Join contract, join as Player 2 with word "SLATE"
3. **Player A**: Guess "STORY" → gets result [1,0,0,0,0] (S in wrong position)
4. **Player B**: Verifies guess, guesses "CRISP" → gets result [2,2,0,1,0] 
5. **Player A**: Verifies guess, makes next guess...
6. Continue until someone wins or draw

## Technical Details

- Built on Midnight Network with Compact language
- Uses zero-knowledge proofs for private word verification
- Cryptographic commitments prevent word changes mid-game
- Observable state streams for real-time updates
- Level-based private state storage

## Security Features

- **Word Commitment**: Hash(word + salt + secret_key) prevents cheating
- **Player Authentication**: Public key derived from secret key
- **Zero-Knowledge Verification**: Prove word matches without revealing it
- **Game Integrity**: Smart contract enforces rules and turn order
