**ZK Wordle**

**a peer to peer zero knowledge based wordle game**

**ZK Wordle** is a peer-to-peer Wordle game where two players set a secret word for each other to guess and continue playing until one of them correctly guesses the other’s word. The game logic is implemented in Compact, making it secure and resistant to tampering or attacks.

**Zero-knowledge proofs aren’t just an added feature here — without them, this game wouldn’t be possible. Each player’s secret word, along with its private salt, never leaves their device. This differs from simply hashing a word and committing the hash on-chain, which would still be vulnerable to offline dictionary brute-force attacks. In ZK Wordle, zero-knowledge ensures that a guess can be verified by the word setter as correct or incorrect ****without revealing the actual word** in a real time. More technical details of the implementation are explained below.

**Why Zero Knowledge?**

**Zero-knowledge (ZK) is one of the most fascinating cryptographic techniques to date. It has gained significant attention for solving both ****scalability** and **privacy** challenges in blockchain. While most current use cases focus on scalability, only a small fraction leverage ZK for privacy — and even then, primarily for **financial transactions** . However, zero-knowledge has far broader potential applications, many of which remain unexplored beyond on-chain finance.

**ZK in Gaming**

**In gaming, some projects already employ ZK, but often only to verify the ****final result** , leaving intermediate steps unverified. This approach works for single-player games where only the outcome matters. Peer to Peer **Wordle** , however, is different — and in a **peer-to-peer** setting, every step matters. Two players compete while trusting neither the other nor a third party.

**In ZK Wordle, zero-knowledge isn’t a “bonus privacy feature” — it’s ****essential** . Without it, hashing words would be insecure or the verification of guesses will be reliant in the honest behavior of the opponent player. Here, each word is hashed together with a **secret salt** , and both remain private on the player’s device. When a player submits a guess, their opponent generates a **zero-knowledge proof** and verifies it on-chain without leaking any part of their secret word or salt.

**Deployment and Next Steps**

**The game is currently deployed on the Midnight testnet. 👉 Please make sure you are connected to the Midnight testnet network on Lace wallet.**

**✅ ****In short:** ZK Wordle reimagines a simple word game as a fully trustless, verifiable peer-to-peer experience. Every guess is provably correct, every word stays private, and the blockchain ensures fairness — all powered by zero-knowledge proofs.
