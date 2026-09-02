# Registration

Registered with celobuilders on 2026-09-02. This file is the record of the
values the rest of the plan depends on; the authoritative copies live on
celobuilders (`GET /submissions/me`) and on Celo mainnet.

- Hackathon: `agents-at-work` (28 Aug 2026 00:00 → 14 Sep 2026 09:00 GMT)
- Primary track: `judges-favorite`
- Secondary track: `askbots-growth` — not yet entered. "What I will demonstrate":
  measured code-quality improvement between AskBots review rounds one and two on
  this repo. Round two falls on 12–13 Sep, and the track scores the delta from
  round one, so entering late shrinks the delta.
- **Attribution tag: `celo_3dec652cd977`**
- Operator EOA (= registered `agentWalletAddress`): `0xd44daF6Db6c8057c206E6aCC27e6384B8ec850D6`
- Owner EOA: `0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57`
- ERC-8004 identity: https://8004scan.io/agents/celo/9804
  (also https://celoscan.io/nft/0x8004a169fb4a3325136eb29fa0ceb6d2e539a432/9804)
- Repo: https://github.com/hms1499/leash
- Registered at: 2026-09-02T03:22:20Z
- Submission id: `6ef3d9c0-ec73-4d90-a2cd-643cada6fa1d` (status: draft)
- Participant id: `e430fd14-792e-40b8-b2c9-5631a383c38f`

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
