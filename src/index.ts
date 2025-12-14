import {
  FlashbotsBundleProvider, FlashbotsBundleRawTransaction,
  FlashbotsBundleResolution,
  FlashbotsBundleTransaction
} from "@flashbots/ethers-provider-bundle";
import { BigNumber, providers, Wallet } from "ethers";
import { Base } from "./engine/Base";
import { checkSimulation, gasPriceToGwei, printTransactions } from "./utils";
import { Approval721 } from "./engine/Approval721";

require('log-timestamp');
require('dotenv/config');

const BLOCKS_IN_FUTURE = 2;
const BLOCKS_TO_TARGET = parseInt(process.env.BLOCKS_TO_TARGET || "10", 10);

const GWEI = BigNumber.from(10).pow(9);
const PRIORITY_FEE_GWEI = BigNumber.from(process.env.PRIORITY_FEE_GWEI || "31");
const PRIORITY_GAS_PRICE = PRIORITY_FEE_GWEI.mul(GWEI)

const PRIVATE_KEY_EXECUTOR = process.env.PRIVATE_KEY_EXECUTOR || ""
const PRIVATE_KEY_SPONSOR = process.env.PRIVATE_KEY_SPONSOR || ""
const FLASHBOTS_RELAY_SIGNING_KEY = process.env.FLASHBOTS_RELAY_SIGNING_KEY || "";
const RECIPIENT = process.env.RECIPIENT || ""

const NETWORK = (process.env.NETWORK || "sepolia").toLowerCase();
const RPC_URL = process.env.ETHEREUM_RPC_URL || "";
const FLASHBOTS_RELAY_URL = process.env.FLASHBOTS_RELAY_URL || (NETWORK === "sepolia" ? "https://relay-sepolia.flashbots.net" : "https://relay.flashbots.net");

const ENGINE = (process.env.ENGINE || "approval721").toLowerCase();
const ERC20_TOKEN_ADDRESS = process.env.ERC20_TOKEN_ADDRESS || "";
const APPROVAL721_CONTRACTS = (process.env.APPROVAL721_CONTRACTS || "").split(",").map((s) => s.trim()).filter(Boolean);

if (PRIVATE_KEY_EXECUTOR === "") {
  console.warn("Must provide PRIVATE_KEY_EXECUTOR environment variable, corresponding to Ethereum EOA with assets to be transferred")
  process.exit(1)
}
if (PRIVATE_KEY_SPONSOR === "") {
  console.warn("Must provide PRIVATE_KEY_SPONSOR environment variable, corresponding to an Ethereum EOA with ETH to pay miner")
  process.exit(1)
}
if (FLASHBOTS_RELAY_SIGNING_KEY === "") {
  console.warn("Must provide FLASHBOTS_RELAY_SIGNING_KEY environment variable. Please see https://github.com/flashbots/pm/blob/main/guides/flashbots-alpha.md")
  process.exit(1)
}
if (RECIPIENT === "") {
  console.warn("Must provide RECIPIENT environment variable, an address which will receive assets")
  process.exit(1)
}

if (RPC_URL === "") {
  console.warn("Must provide ETHEREUM_RPC_URL environment variable")
  process.exit(1)
}

