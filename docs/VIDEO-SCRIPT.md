# Cipher Mines: 3-minute pitch (teleprompter)

Real person on camera, own voice. Target length is 2:50 to 3:00. Screen recording of the live app for the parts marked
[SCREEN].

---

**[0:00 – 0:20] On camera**

Hi, I'm Saddam Malik.

Every on-chain game has the same problem. Everything is public.

If I hide a mine on a blockchain, you can just read it from storage.

So I built a game that only works because the blockchain _can't_ see it.

This is Cipher Mines.

---

**[0:20 – 0:50] [SCREEN] the board, idle**

It's a five by five minefield.

I pick a risk level, and seal a board.

The mines are drawn with Zama's encrypted random numbers, right on-chain.

Nobody knows where they are. Not me. Not the contract deployer. Not anyone reading the block explorer.

---

**[0:50 – 1:30] [SCREEN] open three cells**

I open a cell.

The contract checks it against the encrypted map, and the answer comes back encrypted too.

Only my wallet can decrypt it.

Safe. Plus three.

Every safe cell pays more than the one before. So the question is always the same: do I push my luck, or cash out?

One more. Safe.

And if I hit a mine, my score is wiped to zero, still under encryption.

---

**[1:30 – 2:10] [SCREEN] cash out, the three settlement steps, the revealed board**

Now I cash out.

The contract makes my score and the full map publicly decryptable.

Zama's key management network decrypts them, and the contract checks that proof on-chain before it accepts the result.

Here's the board that was hidden the whole time.

And the app checks every move I made against it. Every outcome matches.

So the odds are public, the result was private, and the round is fully verifiable.

---

**[2:10 – 2:40] On camera**

Why does this need FHE?

Without encryption, the mine map sits in storage and anyone can walk a perfect path.

With commit and reveal, whoever generates the board knows it.

With FHE, the board is generated encrypted, used encrypted, and only opened when the round is over.

---

**[2:40 – 3:00] On camera**

It's open source, with eleven tests in FHEVM mock mode, deployed on Sepolia.

The link is below.

Try it, and see how far you get on a board that nobody can see.

Thanks.
