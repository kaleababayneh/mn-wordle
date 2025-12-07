import path from 'path';
import { currentDir } from './config.js';
import { createLogger } from './logger-utils.js';
import { nativeToken } from '@midnight-ntwrk/ledger';
import { type Wallet } from '@midnight-ntwrk/wallet-api';
import { type Resource, WalletBuilder } from '@midnight-ntwrk/wallet';
import { getZswapNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { toHex } from '@midnight-ntwrk/midnight-js-utils';
import { utils } from '../../api/src/index.js';
import { type Config, StandaloneConfig } from './config.js';  // Using StandaloneConfig for local genesis
import * as Rx from 'rxjs';

const logDir = path.resolve(currentDir, '..', 'logs', 'tests', `${new Date().toISOString()}.log`);
const logger = await createLogger(logDir);

// For standalone/local development, we'll use the genesis seed
// This seed should have initial funds in the standalone environment
const GENESIS_WALLET_SEED = '0000000000000000000000000000000000000000000000000000000000000001';

let wallet: Wallet & Resource;

// Custom waitForFunds that never times out - No timeout version for testnet
const waitForFunds = async (wallet: Wallet, logger: any): Promise<bigint> => {
  let attempt = 0;
  
  while (true) {
    attempt++;
    
    try {
      // Get current state without timeout
      const state = await new Promise((resolve, reject) => {
        const subscription = wallet.state().subscribe({
          next: (state) => {
            subscription.unsubscribe();
            resolve(state);
          },
          error: (error) => {
            subscription.unsubscribe();
            reject(error);
          }
        });
        // No timeout - let it run indefinitely
      });
      
      const balance = (state as any).balances[nativeToken()] ?? 0n;
      const scanned = (state as any).syncProgress?.synced ?? 0n;
      const behind = (state as any).syncProgress?.lag?.applyGap?.toString() ?? 'unknown';
      
      console.log(`Attempt ${attempt}: Balance = ${balance}, Synced = ${scanned}, Behind = ${behind}`);
      logger.info(`Wallet processed ${scanned} indices, remaining ${behind}`);
      
      if (balance > 0n) {
        // Don't check sync status for testnet, just accept any positive balance
        console.log(`Success! Funds found: ${balance}`);
        return balance;
      }
      
      if (attempt % 3 === 0) {
        console.log(`Still waiting for funds... (${attempt} attempts)`);
        console.log('Note: In standalone mode, ensure the genesis wallet has initial funds');
      }
      
    } catch (error) {
      console.log(`Attempt ${attempt} failed: ${error}, retrying...`);
    }
    
    // Wait 3 seconds before next attempt 
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
};

// Copy the buildWalletAndWaitForFunds function adapted for testnet
const buildWalletAndWaitForFunds = async (
  { indexer, indexerWS, node, proofServer }: Config,
  logger: any,
  seed: string,
): Promise<Wallet & Resource> => {
  console.log('Building testnet wallet...');
  const wallet = await WalletBuilder.buildFromSeed(
    indexer,
    indexerWS,
    proofServer,
    node,
    seed,
    getZswapNetworkId(),
    'warn',
  );
  wallet.start();
  const state = await Rx.firstValueFrom(wallet.state());
  logger.info(`Your wallet seed is: ${seed}`);
  logger.info(`Your wallet address is: ${state.address}`);
  let balance = state.balances[nativeToken()];
  if (balance === undefined || balance === 0n) {
    logger.info(`Your wallet balance is: 0`);
    logger.info(`Waiting to receive tokens...`);
    logger.info(`Note: On testnet, you may need to request tokens from a faucet`);
    balance = await waitForFunds(wallet, logger);
  }
  logger.info(`Your wallet balance is: ${balance}`);
  return wallet;
};

async function sendNativeToken(address: string, amount: bigint): Promise<string> {
  const transferRecipe = await wallet.transferTransaction([
    {
      amount,
      receiverAddress: address,
      type: nativeToken(),
    },
  ]);
  const transaction = await wallet.proveTransaction(transferRecipe);
  return await wallet.submitTransaction(transaction);
}

async function main() {
  try {
    // Use StandaloneConfig for local development with genesis funds
    const config = new StandaloneConfig();
    config.setNetworkId(); // Important: Set the network ID to Undeployed
    
    console.log('Using standalone configuration:');
    console.log(`Indexer: ${config.indexer}`);
    console.log(`IndexerWS: ${config.indexerWS}`);
    console.log(`Node: ${config.node}`);
    console.log(`Proof Server: ${config.proofServer}`);
    
    wallet = await buildWalletAndWaitForFunds(config, logger, GENESIS_WALLET_SEED);
    
    // Get balance before transfer
    const stateBefore = await Rx.firstValueFrom(wallet.state());
    const balanceBefore = stateBefore.balances[nativeToken()] ?? 0n;
    
    console.log(`\n=== TRANSFER DETAILS ===`);
    console.log(`Balance before transfer: ${balanceBefore} wei`);
    console.log(`Balance before transfer: ${Number(balanceBefore) / 1e18} tokens`);
    
    // For standalone, transfer a substantial amount for development
    const oneTokenInWei = 1000000000000000000n; // 1 token = 1 * 10^18 wei
    let transferAmount: bigint;
    
    if (balanceBefore >= oneTokenInWei) { 
      // If we have at least 1 token, transfer exactly 1 token
      transferAmount = oneTokenInWei;
      console.log(`\nTransferring: ${transferAmount} wei`);
      console.log(`Transferring: 1.0 full token`);
    } else if (balanceBefore > 100000000000000000n) { // If we have more than 0.1 tokens
      // Transfer half of what we have
      transferAmount = balanceBefore / 2n; 
      console.log(`\nTransferring: ${transferAmount} wei`);
      console.log(`Transferring: ${Number(transferAmount) / 1e18} tokens (50% of balance)`);
    } else {
      // Transfer 90% of whatever we have (for very small balances)
      transferAmount = (balanceBefore * 90n) / 100n;
      console.log(`\nTransferring: ${transferAmount} wei`);
      console.log(`Transferring: ${Number(transferAmount) / 1e18} tokens (90% of balance)`);
      console.log(`⚠️  Note: Genesis wallet balance is lower than expected`);
    }
    
    console.log('Starting native token transfer...');
    console.log('Sending native tokens...');
    
    const txHash = await sendNativeToken(
      'mn_shield-addr_undeployed1drcg3qyr2dkekh82t8pqv0ggvq6w7uxuvrj7rj2mcfshcmf4k93sxqxlwllk6h6xugqlck6g8f87h2dmdrxx8tgvlkyds3quk0gqm9q3mct5f2rt', // Target undeployed address
      transferAmount,
    );
    
    console.log('Native token transfer completed. Transaction hash:', txHash);
    logger.info(`Native token funding transaction: ${txHash}`);
    
    // Wait for transaction to be processed
    console.log('\nWaiting for transaction to be processed...');
    await new Promise(resolve => setTimeout(resolve, 10000)); // Longer wait for testnet
    
    // Check balance after transfer
    const stateAfter = await Rx.firstValueFrom(wallet.state());
    const balanceAfter = stateAfter.balances[nativeToken()] ?? 0n;
    
    console.log(`\n=== TRANSFER RESULTS ===`);
    console.log(`Balance before: ${balanceBefore} wei`);
    console.log(`Balance after:  ${balanceAfter} wei`);
    console.log(`Amount transferred: ${balanceBefore - balanceAfter} wei`);
    console.log(`\nIn tokens:`);
    console.log(`Balance before: ${Number(balanceBefore) / 1e18} tokens`);
    console.log(`Balance after:  ${Number(balanceAfter) / 1e18} tokens`);
    console.log(`Amount transferred: ${Number(balanceBefore - balanceAfter) / 1e18} tokens`);
    
  } catch (error) {
    console.error('Error during token transfer:', error);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage.includes('No space left on device') || errorMessage.includes('ENOSPC')) {
      console.log('\n⚠️  Disk space issue detected. Please free up disk space and try again.');
    } else if (errorMessage.includes('Not sufficient funds')) {
      console.log('\n⚠️  Insufficient funds. In standalone mode, you may need to:');
      console.log('1. Ensure the standalone environment is running with genesis funds');
      console.log('2. Check that the genesis seed has been properly funded');
      console.log('3. Verify the standalone network is properly initialized');
    }
    
    logger.error(`Token transfer failed: ${String(error)}`);
  } finally {
    // Cleanup
    if (wallet) {
      try {
        await wallet.close();
        console.log('\nWallet connection closed');
      } catch (e) {
        console.error('Error closing wallet:', e);
      }
    }
  }
}

// Run the main function
main().catch(console.error);
