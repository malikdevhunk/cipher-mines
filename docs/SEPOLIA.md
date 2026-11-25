# Sepolia deployment

## What you need

- A **fresh, dedicated deployer wallet** (do not reuse a personal wallet). Store its mnemonic with
  `npx hardhat vars set MNEMONIC`; it never goes into the repo.
- About **0.05 Sepolia ETH** on account index 0 of that mnemonic. Deploying uses about 1.9 M gas. A full round (start,
  three cells, cash out, settle) uses about 1.7 M gas.
- An RPC key: `npx hardhat vars set INFURA_API_KEY` (or edit the Sepolia URL in `hardhat.config.ts`).
- Optional: `npx hardhat vars set ETHERSCAN_API_KEY` to verify the source.

## Steps

```bash
npm run compile
npm run deploy:sepolia
npx hardhat verify --network sepolia <ADDRESS>
npx hardhat --network sepolia mines:play --risk 1 --cells 12,6,18
```

Then point the frontend at the contract:

```bash
gh variable set CONTRACT_ADDRESS --body <ADDRESS>
gh workflow run pages.yml
```

Players need a little Sepolia ETH in their own wallet to play (each move is a transaction).
