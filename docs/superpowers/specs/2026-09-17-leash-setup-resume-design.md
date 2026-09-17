# Leash — resuming an interrupted setup (Design Spec)

**Date:** 2026-09-17
**Status:** Written from the resume audit of 2026-09-17. Not yet implemented.
**Scope:** `app/` only. One new server route. No contract change, no new dependency.
**Builds on:** `2026-09-17-leash-wallet-session-design.md`, which is already implemented (`/setup` reads `owner()`, and so on).

---

## 1. The problem

`/setup` resumes an interrupted setup on the same browser. It takes candidates
from localStorage and lets the chain decide each step, through
`firstSetupStage`. The audit found three ways resuming goes wrong. Two of them
make the owner pay for a second contract.

| # | Situation | What happens today |
|---|---|---|
| 1 | The owner closes the tab while a deployment is still waiting for Celo | The account is saved only after the receipt. On return, `/setup` shows step 1 and offers **Create protected account** again, so a second deployment and a second fee. |
| 2 | Another browser or device, or cleared site data | The registry is empty, so `/setup` shows step 1 even though the wallet owns an account. `/accounts` would have found that account, but `/setup` never looks. |
| 3 | The agent is authorised, but this browser does not know its address | The restore path reads only `leash.agent.<account>`. Without that key it stops at step 3 and asks for an agent that is already authorised. The dashboard finds operators from `OperatorChanged` logs, but only within its 24-hour window. |

Out of scope: a generated key that was never copied (lost by design, as the
"shown once" rule says); a stage-2 recipient choice that was never saved;
which of several accounts to resume when the registry already has them.

## 2. The design

### 2.1 Constraints

Everything in §2.1 of the wallet-session spec still applies. In short:

- Decisions live in pure functions under `app/lib/`, tested in the node
  environment. Wiring is held in place by source ratchets.
- No component-testing dependency.
- The chain decides. localStorage and the explorer only supply candidates.
- A write is never reported as anything other than what was observed.
- Two implementations of one operation must behave the same.

Also:

- `app/test/scaleUsage.test.ts` caps raw Tailwind type sizes per file. New
  text uses `PROSE` or the `--t-*` tokens, never `text-sm`.
- New `/setup` effects that end in `}, [connected])` go **after** the existing
  connected-wallet effect. `agentKey.test.ts` finds that effect by the first
  occurrence of that text.

### 2.2 Item 1 — a deployment this browser sent is checked before another is offered

`lib/pendingDeploy.ts`:

- `PendingDeploy = { hash, owner, sentAt }`, stored under
  `pendingDeployKey(owner)` = `leash.pendingDeploy.<owner lower-case>`.
  `parsePendingDeploy(raw, owner)` returns `null` for anything malformed, and
  for a record written by a different owner.
- `checkPendingDeploy(hash, client)` returns one of:
  - `landed { address, deployBlock }`: the receipt exists and
    `describeDeployReceipt` accepts it.
  - `failed { message }`: the receipt exists but reverted, or has no contract
    address. The message is `describeDeployReceipt`'s.
  - `waiting`: no receipt yet (`TransactionReceiptNotFoundError`), but the node
    knows the transaction.
  - `unknown`: the node knows neither the receipt nor the transaction
    (`TransactionNotFoundError`).
  - `unread`: any other error.

  Errors are matched by `name`, walking the `cause` chain for at most 5 links.
  The client is injected, so this is tested with fakes.
- `pendingDeployNote(check, hash)` gives the sentence for each state
  (`checking` included; `landed` gives `null`).
  `pendingDeployBlocksCreate(check)` is `true` for `checking`, `waiting`,
  `unread` and `unknown`.

`/setup`:

- **Record:** `deploy()` writes the record with `writeLocal` as soon as the
  wallet returns a hash, before it waits for the receipt.
- **Clear:** it removes the record once the receipt has been judged,
  successful or not. If the wait times out, the record stays. When the same
  wallet is still connected, the wizard then shows the pending panel instead
  of only an error.
- **Check on load:** a new effect keyed on `connected` reads the record and
  runs `resolvePendingDeploy`.
- **`landed`:** save the account to the registry under `record.owner`, select
  it, remove the record, and set the account (the restore effect takes over
  from there).
- **`failed`:** remove the record and show the message as the error. **Create**
  is enabled again.
- **Anything else:** step 1 shows a `role="status"` panel with the note and a
  **Check again** button. **Create** is disabled while the panel is shown.
- **`unknown` only:** the panel also offers a two-beat (`useArming`)
  **It never landed — deploy again**. It removes the record and calls
  `deploy()`. That is the only way past a record the chain does not know,
  because forno is load-balanced and a node may not have seen a transaction
  that another node accepted.
- **Wallet changed during a check:** the result is dropped if
  `canEdit(record.owner, connectedRef.current)` is false.

### 2.3 Item 2 — `/setup` looks up accounts the wallet already owns

`lib/ownedAccounts.ts` takes over the verification that lives in
`AccountsPage`, so both screens use one implementation:

- `verifyPolicyAccount` and `answeredByTheContract` move here unchanged,
  together with `VERIFY_ABI`.
