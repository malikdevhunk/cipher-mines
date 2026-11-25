import { BrowserProvider, Contract, type Eip1193Provider, type JsonRpcSigner } from "ethers";
import abi from "../abi.json";
import { CONTRACT_ADDRESS, EXPLORER, SEPOLIA_CHAIN_ID, type Risk } from "../config";
import type { GameEngine, LeaderRow, Logger, Settlement, StepResult } from "./types";

declare global {
  interface Window {
    ethereum?: Eip1193Provider & { on?: (e: string, f: (...a: unknown[]) => void) => void };
  }
}

const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;
const DECRYPT_DAYS = 1;

/**
 * Sepolia engine: talks to CipherMines through the user's wallet and to Zama's relayer through
 * the official @zama-fhe/relayer-sdk. Every outcome is decrypted client-side with a one-time EIP-712
 * signature; the board is only ever decrypted publicly after cash-out.
 */
export async function createChainEngine(log: Logger): Promise<GameEngine> {
  if (!window.ethereum) throw new Error("No browser wallet found. Install MetaMask or Rabby to play on Sepolia.");
  if (!CONTRACT_ADDRESS) throw new Error("This build has no Sepolia contract address yet.");

  await window.ethereum.request({ method: "eth_requestAccounts" });
  const chainHex = "0x" + SEPOLIA_CHAIN_ID.toString(16);
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainHex }] });
  } catch {
    throw new Error("Please switch your wallet to the Sepolia test network.");
  }
  const provider = new BrowserProvider(window.ethereum);
  const signer: JsonRpcSigner = await provider.getSigner();
  const account = await signer.getAddress();
  const game = new Contract(CONTRACT_ADDRESS, abi, signer);

  log({ kind: "info", text: "loading Zama relayer SDK (WASM)…" });
  const sdk = await import("@zama-fhe/relayer-sdk/web");
  await sdk.initSDK();
  const fhe = await sdk.createInstance({ ...sdk.SepoliaConfig, network: window.ethereum });
  log({ kind: "ok", text: "FHE instance ready · Sepolia" });

  // One EIP-712 signature per session authorises user-decryption of this contract's handles.
  let session: { pub: string; priv: string; sig: string; start: number } | null = null;
  async function decrypt(handles: string[]) {
    if (!session) {
      const kp = fhe.generateKeypair();
      const start = Math.floor(Date.now() / 1000);
      const eip = fhe.createEIP712(kp.publicKey, [CONTRACT_ADDRESS], start, DECRYPT_DAYS);
      log({ kind: "info", text: "sign once to read your own ciphertexts" });
      const sig = await signer.signTypedData(
        eip.domain as never,
        { UserDecryptRequestVerification: eip.types.UserDecryptRequestVerification as never },
        eip.message as never,
      );
      session = { pub: kp.publicKey, priv: kp.privateKey, sig, start };
    }
    const res = await fhe.userDecrypt(
      handles.map((handle) => ({ handle, contractAddress: CONTRACT_ADDRESS })),
      session.priv,
      session.pub,
      session.sig.replace(/^0x/, ""),
      [CONTRACT_ADDRESS],
      account,
      session.start,
      DECRYPT_DAYS,
    );
    return handles.map((h) => res[h as `0x${string}`]);
  }

  async function send(label: string, p: Promise<{ hash: string; wait: () => Promise<unknown> }>) {
    const tx = await p;
    log({ kind: "tx", text: `${label} · ${short(tx.hash)}`, href: `${EXPLORER}/tx/${tx.hash}` });
    await tx.wait();
    return tx.hash;
  }

  return {
    kind: "sepolia",
    account,
    async resume() {
      const r = await game.getRound(account);
      if (Number(r.status) !== 1) return null;
      const opened: number[] = [];
      for (let i = 0; i < 25; i++) if ((Number(r.opened) >>> i) & 1) opened.push(i);
      if (opened.length === 0) return { risk: Number(r.risk) as Risk, opened, alive: true, score: 0 };
      const h = await game.getHandles(account);
      const [alive, score] = await decrypt([h.alive, h.score]);
      return { risk: Number(r.risk) as Risk, opened, alive: Boolean(alive), score: Number(score) };
    },
    async start(risk) {
      await send("startRound", game.startRound(risk));
      const h = await game.getHandles(account);
      log({ kind: "fhe", text: `board sealed · ${short(h.board)}` });
      return { boardHandle: h.board as string };
    },
    async open(cell): Promise<StepResult> {
      await send(`openCell(${cell})`, game.openCell(cell));
      const h = await game.getHandles(account);
      log({ kind: "fhe", text: `outcome ebool ${short(h.lastHit)}` });
      const [hit, alive, score] = await decrypt([h.lastHit, h.alive, h.score]);
      return { cell, hit: Boolean(hit), alive: Boolean(alive), score: Number(score), handle: h.lastHit };
    },
    async cashOut(onPhase): Promise<Settlement> {
      onPhase("request");
      await send("cashOut", game.cashOut());
      const h = await game.getHandles(account);
      onPhase("decrypt");
      log({ kind: "kms", text: "requesting public decryption from the KMS…" });
      const pub = await fhe.publicDecrypt([h.score, h.board]);
      onPhase("verify");
      const txHash = await send(
        "settle (KMS proof)",
        game.settle(account, pub.abiEncodedClearValues, pub.decryptionProof),
      );
      const r = await game.getRound(account);
      return { board: Number(r.revealedBoard), score: Number(r.finalScore), txHash, verified: true };
    },
    async leaderboard(): Promise<LeaderRow[]> {
      const rows = await game.getLeaderboard();
      return rows.map((e: { player: string; score: bigint; risk: bigint; steps: bigint }) => ({
        player: e.player,
        score: Number(e.score),
        risk: Number(e.risk) as Risk,
        steps: Number(e.steps),
      }));
    },
  };
}
