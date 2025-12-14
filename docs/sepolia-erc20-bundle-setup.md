# Sepolia ERC20 Bundle Test (Setup Guide)

This guide describes a minimal, repeatable setup to run this repo on **Ethereum Sepolia** and confirm a **Flashbots bundle inclusion**.

## What you will do

- Configure `.env`
- Run the searcher
- Wait until the logs show the bundle was included
- Verify inclusion on a block explorer

## Prerequisites

- Node.js + npm
- A Sepolia RPC URL (example: Alchemy)
- Test accounts and funds on Sepolia

## 0) Security notes

- **Do not commit `.env`**. This repo ignores it via `.gitignore`.
- Use **testnet-only keys**.

## 1) Install dependencies

```sh
npm install
```

If you want to avoid running lifecycle scripts:

```sh
npm install --ignore-scripts
```

## 2) Prepare accounts (EOAs)

You need:

- **Executor EOA** (`PRIVATE_KEY_EXECUTOR`)
  - Must hold the ERC20 you want to transfer (e.g. Sepolia USDC)
  - Does not need ETH initially
- **Sponsor EOA** (`PRIVATE_KEY_SPONSOR`)
  - Must hold Sepolia ETH
  - Funds the executor inside the bundle so the executor can pay gas
- **Recipient address** (`RECIPIENT`)
  - Receives the ERC20 from the executor
  - Can be the sponsor address if you want to keep it simple

You also need:

- **Relay signing key** (`FLASHBOTS_RELAY_SIGNING_KEY`)
  - Used to sign requests to the Flashbots relay
  - Can be a separate key (recommended) or the same as sponsor (simple)

## 3) Configure `.env`

Copy `.env.sample` into `.env` and fill values:

```sh
cp .env.sample .env
```

Required keys for Sepolia ERC20 transfer:

- `NETWORK=sepolia`
- `ETHEREUM_RPC_URL=<your Sepolia RPC URL>`
- `FLASHBOTS_RELAY_URL=https://relay-sepolia.flashbots.net`
- `ENGINE=transfererc20`
- `ERC20_TOKEN_ADDRESS=<Sepolia ERC20 address>`
- `PRIVATE_KEY_EXECUTOR=0x...`
- `PRIVATE_KEY_SPONSOR=0x...`
- `RECIPIENT=0x...`
- `FLASHBOTS_RELAY_SIGNING_KEY=0x...`

Tuning knobs:

- `BLOCKS_TO_TARGET=50` (higher can improve inclusion probability on testnets)
- `PRIORITY_FEE_GWEI=20` (priority fee; can be increased if desired)

Example for Sepolia USDC (Circle official address at time of writing):

```sh
ENGINE=transfererc20
ERC20_TOKEN_ADDRESS=0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238
```

## 4) Run

```sh
npm run start
```

Expected logs:

- Executor/Sponsor addresses
- Network and relay
- Repeated attempts targeting future blocks

Success looks like:

- `Congrats, included in <blockNumber>`

## 5) Verify on a block explorer

When included, verify both happened in the same block:

- `sponsor -> executor` ETH transfer (funding tx)
- `executor -> recipient` ERC20 transfer

Use Sepolia Etherscan or another explorer.

## Troubleshooting

- If you see `Must provide ...` errors
  - Your `.env` is missing variables or has trailing comments/spaces
- If you see many `Not included in ...`
  - This is normal on Sepolia
  - Increase `BLOCKS_TO_TARGET`
  - Try adjusting `PRIORITY_FEE_GWEI`
- If you see RPC `429` or rate limit errors
  - Reduce `BLOCKS_TO_TARGET`
  - Use a higher-tier RPC plan
