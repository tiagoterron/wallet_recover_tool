//node ./recover.js  0 300000
const ethers = require('ethers');
const fs = require('fs');
const dotenv = require('dotenv')
dotenv.config()

// Configuration
const CONFIG = {
    RPC_URL: process.env.RPC, 
    MAIN_WALLET_ADDRESS: process.env.WALLET,
    GAS_LIMIT: 21000,
    FILE: './wallets.json',
    BATCH_SIZE: 2500, // Process 5 wallets at a time
    DELAY_MS: 100, // Delay between batches
    BALANCE_CHECK_BATCH_SIZE: 20000,
    MIN_ETH: ethers.utils.parseUnits("0.0000001", 18)
};

// Initialize provider
const provider = new ethers.providers.JsonRpcProvider(CONFIG.RPC_URL);

const BALANCE_CHECKER_ADDRESS = "0x3040c40D66cfac7C03E3aAF57f16E9C40Be4Eab8";
const BALANCE_CHECKER_ABI = [
    "function getEthBalances(address[] calldata wallets) external view returns (uint256[] memory balances)",
    "function getMultipleTokenBalances( address[] calldata tokens, address[] calldata wallets) external view returns (uint256[][] memory balances) ",
    "function getTokenBalances(address token,address[] calldata wallets) external view returns (uint256[] memory balances)"
];

