# Cipher Mines: 3-minute pitch (teleprompter)

**Length limit (Season 5 form):** maximum **3 minutes**. Aim for **2:40–2:55** so a short intro sting or a slow sentence
does not push you over. Real person on camera, your own voice. **AI-generated video or voice will not be considered.**

**Preferred upload (form):** post the video on X and use that X link as the "Video pitch" field. Otherwise YouTube or
Loom only. Hosts other than X, YouTube, or Loom will not be considered.

**Sepolia is required for the play-through.** Judging asks whether a full round works end-to-end on Sepolia. Do not
record the scored play-through on the practice table. The practice table is off-chain and is already labelled as such in
the app. You can mention it in one sentence; do not use it as the demo.

Record only after the contract is on Sepolia, the frontend is pointed at that address (GitHub Pages `CONTRACT_ADDRESS`),
and a player wallet has a little Sepolia ETH. See `docs/SEPOLIA.md`. Do not use the deployer mnemonic on camera, and do
not show seed phrases, private keys, or recovery screens.

---

## Timed table

| Time      | On screen                                                                                                                                                                                                                     | Say (English)                                                                                                                                                                                                                                                                                                                                                                                                         | Needs Sepolia?                             |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 0:00–0:20 | You, on camera. App idle in the background is fine.                                                                                                                                                                           | Hi, I'm Saddam Malik. Every on-chain game has the same problem. Everything is public. If I hide a mine on a blockchain, you can just read it from storage. So I built a game that only works because the blockchain can't see it. This is Cipher Mines.                                                                                                                                                               | No                                         |
| 0:20–0:50 | **[SCREEN]** Live Sepolia app, idle 5×5 board. Pick a risk level (Medium is a good demo). Click to seal the board. Show the wallet confirm, then the collapsing hero and the sealed board.                                    | It's a five by five minefield. I pick a risk level and seal a board. The mines are drawn with Zama's encrypted random numbers, right on-chain. Nobody knows where they are. Not me. Not the contract deployer. Not anyone reading the block explorer.                                                                                                                                                                 | **Yes** — `startRound` tx                  |
| 0:50–1:30 | **[SCREEN]** Open three cells, slowly. Show the encrypted check, the user-decryption prompt if it appears (one EIP-712 signature per session), the custom safe mark, and the rising score in the ledger.                      | I open a cell. The contract checks it against the encrypted map, and the answer comes back encrypted too. Only my wallet can decrypt it. Safe. Plus three. Every safe cell pays more than the one before. So the question is always the same: do I push my luck, or cash out? One more. Safe. If I hit a mine, my score is wiped to zero, still under encryption.                                                     | **Yes** — `openCell` txs + user decryption |
| 1:30–2:10 | **[SCREEN]** Cash out. Show the three settlement steps, the KMS / public decryption wait, `settle`, the revealed board, and the automatic "every move matches" check. Cut to the contract on the Sepolia explorer if it fits. | Now I cash out. The contract makes my score and the full map publicly decryptable. Zama's key management network decrypts them, and the contract checks that proof on-chain before it accepts the result. Here's the board that was hidden the whole time. And the app checks every move I made against it. Every outcome matches. So the odds are public, the result was private, and the round is fully verifiable. | **Yes** — `cashOut`, KMS, `settle`         |
| 2:10–2:40 | You, on camera.                                                                                                                                                                                                               | Why does this need FHE? Without encryption, the mine map sits in storage and anyone can walk a perfect path. With commit and reveal, whoever generates the board knows it. With FHE, the board is generated encrypted, used encrypted, and only opened when the round is over.                                                                                                                                        | No                                         |
| 2:40–2:55 | You, on camera. Brief cut to the live URL / source / footer is optional.                                                                                                                                                      | It's open source, with eleven tests in FHEVM mock mode, deployed on Sepolia. The link is below. Try it, and see how far you get on a board that nobody can see. Thanks.                                                                                                                                                                                                                                               | Mention Sepolia; no new tx needed          |

If a cell is a mine during the recording, do not restart in a panic. Show the encrypted wipe to zero, cash out or settle
the busted round, then either show a second short safe path or use the revealed board to make the fairness point. Keep
the total under 3:00.

---

## Recording steps

1. Wait until Sepolia is live: contract verified, Pages rebuild with `VITE_CONTRACT_ADDRESS`, and a **player** wallet
   (not the deployer) has enough Sepolia ETH for one full round (start, a few cells, cash out, settle).
   `docs/SEPOLIA.md` estimates about 1.7 M gas for a full round, plus the deploy is separate and already done by then.
2. Do a silent rehearsal on the live app so MetaMask is already on Sepolia, the EIP-712 decrypt signature is out of the
   way if you want, and you know the board flow. A fresh signature on camera is also fine.
3. Put this script in a teleprompter or a second monitor. Speak slightly slower than usual.
4. Record the on-camera parts (0:00–0:20, 2:10–2:55) in one take if you can. Then record the screen portion (0:20–2:10)
   as a separate take: browser full screen, 1920×1080 or 1280×720, no other tabs, no notifications, no wallet seed or
   account-switch menus with extra addresses you do not want public.
5. Edit the camera and screen takes together. No AI voiceover, no AI avatar, no stock "AI presenter." A simple cut and
   your own mic are enough. Add the live URL and the GitHub URL as end cards or in the X post, not as a long on-screen
   crawl that eats time.
6. Watch the cut once with a timer. If it is over 3:00, trim pauses, not explanations. Export and upload (X first, else
   YouTube or Loom).
7. Send the draft to yourself and review it before the X post and before the form is submitted. The form cannot be
   edited after submit.

## What does not need Sepolia

The opening and closing face-to-camera segments, and the FHE explanation, can be recorded earlier. They should still be
cut together with a **Sepolia** play-through before the video is published.
