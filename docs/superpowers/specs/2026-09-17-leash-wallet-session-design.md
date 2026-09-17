# Leash — the wallet session across routes (Design Spec)

**Date:** 2026-09-17
**Status:** Written from the connect/disconnect audit of 2026-09-17. Not yet implemented.
**Scope:** `app/` only. No contract change, no SDK or MCP change, no new dependency.

---

## 1. The problem

`WagmiProvider` sits in the root layout, so the wallet session survives a
client-side navigation, and `injected()` keeps `shimDisconnect` on, so a
disconnect survives a reload. Those parts are sound. What is not sound is what
each route does when the session **changes underneath it**: a disconnect, a
switch to another account inside the wallet, or a connect that fails.

React does not remount on any of those. Every piece of component state outlives
the wallet it was about. `lib/walletNote.ts` already records one instance of
this, measured on mainnet on 2026-09-12. The audit found five more, which this
spec fixes in this order:

| # | Where | What goes wrong |
|---|-------|-----------------|
| 2 | `/setup` | A generated agent private key stays on screen after a disconnect or a wallet switch, next to a different wallet's agent. |
| 1 | `/setup` | The wizard never reads `owner()`. It resumes any account localStorage names, and lets a non-owner press writes that are sent with an explicit `gas`, so they can revert on chain and cost gas. A deploy that confirms after a wallet switch attaches the new account to the wrong session. |
| 3 | every route | Inside MiniPay, disconnect reconnects at once. The wizard drops to step 1 and resumes on every press. |
| 4 | every route | `ConnectButton` ignores the connect error and the pending state. With no wallet installed, "Connect wallet" does nothing visible. |
| 7 | `/accounts` | "Refresh from Celo" is never aborted. After a wallet switch, it writes the previous owner's list onto the new owner's screen. |
| 6 | `/a/[address]` | `LimitsDrawer` and `StopButton` unmount when `isOwner` turns false. A write that is already on its way to the chain loses its only outcome message. |

The audit's items 5 (a disconnect control with no label), 8 (the disconnected
flash on a hard load) and 9 (`AccountSwitcher` writing raw `localStorage`) are
partly covered below: 5 by §2.3, and the MiniPay half of 8 by §2.3. The rest of
those three is out of scope (§4).

## 2. The design

### 2.1 Constraints every fix obeys

- **No component-testing dependency.** `app/vitest.config.ts` runs in the
  `node` environment, and the UI-coherence spec (§2.2) forbids adding one. Each
  decision lives in a pure function under `app/lib/` and is unit-tested there.
  A component only calls it. Where the property is the *wiring*, a source
  ratchet (the `agentKey.test.ts` / `surface.test.ts` pattern) keeps it in place.
- **Scope, do not only clear.** `lib/walletNote.ts` explains why: an effect
  runs after the render that already painted the stale value. A value that
  belongs to one wallet is stored with that wallet and shown only to it.
- **The chain decides.** localStorage only supplies candidates.
- **Never report a write as anything but what was observed** (CLAUDE.md). A
  fix must not hide the outcome of a transaction that was actually sent.

### 2.2 Item 2 — the generated key belongs to one wallet and one agent

`generatedKey` becomes `HeldAgentKey = { privateKey, wallet } | null`, where
`wallet` is the owner that was connected when the key was generated.

`keyToShow(held, connected, agent)` in `lib/agentKey.ts` returns the key only
when **both** of these hold:

- `held.wallet` equals `connected`, ignoring case, and `connected` is set;
- the address the key controls equals `agent`, ignoring case.

Otherwise it returns `null`. Both `<GeneratedKeyPanel>` renders use its result.

On disconnect (`connected` becomes falsy), the wizard's connected-wallet
effect also sets `generatedKey` to `null`, so the key is gone from memory and
not only from the screen. A switch to wallet B and back to A without a
disconnect keeps the key and shows it to A again. That is acceptable: it is
the same person at the same browser, and the key was never shown to B.

### 2.3 Item 1 — `/setup` resumes only an account the wallet owns

- `SETUP_ABI` gains `owner()`. The restore effect adds that read to its
  existing `Promise.all`. It must be in the array, not awaited after it: see
  `promise-all-is-load-bearing-for-multicall`.
- `restoredOwnerNote(owner, connected)` in `lib/setup.ts` returns `null` when
  `canEdit(owner, connected)`. Otherwise it returns
  `NOT_OWNER_NOTE = 'The connected wallet does not own this protected account. Open My accounts to choose one it owns.'`
- On a mismatch, the effect sets `account` to `null`, shows the note in
  `restoreNote`, and goes to stage 1. It does **not** call
  `forgetPolicyAccount`. forno serves stale reads right after an ownership
  transfer, and one stale `owner()` must not delete a real entry.
- The restore effect depends on `[account, connected]`. Without `connected`, a
  wallet switch that keeps the same account address (both wallets' registries
  list it after a transfer) would never be re-checked.
- The connected-wallet effect clears `restoreNote` when the wallet changes, so
  a note about wallet A is not shown to wallet B.
- **Deploy race.** `deploy()` records `owner = connected` when it starts, and
  uses it for the constructor argument and the registry write. A
  `connectedRef` tracks the live wallet. After the receipt,
  `afterDeployNote(account, owner, connectedRef.current)` returns `null` when
  the same wallet is still connected. Otherwise it returns
  `` `Created ${account} for ${owner}. Connect that wallet again to continue setting it up.` ``,
  which becomes the error, and the wizard does **not** call `setAccount`. The
  account is still saved under `owner`, so reconnecting that wallet resumes it.

