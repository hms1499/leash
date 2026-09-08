# Registration

Registered with celobuilders on 2026-09-02. This file is the record of the
values the rest of the plan depends on; the authoritative copies live on
celobuilders (`GET /submissions/me`) and on Celo mainnet.

- Hackathon: `agents-at-work` (28 Aug 2026 00:00 → 14 Sep 2026 09:00 GMT)
- Primary track: `judges-favorite`
- **Tracks entered, as read back from `GET /submissions/me` 2026-09-08T08:28Z:**
  `judges-favorite`, `value-moved`, `real-world-adoption`
- **Bounties entered:** `judges-favorite`, `best-stablecoin-adoption`,
  `value-moved-1st`, `value-moved-2nd`, `best-real-world-adoption`
- `askbots-growth` — **still not entered.** "What I will demonstrate": measured
  code-quality improvement between AskBots review rounds one and two on this
  repo. Round two falls on 12–13 Sep, and the track scores the delta from round
  one, so entering late shrinks the delta.
- **Attribution tag: `celo_3dec652cd977`**
- Operator EOA (= registered `agentWalletAddress`): `0xd44daF6Db6c8057c206E6aCC27e6384B8ec850D6`
- Owner EOA: `0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57`
- ERC-8004 identity: https://8004scan.io/agents/celo/9804
  (also https://celoscan.io/nft/0x8004a169fb4a3325136eb29fa0ceb6d2e539a432/9804)
- Repo: https://github.com/hms1499/leash
- Registered at: 2026-09-02T03:22:20Z
- Submission id: `6ef3d9c0-ec73-4d90-a2cd-643cada6fa1d` (status: **published**,
  and still editable until the deadline)
- Participant id: `e430fd14-792e-40b8-b2c9-5631a383c38f`

## Why value-moved and real-world-adoption were added, 2026-09-08

Added after reading the live Dune board rather than from the spec's scoring
strategy, which says two tracks only and cites 47 of 60 projects entering three
or more and clustering in the bottom two grades. What the board actually showed:

- **38 registrations, only 9 published/eligible.** The field of real
  competitors is small.
- **Track 2 — Real World Adoption: Leash is 4th of 14, and 2nd among eligible
  projects.** Verified users 2, returning (2+ days) 2. The two projects above it
  are both `DRAFT - not eligible`. This is the one track it can place in.
- **Track 1 — Value Moved: last of 14.** Signers 0, adjusted volume 0, against
  $0.03 of independent volume. Entering changes nothing; the board already
  listed the project there before it entered, because those tables list every
  registered project with tagged activity, not only entrants.
- **Best Stablecoin Adoption: Leash does not appear at all**, though the bounty
  is entered and x402 has settled on mainnet twice. Unresolved — raise it with
  the organisers with the full transaction hashes.

The 500-character cap on `additionalTrackRationale` forced the two truncated tx
hashes out of the Best Stablecoin Adoption line. The full hashes are in
`docs/deployments.md`.

## The attribution tag is not retroactive

Two different mechanisms, and only one of them can be recovered after the fact:

- The `celo_` tag rides in each transaction's ERC-8021 data suffix. A
  transaction already mined without it can never gain it. Nothing sent before
  2026-09-02T03:22Z counts.
- x402 facilitator settlements are attributed to `agentWalletAddress`, and that
  attribution *is* retroactive across the whole hackathon window. The
  leaderboard simply reads zero until the wallet is on file, which it now is.

A self-derived code is not credited. Only the tag above is. Where our own code
must also be carried, pass an array: `toDataSuffix([ourCode, attributionTag])`.

## ERC-8004 identity

`agentId` 9804 in the `AgentIdentity` registry
`0x8004a169fb4a3325136eb29fa0ceb6d2e539a432` (an ERC-1967 proxy; implementation
`0x7274e874ca62410a93bd8bf61c69d8045e399c02`). Minted by the operator EOA, so
`ownerOf(9804)` is the operator itself.

Mint tx: 0x5567838b7b39f776cc0c78c92a7dafc28da12771802a32db99859ae0703a8d2d
(200,676 gas, block 76418295)

`tokenURI` is a URL, not a hash, so the card content at
`agent-card.json` can be updated without touching the NFT.

## Open item: the operator still holds CELO

The operator holds ~0.133 CELO left over from the mint. By design it must hold
**zero** — the demo's closing beat is an agent wallet with no CELO paying gas in
a stablecoin. It cannot be swept to exactly zero by a CELO-paid transaction,
because the node reserves `21000 * maxFeePerGas` regardless; the sweep must
itself pay gas via `feeCurrency`, which requires the operator to hold the
stablecoin first. Do this as part of the SDK work, not before.
