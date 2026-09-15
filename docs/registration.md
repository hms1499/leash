# Registration

Registered with celobuilders on 2026-09-02. This file is the record of the
values the rest of the plan depends on; the authoritative copies live on
celobuilders (`GET /submissions/me`) and on Celo mainnet.

- Hackathon: `agents-at-work` (28 Aug 2026 00:00 → 21 Sep 2026 09:00 GMT, extended from 14 Sep)
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
`docs/deployments.md`. **Both are back in as of the 2026-09-14 update below**,
which got under the cap by cutting words rather than evidence; the field now
reads 497 of 500.

## Updated for v2, 2026-09-14

`PUT /submissions/me` returned `200`, and a separate `GET` read the change back
rather than trusting the PUT's own response body. `status` is still `published`
— an update to a published submission stays published, so there was nothing to
re-publish. `updatedAt` 2026-09-14T02:14:49Z.

What changed, and why:

- `contractAddresses` was `0x7aDa926B…E43fd2`, the **superseded v1**. A judge
  opening the submission's one contract link landed on the contract v2 exists to
  replace — `owner` immutable, `topUpOperator` with no off switch. It is now
  `0xBE380aa73c036da30D3b2fd5E75B0d1d89E11C3d` alone.
- `ownContracts` declared three addresses, all superseded, and neither v2 nor
  `0x7757035d…`. This is the gap `docs/deployments.md` flagged as open. It now
  declares all six: v2, v1, `0x895B773E…`, the `0x7156af4f…` deploy that shipped
  v1 bytecode, and the two accounts strangers deployed through the wizard. Those
  last two are owned by somebody else but share this project's operator EOA, so
  they look project-controlled at audit; both are paused and hold 0 USDC, so
  declaring them excludes no volume.
- The description's five proofs were all v1 transactions. They are now the v2
  re-proofs of 2026-09-12, plus the two outcomes only v2 has: the account
  changing hands and coming back, and `topUpOperator` refused while the switch
  was off.
- Test counts were `32 contract, 253 TypeScript, 7 Playwright`. Every suite was
  run before the PUT rather than counted from a file: **66** forge, **506**
  TypeScript (83 sdk + 35 mcp + 388 app), **41** Playwright against the deployed
  URL. `CLAUDE.md` said 362 for the app suite and was corrected to 388 in the
  same pass.

Unchanged: `attributionTag`, `agentWalletAddress`, `socialLink`, tracks and
bounties. `videoUrl` was still null.

## Demo video added, 2026-09-15

`videoUrl` is now https://youtu.be/oKLYONKu4H8. The hackathon does not require
one: none of its 16 submission fields, rules, FAQs or judging criteria mention
a video. It was added because a judge watches faster than they read a repo.

The PUT sent the whole submission back with only `videoUrl` added, rather than
a one-field body, so nothing could be blanked by a PUT that replaces. A
separate `GET` diffed against the one taken before it showed exactly two fields
changed, `videoUrl` and `updatedAt` (2026-09-15T01:51:51Z); `status` is still
`published`. YouTube's oEmbed resolved the link before the PUT, so it is
public or unlisted, not private.

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

## Why Leash is missing from Best Stablecoin Adoption, and the first fix, 2026-09-15

Read out of the Dune SQL rather than inferred from the board. Query 8405664 (the
bounty) counts a leg only if it moves a named stablecoin (USAT, cNGN, Ripio
wFIAT — **not USDC or USDT**) inside a tagged transaction, or is an x402
settlement. Its source, query 8565204, defines an x402 settlement as a transfer
touching a registered wallet whose transaction was sent by
`0x0d74D5Cefd2e7F24E623330ebE3d8D4cB45fFB48` — the one signer
`api.x402.celo.org/supported` lists.

Every earlier Leash settlement was sent by `0xf8d2cc13…6ce3e`, the usebuy.ai
gateway's own facilitator, so none of them count. The 2026-09-07 agent402
purchase did go through `0x0d74…`, but was paid by `0xc5edb509…`, a wallet not
registered to this project.
tx: 0x028467861e056fd7e565f5766a1c1d9f5ba82c188443b9b529e89bfbc3ff9ff4

**No endpoint on Celo accepts USAT over x402.** All 15,565 resources in the CDP
x402 Bazaar were scanned: 603 are on Celo, all USDC, from `agent402.tools` and
`walcert.globalscoreagent.com`. So the "both rails" half is not reachable by
buying; only the x402 half is. agent402's Celo payTo is settled by `0x0d74…`
(25 of 25 recent transfers).

First qualifying settlement, bought by the registered operator through
`leash_fetch` (`agent402.tools/api/random`, 0.001 USDC). Read back off the chain:
status 1, block 77539081 (2026-09-15 02:37:19 UTC), sent by `0x0d74…`, Transfer
of 1000 atomic USDC from `0xd44daF6D…850D6` to `0xabf4fabd…a9d0`, operator USDC
41781 → 40781. `drawn_from_account` 0: the operator already held price plus
float, so nothing left the contract.
tx: 0x9b0098112708f78e1cf91c8f35e580dd72f5081790bfc61e9f675c5e6d6e529b

The local `leash` MCP server is configured against account
`0x7757035dd318eF1FC878bD83B06EE46eF3Ae0d9c`, not v2. Same operator key, and
irrelevant to a purchase that draws nothing, but a purchase that does draw will
draw from that account.

"Returning" needs activity on two distinct days, so a second purchase belongs on
2026-09-16 or later. The board refreshes every six hours.

## Wallet provenance for the anti-farming audit, 2026-09-15

The audit's first-funder test asks who first funded each wallet the project
touches, so each was traced to its earliest incoming transfer on Blockscout:

| Wallet | First funded by | Whose |
|---|---|---|
| operator `0xd44daF6D…850D6` | owner, 2026-09-02 | project, registered |
| owner `0x2B33cb68…7f57` | `0x64Ad6121…ae78`, 4 CELO, 2026-09-02 | project, registered |
| `0x64Ad61211C1b0B7f20B3e04B49661f30f152ae78` | `0xcfab15c9…bcbc`, 2026-05-16 | **the maintainer's** |
| `0x94f7268c…6459` | — | not the maintainer's, per the maintainer |
| `0xc5edb509…414f` | `0x94f7268c…6459`, 2026-04-09 | not the maintainer's, per the maintainer |

`0x64Ad…` funded the owner and on 2026-09-12 received 0.1 USDC from the v2
account: money leaving the maintainer and coming back. It is the project's
dominant funder, and an undeclared one reads as a farming signal, so it was
added to `otherWallets`. A GET diffed against the pre-update copy showed only
`customFields.otherWallets` and `updatedAt` (2026-09-15T03:12:48Z) changed.
That 0.1 USDC is never evidence of value moved.

`0x94f7…` owns both "stranger" accounts (`0xA73D…`, `0x7757…`) and funded the
wallet that paid the 2026-09-07 agent402 purchase. The maintainer says it is
not theirs; it is recorded here so the answer exists if the organisers ask.

Rebuilding the 20 successful tagged transactions (all signed by the operator)
with query 8565204's leg filter yields only two counterparties:
`0x4200000000000000000000000000000000000011` and `0xcD437749…8778`, the
recipients of fee-currency gas. They are not users, and the Track 2 counts must
not be presented as if they were. The board shows four; the other two could not
be identified without Dune access.