async function main() {
  const walletRelay = new Wallet(FLASHBOTS_RELAY_SIGNING_KEY)

  const provider = new providers.StaticJsonRpcProvider(RPC_URL);
  const flashbotsProvider = await FlashbotsBundleProvider.create(provider, walletRelay, FLASHBOTS_RELAY_URL);

  const walletExecutor = new Wallet(PRIVATE_KEY_EXECUTOR);
  const walletSponsor = new Wallet(PRIVATE_KEY_SPONSOR);

  const block = await provider.getBlock("latest")

  let engine: Base;
  if (ENGINE === "transfererc20") {
    if (ERC20_TOKEN_ADDRESS === "") {
      console.warn("Must provide ERC20_TOKEN_ADDRESS when ENGINE=transfererc20")
      process.exit(1)
    }
    const { TransferERC20 } = await import("./engine/TransferERC20");
    engine = new TransferERC20(provider, walletExecutor.address, RECIPIENT, ERC20_TOKEN_ADDRESS);
  } else {
    if (APPROVAL721_CONTRACTS.length === 0) {
      console.warn("Must provide APPROVAL721_CONTRACTS (comma-separated) when ENGINE=approval721")
      process.exit(1)
    }
    engine = new Approval721(provider, RECIPIENT, APPROVAL721_CONTRACTS);
  }

  const sponsoredTransactions = await engine.getSponsoredTransactions();

  const gasEstimates = await Promise.all(sponsoredTransactions.map(tx =>
    provider.estimateGas({
      ...tx,
      from: tx.from === undefined ? walletExecutor.address : tx.from
    }))
  )
  const gasEstimateTotal = gasEstimates.reduce((acc, cur) => acc.add(cur), BigNumber.from(0))

  const gasPrice = PRIORITY_GAS_PRICE.add(block.baseFeePerGas || 0);
  const bundleTransactions: Array<FlashbotsBundleTransaction | FlashbotsBundleRawTransaction> = [
    {
      transaction: {
        to: walletExecutor.address,
        gasPrice: gasPrice,
        value: gasEstimateTotal.mul(gasPrice),
        gasLimit: 21000,
      },
      signer: walletSponsor
    },
    ...sponsoredTransactions.map((transaction, txNumber) => {
      return {
        transaction: {
          ...transaction,
          gasPrice: gasPrice,
          gasLimit: gasEstimates[txNumber],
        },
        signer: walletExecutor,
      }
    })
  ]
  const signedBundle = await flashbotsProvider.signBundle(bundleTransactions)
  await printTransactions(bundleTransactions, signedBundle);
  const simulatedGasPrice = await checkSimulation(flashbotsProvider, signedBundle);

  console.log(await engine.description())

  console.log(`Executor Account: ${walletExecutor.address}`)
  console.log(`Sponsor Account: ${walletSponsor.address}`)
  console.log(`Simulated Gas Price: ${gasPriceToGwei(simulatedGasPrice)} gwei`)
  console.log(`Gas Price: ${gasPriceToGwei(gasPrice)} gwei`)
  console.log(`Gas Used: ${gasEstimateTotal.toString()}`)

  console.log(`Network: ${NETWORK}`)
  console.log(`Relay: ${FLASHBOTS_RELAY_URL}`)
  console.log(`Blocks to target: ${BLOCKS_TO_TARGET}`)

  provider.on('block', async (blockNumber) => {
    const simulatedGasPrice = await checkSimulation(flashbotsProvider, signedBundle);
    const firstTargetBlockNumber = blockNumber + BLOCKS_IN_FUTURE;
    console.log(`Current Block Number: ${blockNumber},   First Target Block Number:${firstTargetBlockNumber},   gasPrice: ${gasPriceToGwei(simulatedGasPrice)} gwei`)

    for (let i = 0; i < BLOCKS_TO_TARGET; i++) {
      const targetBlockNumber = firstTargetBlockNumber + i;
      const bundleResponse = await flashbotsProvider.sendBundle(bundleTransactions, targetBlockNumber);
      if ('error' in bundleResponse) {
        throw new Error(bundleResponse.error.message)
      }
      const bundleResolution = await bundleResponse.wait()
      if (bundleResolution === FlashbotsBundleResolution.BundleIncluded) {
        console.log(`Congrats, included in ${targetBlockNumber}`)
        process.exit(0)
      } else if (bundleResolution === FlashbotsBundleResolution.BlockPassedWithoutInclusion) {
        console.log(`Not included in ${targetBlockNumber}`)
      } else if (bundleResolution === FlashbotsBundleResolution.AccountNonceTooHigh) {
        console.log("Nonce too high, bailing")
        process.exit(1)
      }
    }
  })
}

main()
