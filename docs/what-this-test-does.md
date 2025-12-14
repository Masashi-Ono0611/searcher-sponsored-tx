# What This Sepolia Test Is Doing

This repo demonstrates a **sponsored transaction bundle** using Flashbots.

## The problem this pattern solves

Sometimes an account (the **executor**) has valuable assets (ERC20 / ERC721), but it cannot safely receive ETH for gas.

Example reason:

- The executor private key is compromised
- Any ETH sent to that account would be quickly stolen by a sweeper bot

## The solution: a bundle with funding + execution

Instead of sending ETH to the executor in a normal transaction, we send a **bundle**:

1. **Sponsor transaction**
   - The sponsor sends ETH to the executor
   - This ETH is only available inside the same block if the bundle is included

2. **Executor transaction(s)**
   - The executor immediately spends that ETH on gas
   - Example in this test: transfer ERC20 tokens to a recipient

Because the funding and execution happen atomically in the same block, the executor can pay gas without leaving ETH sitting in the executor account.

## What we are testing on Sepolia

We run the repo against **Sepolia** to confirm:

- We can build a valid Flashbots bundle
- Simulation succeeds
- The bundle is eventually **included** in a Sepolia block

In this specific run:

- `ENGINE=transfererc20`
- The executor transfers the full ERC20 balance to `RECIPIENT`
- The sponsor pays the gas by funding the executor in the same bundle

## Why inclusion can take time

Even if the bundle is valid, it may not be included immediately because:

- Not every Sepolia block builder/validator may be connected to the relay
- There may be competing bundles
- Testnet conditions can be inconsistent

To improve inclusion probability, the code submits the bundle for **multiple future blocks** (`BLOCKS_TO_TARGET`).

## Why high gas/priority fee may still not include quickly

On public mempools, raising the gas price usually increases inclusion speed.
With Flashbots bundles, inclusion can still be slow even with a high priority fee because:

- The bundle is sent to a relay, and it can only be included in blocks produced by builders/validators that actually receive bundles from that relay.
- Builders may have their own policies and selection logic, and they may prefer other bundles or orderflow.
- Testnet builder/validator coverage and reliability can be lower than mainnet, so you may need to wait for a "lucky" block.

## How to know it worked

The program prints:

- `Congrats, included in <blockNumber>`

Then you can verify on a block explorer that the sponsor funding tx and the executor ERC20 transfer happened in the same block.
