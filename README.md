# Wallet Recovery Script

A Node.js script to recover funds from multiple Ethereum/Base wallets and consolidate them into a single main wallet. The script efficiently checks wallet balances (ETH and tokens) and transfers available funds while accounting for gas costs.

## Features

- ✅ Batch balance checking using Balance Checker contract
- 💰 Support for ETH and multiple ERC-20 tokens
- ⚡ Parallel processing with configurable batch sizes
- 🛡️ Automatic gas price calculation with safety margins
- 📊 Detailed progress reporting and results summary
- 🔄 Automatic retry on batch failures

## Installation

### 1. Clone this repository

```bash
git clone https://github.com/tiagoterron/wallet_recover_tool
cd wallet_recover_tool
```

### 2. Rename the environment file

```bash
cp .env.example .env
```

### 3. Configure the `.env` file

Add your Base blockchain RPC URL and the wallet address that will receive the funds:

```bash
RPC=https://your-base-rpc-url.com
WALLET=0xYourReceiverWalletAddress
```

### 4. Install dependencies

```bash
npm install
```

### 5. Prepare your wallets file

Create a `wallets.json` file in the root folder with the following format:

```json
[
  {
    "publicKey": "0x1234567890abcdef...",
    "privateKey": "0xabcdef1234567890..."
  },
  {
    "publicKey": "0x9876543210fedcba...",
    "privateKey": "0xfedcba0987654321..."
  }
]
```

### 6. Run the script

Process wallets with a range (e.g., wallets 0 to 1000):

```bash
node script.js 0 1000
```

## Usage

### Basic Command

```bash
node script.js <start_index> <end_index>
```

**Parameters:**
- `start_index`: Starting position in the wallets array (0-based)
- `end_index`: Ending position in the wallets array (exclusive)

**Examples:**

```bash
# Process first 1000 wallets
node script.js 0 1000

# Process wallets 1000 to 2000
node script.js 1000 2000

# Process all wallets (if you have 5000)
node script.js 0 5000
```

## Configuration

Edit the `CONFIG` object in `recover.js` to customize behavior:

```javascript
const CONFIG = {
    RPC_URL: process.env.RPC,
    MAIN_WALLET_ADDRESS: process.env.WALLET,
    GAS_LIMIT: 21000,
    FILE: './wallets.json',
    BATCH_SIZE: 2500,              // Wallets processed in parallel
    DELAY_MS: 100,                 // Delay between batches
    BALANCE_CHECK_BATCH_SIZE: 20000, // Balance check batch size
    MIN_ETH: ethers.utils.parseUnits("0.0000001", 18)
};
```

## Token Support

The script checks for these tokens by default (Base Chain):
- KEPT: `0x8a9430e92153c026092544444cBb38077e6688D1`
- KIKI: `0xc849418f46A25D302f55d25c40a82C99404E5245`
- PITTY: `0x5A8F95B20F986E31Dda904bc2059b21D5Ad8A66c`
- SECUYA: `0x623cD3a3EdF080057892aaF8D773Bbb7A5C9b6e9`
- BONK: `0x2Dc1C8BE620b95cBA25D78774F716F05B159C8B9`

To add or change tokens, modify the token addresses in the `filterWalletsWithBalance()` call in the `main()` function.

## Output

The script generates:
- Real-time console output with progress
- `sweep_results.json` - Detailed results including successful transfers, failed attempts, and skipped wallets

**Console Output Example:**
```
🔍 Checking balances for 1000 wallets via Balance Checker...
Batch 1/10: Checking wallets 0 to 99
  ✅ 0x1234...5678:
     ETH: 0.0001234
     Token 0x8a94...88D1: 1000.0

💰 Starting transfer for 5 wallets...
[1/5] Processing: 0x1234...5678
  💰 Balance: 0.0001234 ETH
  📤 Transferring: 0.0001150 ETH
  ✅ Success!
```

## Security Notes

⚠️ **Important Security Considerations:**

- Never commit your `.env` file to version control
- Keep your `wallets.json` file secure and private
- Ensure your RPC endpoint is reliable and trusted
- Test with small amounts first
- Review gas prices before processing large batches

## Troubleshooting

**Issue: "Insufficient balance for gas"**
- The wallet has ETH but not enough to cover gas costs
- These wallets are automatically skipped

**Issue: RPC errors**
- Check your RPC URL in `.env`
- Verify your RPC provider has sufficient rate limits

**Issue: Transaction fails**
- Check Base Chain network status
- Verify gas prices are reasonable
- Ensure receiver wallet address is correct

## Requirements

- Node.js v14 or higher
- Active Base Chain RPC endpoint
- Wallets with recoverable funds

## Dependencies

- `ethers` v5.x
- `dotenv`

## License

MIT