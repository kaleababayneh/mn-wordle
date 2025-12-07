**Midnight(ZK) Wordle**

**a peer to peer zero knowledge based wordle game**

**Midnight(ZK) Wordle** is a peer-to-peer Wordle game where two players set a secret word for each other to guess and continue playing until one of them correctly guesses the other’s word. The game logic is implemented in Compact, making it secure and resistant to tampering or attacks.

**Zero-knowledge proofs** aren’t just an added feature here — without them, this game wouldn’t be possible. Each player’s secret word, along with its private salt, never leaves their device. This differs from simply hashing a word and committing the hash on-chain, which would still be vulnerable to offline dictionary brute-force attacks. In ZK Wordle, zero-knowledge ensures that a guess can be verified by the word setter as correct or incorrect **without revealing the actual word** in a real time. More technical details of the implementation are explained below.

**Why Zero Knowledge?**

Zero-knowledge (ZK) is one of the most fascinating cryptographic techniques to date. It has gained significant attention for solving both **scalability** and **privacy** challenges in blockchain. While most current use cases focus on scalability, only a small fraction leverage ZK for privacy — and even then, primarily for **financial transactions** . However, zero-knowledge has far broader potential applications, many of which remain unexplored beyond on-chain finance.

**ZK in Gaming**

In gaming, some projects already employ ZK, but often only to verify the **final result** , leaving intermediate steps unverified. This approach works for single-player games where only the outcome matters. Peer to Peer **Wordle** , however, is different — and in a **peer-to-peer** setting, every step matters. Two players compete while trusting neither the other nor a third party.

In ZK Wordle, zero-knowledge isn’t a “bonus privacy feature” — it’s **essential** . Without it, hashing words would be insecure or the verification of guesses will be reliant in the honest behavior of the opponent player. Here, each word is hashed together with a **secret salt** , and both remain private on the player’s device. When a player submits a guess, their opponent generates a **zero-knowledge proof** and verifies it on-chain without leaking any part of their secret word or salt.

## Deployment and Next Steps

The game is currently deployed on the Midnight Undeployed network.

- For testing, use Undeployed or update `main.tsx` to `setNetworkId(NetworkId.TestNet)` if needed.
- Due to recent testnet faucet issues, prefer Undeployed and fund your Undeployed wallet using the funding script in `wordle-cli`.
- Ensure your Lace wallet is connected to the Midnight Undeployed network.


✅ **In short:** ZK Wordle reimagines a simple word game as a fully trustless, verifiable peer-to-peer experience. Every guess is provably correct, every word stays private, and the blockchain ensures fairness — all powered by zero-knowledge proofs.

---

## 📦 Installation & Setup

### Prerequisites

- **Node.js** v22.x or later
- **npm** or **yarn**
- **Midnight Lace Wallet** (for testnet interaction)
- **Docker & Docker Compose** (for local development)

### 1. Clone & Install

```bash
git clone <repository-url>
cd mn-wordle
npm install
```

### 2. Install Workspace Dependencies

```bash
# Install dependencies for all packages
npm run install

# Or install individually
cd frontend && npm install
cd wordle-cli && npm install
cd api && npm install
cd contract && npm install
```

---

## 🎯 Development Modes

### Local Development (Standalone)

For local development with genesis funds and undeployed addresses:

```bash

# 1. Compile and build the contract
cd contract
npm run compact
npm run build
for testing: npm run test

# 2. Build the api
cd api
npm run build

# 3. Build the cli
cd wordle-cli
npm run build
npm run testnet-remote


```

### Testnet Development

For testnet interaction with real Midnight testnet:

```bash
# 1. Start frontend in testnet mode
cd frontend
npm run build
npm run start

# 2. Connect Midnight Lace wallet to testnet
# 3. Use testnet addresses (mn_shield-addr_test...)
```

---

## 🖥️ Frontend

### Features

- 🎨 **Modern UI** with Material-UI and dark theme
- 🎉 **Confetti effects** for winners/losers
- 📱 **Responsive design** for all devices
- 🔗 **Share functionality** with contract address sharing
- 🎯 **Real-time game state** updates

### Environment Configuration

Create `.env.testnet` for testnet configuration:

```env
VITE_NETWORK_ID=TestNet
VITE_LOGGING_LEVEL=info
```

---

## ⚡ CLI Tool

### Available Commands

```bash
cd wordle-cli

# Local development
npm run standalone      # Start local Midnight network
npm run testnet-local   # Local testnet environment

# Testnet interaction  
npm run testnet-remote  # Connect to remote testnet

# Wallet management
npx tsx src/fund-wallet.test.ts  # Fund addresses
```

### CLI Features

- 🔧 **Network management** (standalone, testnet-local, testnet-remote)
- 💰 **Wallet funding** for development
- 🎮 **Game automation** and testing
- 📊 **Network monitoring** and debugging

---

## Contract Testing

```bash
cd contract
npm run build
npm run test          # Run contract tests
```



---

## 🛠️ Architecture

### Components

- **Frontend**: React + TypeScript + Material-UI + Vite
- **CLI**: Node.js + TypeScript for network management
- **API**: Midnight SDK integration layer
- **Contract**: Compact smart contract for game logic

### Network Modes

- **Undeployed**: Local development with genesis funds
- **TestNet**: Remote testnet for testing

### Address Formats

- **Undeployed**: `mn_shield-addr_undeployed...` (local)
- **TestNet**: `mn_shield-addr_test...` (testnet)

---

Game Rules

1. Each player sets a secret 5-letter word
2. Players take turns guessing each other's words
3. After each guess, receive feedback (correct letters, positions)
4. First player to guess correctly wins
5. All verification happens on-chain with zero-knowledge proofs

### Technical Details

- **Zero-Knowledge Proofs**: Word verification without revelation
- **On-Chain State**: Game progress stored on Midnight blockchain
- **Private State**: Secret words never leave your device
- **Cryptographic Security**: Protected against dictionary attacks

---

**🎮 Happy ZK Gaming!** 🚀