### 2.4 Items 3 and 4 — `ConnectButton` says what happened

New `lib/connectWallet.ts`:

- `shouldAutoConnect({ miniPay, status, attempted })` is `true` only when
  `miniPay` is true, `status === 'disconnected'` and `attempted` is false.
  Checking `status` rather than `isConnected` also keeps the auto-connect out of
  wagmi's own `reconnecting` pass on a hard load (the MiniPay half of audit
  item 8). `attempted` is a ref. Because it is set once, a disconnect inside
  MiniPay stays disconnected for the rest of the page's life.
- `describeConnectError(error)` maps the error to one sentence by walking the
  `cause` chain (at most 10 links):
  - `null` or `undefined` → `null`
  - `name === 'ProviderNotFoundError'` → `NO_WALLET = 'No browser wallet found. Install one, or open this page in MiniPay, then reload.'`
  - `code === 4001` or `name === 'UserRejectedRequestError'` → `CONNECT_CANCELLED = 'The wallet did not connect. The request was cancelled.'`
  - `code === -32002` → `CONNECT_PENDING = 'Your wallet already has a connection request open. Finish it there.'`
  - anything else → `CONNECT_FAILED = 'The wallet did not connect. Try again.'`

`ConnectButton`:

- Reads `status` from `useAccount`, and `isPending` and `error` from
  `useConnect`.
- Learns `miniPay` in an effect, because `isMiniPay()` during render would be
  a hydration mismatch.
- While disconnected, it disables the button while `isPending` and labels it
  `Connecting…`. It shows `describeConnectError(error)` in a `role="status"`
  label.
- While connected inside MiniPay, it shows the address as a label and **no**
  disconnect control. Outside MiniPay, the ghost button keeps its visible text
  and gains ``aria-label={`${truncateAddress(address)}, disconnect`}`` and
  `title="Disconnect"`. The accessible name starts with the visible text
  (WCAG 2.5.3).
- Takes `onDangerBand?: boolean`. The status label is `--bg` on the paused
  band and `--bad` elsewhere, the same rule `StopButton` follows
  (docs/design-system.md §4). The dashboard passes `state.paused`.

### 2.5 Item 7 — one discovery run per owner

`AccountsPage` keeps the current run's `AbortController` in a ref.
`startDiscovery(owner)` aborts the previous run and starts a new one. It is the
**only** caller of `discoverAccounts`: both the effect and the Refresh button
go through it. `discoverAccounts` takes a required `signal`, and it checks
`signal.aborted` after `response.json()` as well as after each batch, so no
branch writes state for a run that was replaced. A disconnect aborts the run.

### 2.6 Item 6 — a write in flight outlives the owner check

`ownerControlView(isOwner, phases, note)` in `lib/writePhase.ts`:

| condition (first match wins) | view |
|---|---|
| `isOwner` | `'controls'` |
| any phase is busy | `'pending'` |
| `note !== null` | `'outcome'` |
| otherwise | `'hidden'` |

`outcomeForOtherWallet(note, sender)` returns
`` `${truncateAddress(sender)}: ${note}` ``. A note shown after the owner has
gone says which wallet it is about, which is the `walletNote.ts` rule applied
to a message that must not be dropped.

- **`StopButton`** captures `sender` in a ref at the start of `send`. In
  `'pending'` it shows only a status label, `writeLabel(phase, { idle: '', sending: 'Waiting for the wallet…' })`.
  In `'outcome'` it shows `outcomeForOtherWallet(note, sender)`. Neither view
  has a button, so a non-owner can never press Stop or Resume. `'hidden'`
  keeps the component's existing `Paused` / `Active` label.
- **`LimitsDrawer`** gains an `isOwner` prop, with the same views, rendered in
  one `Panel`. The note is `error ?? recipientNote`, and the phases are
  `[phase, recipientPhase]`. `'hidden'` renders `null`.
- **`app/a/[address]/page.tsx`** renders both components without the
  `isOwner &&` guard, so the parent can no longer unmount them in the middle of
  a write.

**Visible change, deliberate:** a visitor to the dashboard now sees the
`Active` / `Paused` label in the header. `StopButton`'s non-owner branch was
written for exactly that reader, and its comments are about that reader, but
the page's guard had made the branch unreachable.

## 3. Verification

- `pnpm -F @leash/app test`: every new pure function has cases for each row
  above, and every wiring property has a source ratchet.
- `cd app && npx tsc --noEmit`.
- `pnpm -F @leash/app test:e2e`: the dashboard spec still finds
  `Connect wallet` for a visitor.
- A manual pass in a browser wallet for 2.2, 2.3, 2.4, 2.5 and 2.6, because no
  automated test in this repo can drive an injected wallet. The pass switches
  accounts in the wallet during each flow and records what was seen. None of
  it sends a mainnet transaction except the one deliberate `setPaused` in the
  2.6 check, if the maintainer chooses to run it.

## 4. Out of scope

- The disconnected flash on a hard load outside MiniPay (audit item 8). It
  needs `cookieStorage` and `initialState` from a server layout, which is a
  separate change.
- `AccountSwitcher` calling raw `localStorage` (audit item 9).
- Clearing the wizard's other notes (`limitsNote`, `agentNote`, and the rest)
  on a wallet switch. They are write outcomes and are handled by the
  `walletNote` pattern if it is ever extended to the wizard.
- `TopUpDrawer`, `OwnershipDrawer`, `AgentPanel` and `AgentAccessPanel`. Their
  parent does not gate them on `isOwner`, so they do not unmount mid-write.