// Updated filter function to check both ETH and token balances
async function filterWalletsWithBalance(wallets, tokenAddresses = [], batchSize = 100) {
    const balanceChecker = new ethers.Contract(BALANCE_CHECKER_ADDRESS, BALANCE_CHECKER_ABI, provider);
    const walletsWithBalance = [];
    
    console.log(`🔍 Checking balances for ${wallets.length} wallets via Balance Checker...`);
    if (tokenAddresses.length > 0) {
        console.log(`📊 Checking ${tokenAddresses.length} token(s): ${tokenAddresses.join(', ')}\n`);
    }
    
    for (let i = 0; i < wallets.length; i += batchSize) {
        const batch = wallets.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(wallets.length / batchSize);
        
        console.log(`Batch ${batchNum}/${totalBatches}: Checking wallets ${i} to ${i + batch.length - 1}`);
        
        try {
            const addresses = batch.map(w => w.publicKey);
            
            // Get ETH balances
            const ethBalances = await balanceChecker.getEthBalances(addresses);
            
            // Get token balances if token addresses provided
            let tokenBalancesArray = [];
            if (tokenAddresses.length > 0) {
                tokenBalancesArray = await balanceChecker.getMultipleTokenBalances(
                    tokenAddresses,
                    addresses
                );
                // console.log(tokenBalancesArray)
            }
            
            // Filter wallets with balance > 0
            let foundInBatch = 0;
            batch.forEach((wallet, index) => {
                const hasEthBalance = ethBalances[index].gt(CONFIG.MIN_ETH);
                
                // Check if wallet has any token balance
                let hasTokenBalance = false;
                const tokenBalances = {};
                
                if (tokenBalancesArray.length > 0) {
                    tokenAddresses.forEach((tokenAddr, tokenIdx) => {
                        const balance = tokenBalancesArray[tokenIdx][index];
                        if (balance.gt(ethers.utils.parseUnits('1', 18))) {
                            hasTokenBalance = true;
                            tokenBalances[tokenAddr] = ethers.utils.formatUnits(balance, 18); // Adjust decimals as needed
                        }
                    });
                }
                
                if (hasEthBalance || hasTokenBalance) {
                    const walletData = {
                        ...wallet,
                        ethBalance: ethers.utils.formatEther(ethBalances[index]),
                        tokenBalances: tokenBalances
                    };
                    
                    walletsWithBalance.push(walletData);
                    foundInBatch++;
                    
                    console.log(`  ✅ ${wallet.publicKey}:`);
                    console.log(`     ETH: ${walletData.ethBalance}`);
                    if (Object.keys(tokenBalances).length > 0) {
                        Object.entries(tokenBalances).forEach(([token, balance]) => {
                            console.log(`     Token ${token}: ${balance}`);
                        });
                    }
                }
            });
            
            if (foundInBatch === 0) {
                console.log(`  ⚠️  No wallets with balance in this batch`);
            }
            
        } catch (error) {
            console.error(`  ❌ Batch error:`, error.message);
            
            // Fallback: check individually
            console.log(`  🔄 Retrying individually...`);
            for (const wallet of batch) {
                try {
                    const ethBalance = await provider.getBalance(wallet.publicKey);
                    const tokenBalances = {};
                    
                    // Check each token individually
                    for (const tokenAddr of tokenAddresses) {
                        try {
                            const tokenContract = new ethers.Contract(
                                tokenAddr,
                                ['function balanceOf(address) view returns (uint256)'],
                                provider
                            );
                            const balance = await tokenContract.balanceOf(wallet.publicKey);
                            if (balance.gt(0)) {
                                tokenBalances[tokenAddr] = ethers.utils.formatUnits(balance, 18);
                            }
                        } catch (err) {
                            console.error(`    ❌ Token ${tokenAddr}: ${err.message}`);
                        }
                    }
                    
                    if (ethBalance.gt(0) || Object.keys(tokenBalances).length > 0) {
                        walletsWithBalance.push({
                            ...wallet,
                            ethBalance: ethers.utils.formatEther(ethBalance),
                            tokenBalances: tokenBalances
                        });
                        console.log(`  ✅ ${wallet.publicKey}:`);
                        console.log(`     ETH: ${ethers.utils.formatEther(ethBalance)}`);
                        if (Object.keys(tokenBalances).length > 0) {
                            Object.entries(tokenBalances).forEach(([token, balance]) => {
                                console.log(`     Token ${token}: ${balance}`);
                            });
                        }
                    }
                } catch (err) {
                    console.error(`  ❌ ${wallet.publicKey}: ${err.message}`);
                }
            }
        }
        
        // Delay between batches
        if (i + batchSize < wallets.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }
    
    console.log(`\n📊 Total wallets with balance: ${walletsWithBalance.length}/${wallets.length}\n`);
    return walletsWithBalance;
}

// Helper function to check specific token balances only
async function filterWalletsWithTokenBalance(wallets, tokenAddress, minBalance = 0, batchSize = 100) {
    const balanceChecker = new ethers.Contract(BALANCE_CHECKER_ADDRESS, BALANCE_CHECKER_ABI, provider);
    const walletsWithBalance = [];
    
    console.log(`🔍 Checking ${tokenAddress} balances for ${wallets.length} wallets...\n`);
    
    for (let i = 0; i < wallets.length; i += batchSize) {
        const batch = wallets.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(wallets.length / batchSize);
        
        console.log(`Batch ${batchNum}/${totalBatches}: Checking wallets ${i} to ${i + batch.length - 1}`);
        
        try {
            const addresses = batch.map(w => w.publicKey);
            const balances = await balanceChecker.getTokenBalances(tokenAddress, addresses);
            
            let foundInBatch = 0;
            batch.forEach((wallet, index) => {
                if (balances[index].gt(minBalance)) {
                    walletsWithBalance.push({
                        ...wallet,
                        tokenBalance: ethers.utils.formatUnits(balances[index], 18) // Adjust decimals as needed
                    });
                    foundInBatch++;
                    console.log(`  ✅ ${wallet.publicKey}: ${ethers.utils.formatUnits(balances[index], 18)}`);
                }
            });
            
            if (foundInBatch === 0) {
                console.log(`  ⚠️  No wallets with balance in this batch`);
            }
            
        } catch (error) {
            console.error(`  ❌ Batch error:`, error.message);
        }
        
        if (i + batchSize < wallets.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }
    
    console.log(`\n📊 Total wallets with token balance: ${walletsWithBalance.length}/${wallets.length}\n`);
    return walletsWithBalance;
}

function parseWalletsFromFile(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const wallets = [];
    
    // Try to parse the entire file as JSON first
    try {
      const jsonData = JSON.parse(fileContent);
      if (Array.isArray(jsonData)) {
        jsonData.forEach((item, index) => {
          if (Array.isArray(item) && item.length >= 2) {
            const publicKey = item[0].length === 42 ? item[0] : item[1];
            const privateKey = item[0].length === 66 ? item[0] : item[1];
            wallets.push({ publicKey, privateKey });
          }
        });
        return wallets;
      }
    } catch (e) {
      // Not valid JSON, continue
    }
    
    // Try to parse each line as a JSON array
    const lines = fileContent.split('\n').filter(line => line.trim());
    
    lines.forEach((line, lineIndex) => {
      try {
        // Check if line looks like a JSON array
        if (line.trim().startsWith('[') && line.trim().endsWith(']')) {
          const parsed = JSON.parse(line.trim());
          if (Array.isArray(parsed) && parsed.length >= 2) {
            const wallet1 = parsed[0].length === 42 ? parsed[0] : parsed[1];
            const wallet2 = parsed[0].length === 66 ? parsed[0] : parsed[1];
            wallets.push({ publicKey: wallet1[0], privateKey: wallet1[1] });
            wallets.push({ publicKey: wallet2[0], privateKey: wallet2[1] });
            return; // Successfully parsed as JSON array, skip text parsing
          }
        }
        
        // Fall back to original text parsing
        const parts = line.split(' - ').map(s => s.trim());
        
        if (parts.length < 2) {
          console.warn(`Warning: Line ${lineIndex + 1} has invalid format, skipping`);
          return;
        }
        
        const allItems = [];
        parts.forEach(part => {
          const items = part.split('-').map(s => s.trim()).filter(s => s);
          allItems.push(...items);
        });
        
        const privateKeys = allItems.filter(item => item.startsWith('0x') && item.length === 66);
        const publicKeys = allItems.filter(item => item.startsWith('0x') && item.length === 42);
        
        if (privateKeys.length > 0 && publicKeys.length > 0) {
          for (let i = 0; i < Math.min(privateKeys.length, publicKeys.length); i++) {
            wallets.push({ publicKey: publicKeys[i], privateKey: privateKeys[i] });
          }
        } else if (privateKeys.length > 0) {
          privateKeys.forEach(pk => {
            try {
              const wallet = new ethers.Wallet(pk);
              wallets.push({ publicKey: wallet.address, privateKey: pk });
            } catch (err) {
              console.warn(`Warning: Line ${lineIndex + 1} - Invalid private key`);
            }
          });
        }
      } catch (error) {
        console.warn(`Warning: Error parsing line ${lineIndex + 1}:`, error.message);
      }
    });
    
    return wallets;
  } catch (error) {
    console.error('Error reading file:', error.message);
    throw error;
  }
}

async function analyzeGasPrice() {
    try {
        const feeData = await provider.getFeeData();
        const baseFee = ethers.BigNumber.from('2189660');
        const priorityFee = ethers.BigNumber.from('2189660');
        
        // Add 10% buffer to base fee
        const adjustedBaseFee = baseFee.mul(100).div(100);
        const maxFeePerGas = adjustedBaseFee

        
        return {
            maxFeePerGas,
            maxPriorityFeePerGas: priorityFee,
            adjustedGasPrice: maxFeePerGas.div(1e9).toNumber() // Convert to gwei
        };
    } catch (error) {
        console.error('Gas price analysis failed:', error.message);
        // Fallback to 0.01 gwei
        return {
            maxFeePerGas: ethers.utils.parseUnits('0.01', 9),
            maxPriorityFeePerGas: ethers.utils.parseUnits('0.001', 9),
            adjustedGasPrice: 0.01
        };
    }
}

async function transferFromWallet(privateKey, index, total) {
    try {
        const wallet = new ethers.Wallet(privateKey, provider);
        const address = wallet.address;
        
        console.log(`\n[${index}/${total}] Processing: ${address}`);
        
        // Get balance
        const balance = await provider.getBalance(address);
        
        if (balance.eq(0)) {
            console.log(`  ⚠️  No balance, skipping ${address}`);
            return { success: false, reason: 'no_balance', address };
        }
        
        console.log(`  💰 Balance: ${ethers.utils.formatEther(balance)} ETH`);
        
        // Calculate gas cost
        const gasAnalysis = await analyzeGasPrice();
        const gasPrice = gasAnalysis.maxFeePerGas;
        const gasCost = gasPrice.mul(CONFIG.GAS_LIMIT);
        
        // Calculate transfer amount
        const transferAmount = balance.sub(gasCost).sub(1000000000);
        
        if (transferAmount.lte(0)) {
            console.log(`  ⚠️  Insufficient balance for gas, skipping`);
            return { success: false, reason: 'insufficient_for_gas', address };
        }
        
        console.log(`  📤 Transferring: ${ethers.utils.formatEther(transferAmount)} ETH`);
        console.log(`  ⛽ Gas price: ${gasAnalysis.adjustedGasPrice} gwei`);
        
        // Send transaction
        const transaction = await wallet.sendTransaction({
            to: CONFIG.MAIN_WALLET_ADDRESS,
            value: transferAmount,
            gasLimit: CONFIG.GAS_LIMIT,
            maxFeePerGas: gasAnalysis.maxFeePerGas,
            maxPriorityFeePerGas: gasAnalysis.maxPriorityFeePerGas
        });
        
        console.log(`  ⏳ Waiting for confirmation... TX: ${transaction.hash}`);
        
        const receipt = await transaction.wait();
        
        if (receipt.status === 1) {
            const actualGasCost = gasPrice.mul(receipt.gasUsed);
            console.log(`  ✅ Success!`);
            console.log(`  💸 Transferred: ${ethers.utils.formatEther(transferAmount)} ETH`);
            console.log(`  ⛽ Gas used: ${ethers.utils.formatEther(actualGasCost)} ETH`);
            
            return {
                success: true,
                address,
                txHash: receipt.transactionHash,
                transferred: ethers.utils.formatEther(transferAmount),
                gasCost: ethers.utils.formatEther(actualGasCost)
            };
        } else {
            throw new Error('Transaction failed');
        }
        
    } catch (error) {
        console.log(`  ❌ Error: ${error.message}`);
        return { success: false, reason: error.message, address: 'unknown' };
    }
}

async function processBatch(wallets, startIndex, batchSize) {
    const batch = wallets.slice(startIndex, startIndex + batchSize);
    const promises = batch.map((wallet, i) => 
        transferFromWallet(wallet.privateKey, startIndex + i + 1, wallets.length)
    );
    return await Promise.all(promises);
}

async function main() {

    console.log('🚀 Starting wallet sweep...\n');
    console.log(`Main wallet: ${CONFIG.MAIN_WALLET_ADDRESS}`);
    console.log(`RPC: ${CONFIG.RPC_URL}\n`);
    const ini = process.argv[2]
    const end = process.argv[3]

    // Read wallets from JSON
    const allWallets = JSON.parse(fs.readFileSync(CONFIG.FILE, 'utf8')).slice(ini, end) 
    console.log(`📋 Loaded ${allWallets.length} wallets\n`);
    

    // Filter wallets with balance using balance checker contract
    // const walletsData = await filterWalletsWithBalance(allWallets, CONFIG.BALANCE_CHECK_BATCH_SIZE);

    const KEPT = '0x8a9430e92153c026092544444cBb38077e6688D1';
    const KIKI = '0xc849418f46A25D302f55d25c40a82C99404E5245';
    const PITTY = '0x5A8F95B20F986E31Dda904bc2059b21D5Ad8A66c';
    const SECUYA = '0x623cD3a3EdF080057892aaF8D773Bbb7A5C9b6e9';
    const BONK = '0x2Dc1C8BE620b95cBA25D78774F716F05B159C8B9';

    const walletsData = await filterWalletsWithBalance(
        allWallets,
        [KEPT, KIKI, SECUYA, PITTY, BONK], // Check both USDT and USDC
        CONFIG.BATCH_SIZE // batch size
    );
    
    if (walletsData.length === 0) {
        console.log('⚠️  No wallets with balance found. Exiting.');
        return;
    }
    
    console.log(`💰 Starting transfer for ${walletsData.length} wallets...\n`);
    // return

    const results = {
        successful: [],
        failed: [],
        skipped: []
    };
   
    // Process in batches
    for (let i = 0; i < walletsData.length; i += CONFIG.BATCH_SIZE) {
        const batchResults = await processBatch(walletsData, i, CONFIG.BATCH_SIZE);
        
        batchResults.forEach(result => {
            if (result.success) {
                results.successful.push(result);
            } else if (result.reason === 'no_balance' || result.reason === 'insufficient_for_gas') {
                results.skipped.push(result);
            } else {
                results.failed.push(result);
            }
        });
        
        // Delay between batches
        if (i + CONFIG.BATCH_SIZE < walletsData.length) {
            console.log(`\n⏸️  Waiting ${CONFIG.DELAY_MS}ms before next batch...\n`);
            await new Promise(resolve => setTimeout(resolve, CONFIG.DELAY_MS));
        }
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Successful transfers: ${results.successful.length}`);
    console.log(`⚠️  Skipped (no balance/gas): ${results.skipped.length}`);
    console.log(`❌ Failed: ${results.failed.length}`);
    
    if (results.successful.length > 0) {
        const totalTransferred = results.successful.reduce((sum, r) => 
            sum + parseFloat(r.transferred), 0
        );
        const totalGas = results.successful.reduce((sum, r) => 
            sum + parseFloat(r.gasCost), 0
        );
        console.log(`\n💰 Total transferred: ${totalTransferred.toFixed(6)} ETH`);
        console.log(`⛽ Total gas cost: ${totalGas.toFixed(6)} ETH`);
    }
    
    // Save detailed results
    fs.writeFileSync(
        'sweep_results.json',
        JSON.stringify(results, null, 2)
    );
    console.log(`\n📄 Detailed results saved to sweep_results.json`);
}

main().catch(console.error);