- `findOwnedAccounts(owner, signal, deps?)` calls `/api/accounts/discover`, then
  verifies candidates five at a time. It checks `signal.aborted` after the
  response and after each batch. It returns one of:
  - `{ status: 'aborted' }`
  - `{ status: 'not-configured' }`
  - `{ status: 'failed' }`
  - `{ status: 'ok', verified, unreadable, historyTruncated }`

  It never saves anything and never throws. `deps` injects the fetch and the
  verifier for tests.
- `newestAccount(list)` returns the candidate with the highest `deployBlock`.
- `accountLookupNote(result)` returns:
  - more than one verified account →
    `` `This wallet owns ${n} protected accounts. Resumed the newest; open My accounts to choose another.` ``
  - none verified, and (anything unreadable, or history truncated, or
    `failed` / `not-configured`) → `LOOKUP_UNCERTAIN = 'Could not confirm whether this wallet already owns a protected account. Check My accounts before creating another — a second account is a second deployment fee.'`
  - otherwise → `null`

`AccountsPage.discoverAccounts` calls `findOwnedAccounts` and keeps its own
notes and its saving. Its behaviour does not change.

On `/setup`, a new effect keyed on `connected` runs only when:

- the wallet is connected,
- the URL has no `?new=1` (the owner asked for a new account on purpose),
- and the owner's registry is empty.

In that case it:

1. Sets `lookup = 'searching'` and calls `findOwnedAccounts` with an
   `AbortController` that its cleanup aborts.
2. Saves each verified account and selects the newest.
3. Sets the account, so the restore effect takes over.
4. Shows `accountLookupNote` in a `role="status"` line.

While `lookup === 'searching'`, **Create** is disabled and step 1 says
`Checking whether this wallet already owns a protected account…`. A failed or
uncertain lookup never blocks **Create**. It says so instead. Deployments
without an explorer key must still be able to create an account.

**Known limit:** the discover route is cached for 300 s, and the explorer
indexes with some lag. A deployment made on another device minutes earlier
may not appear yet. The same-browser case is covered by §2.2.

### 2.4 Item 3 — the restore path recovers an authorised agent it was not told about

`lib/agentDiscovery.ts`:

- `OPERATOR_CHANGED_TOPIC` = `toEventSelector('OperatorChanged(address,bool)')`,
  computed once at module load. It is never written as a literal: the
  pre-commit guard reads any bare 64-hex value as a possible private key. A
  test holds it equal to the selector of the `OperatorChanged` event in the
  compiled ABI (`app/lib/contract.ts`).
- `etherscanLogsUrl(account, apiKey, page)` builds an Etherscan v2 `getLogs`
  URL: chain 42220, `topic0` as above, `fromBlock=0`, `toBlock=latest`,
  `offset=1000`.
- `operatorChangesFromExplorer(result, account)` turns explorer logs into
  `OperatorChange[]`. It drops any entry whose address, topic, data or numbers
  do not parse.
  - Etherscan writes zero as the bare string `"0x"`. This was measured
    2026-09-17 on `0xBE380aa7` (`logIndex: "0x"`), so it must parse as 0.
  - An empty history is `{"status":"0","message":"No records found","result":[]}`.
- `fetchOperatorCandidates(account, signal?)` calls the new route and returns
  its valid addresses. It throws on a non-OK response.
- `recoverAgent({ owner, candidates, isOperator })`:
  - drops the owner itself from the candidates;
  - checks every remaining candidate with `isOperator` inside one
    `Promise.all`, so the reads are multicalled;
  - returns the first one that passes, in candidate order;
  - returns `null` on any error. It never throws.

New route `app/app/api/accounts/operators/route.ts`, the same shape as
`discover`:

- `400` for an invalid `account`.
- `503 { code: 'DISCOVERY_NOT_CONFIGURED' }` without an explorer key.
- Up to 10 pages of 1,000 logs.
- `200 { operators: liveOperators(changes) }`, which is newest authorisation
  first and excludes revoked operators, with
  `Cache-Control: public, s-maxage=60, stale-while-revalidate=120`.
- `502` on any explorer failure.

In the `/setup` restore effect:

1. If the saved agent is missing, or `operators()` says it is not authorised,
   call `recoverAgent` with `fetchOperatorCandidates(account)` and an
   `operators()` reader.
2. A recovered agent is written to `leash.agent.<account>` and then goes
   through exactly the path a saved one does: `setAgent`,
   `setAgentAuthorized`, balance read, stage.
3. A failed recovery leaves step 3 as it is today. Pasting the address still
   works, because `addAgent` asks `operators()` first.

The dashboard keeps its own 24-hour discovery. Moving it to this route is a
separate change.

## 3. Verification

- `pnpm -F @leash/app test`:
  - unit tests for every function above, using fakes for clients, fetch and
    verifiers;
  - route tests that call `GET` directly with `fetch` stubbed;
  - source ratchets for the `/setup` and `AccountsPage` wiring.
- `cd app && npx tsc --noEmit`.
- `pnpm -F @leash/app test:e2e`. If port 3000 is already in use, set
  `LEASH_E2E_URL=http://localhost:3000`.
- A manual pass in a browser wallet. See the plan's final task. Only one check
  can involve a mainnet transaction: a deployment the maintainer chooses to
  make.

## 4. Out of scope

- Moving the dashboard's operator discovery onto the new route.
- Recovering a generated key.
- Choosing which of several saved accounts `/setup` resumes.
- Persisting the stage-2 recipient decision.
