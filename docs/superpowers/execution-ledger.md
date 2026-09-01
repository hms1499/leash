# SDD ledger — plan: docs/superpowers/plans/2026-09-01-leash-foundation.md

Spec: docs/superpowers/specs/2026-09-01-leash-design.md (read, reachable)
Workspace: main branch, no worktree — human partner gave explicit consent
("code trên main luôn vì project này tôi build một mình").
BASE at start: 5132319

## Preflight conflict scan

### Cross-task: shared files and interfaces

| Producer -> Consumer | Produces | Consumes | Finding |
|---|---|---|---|
| T2 -> T11, T12 | `sdk/src/constants.ts`: FEE_CURRENCY_DIRECTORY, KNOWN_FEE_ADAPTERS | same names | OK |
| T3 -> T11 | proven toDataSuffix/verifyTx call pattern | toDataSuffix | OK |
| T5 -> T3, T11, T14 | attributionTag | tag string | **CONFLICT: T3 is numbered before T5 but needs its output** |
| T6 -> T7,T8,T9,T10 | onlyOwner/onlyOperator/notPaused, NotOwner/NotOperator/ContractPaused | same | OK |
| T7 -> T8,T9 | `_consume`, `limits`, `remainingToday`, setPolicy | same | OK |
| T7 -> T13 | remainingToday, limits tuple (perTx,daily,spentToday,day) | abi.ts entries | OK — tuple order matches |
| T8 -> T13 | `execute(address,address,uint256)` 3-arg | abi.ts execute 3 inputs | OK |
| T9 -> T13 | `topUpOperator(address,uint256)` | abi.ts entry | OK, but no caller in this plan (Plan 2 consumer) |
| T10 -> T13,T14 | mainnet address in docs/deployments.md | LEASH_ACCOUNT env | OK |
| T11 -> T13 | `withAttribution(data, tag)` | same | OK |
| T12 -> T13 | `pickFeeAdapter(balances, adapters?)` | called with 1 arg (default) | OK |
| T13 -> T14 | LeashClient.spend(token,to,amount,feeBalances) 4-arg | called 4-arg | OK (fixed in plan self-review) |
| T6 -> T7,T8,T9,T10 | test/mocks/MockERC20.sol (mint/transfer/balanceOf) | all contract tests | OK |

### Per-task: internal self-consistency

| Task | Tests vs code it specifies | Files created vs later touched | Finding |
|---|---|---|---|
| T1 | n/a (scaffold) | pnpm-workspace lists `mcp`, `app` — neither exists in this plan | Minor: pnpm ignores absent patterns; install may warn |
| T2 | n/a (spike) | writes `sdk/src/constants.ts` before the sdk package exists (T11) | Minor: file lands in a not-yet-package dir; harmless |
| T3 | round-trip assertion is real | — | Blocked on T5, see ruling R1 |
| T4 | decision record only, no assertion | — | OK by design — output is a recorded PASS/FAIL |
| T5 | n/a (registration) | — | OK |
| T6 | 5 tests vs ownership/pause code | creates SpendPolicyAccount.sol | OK |
| T7 | 8 tests via ConsumeHarness | modifies SpendPolicyAccount.sol | OK — harness added in plan self-review so task is self-testable |
| T8 | 8 tests vs execute/allowlist | adds IERC20 iface after pragma to T6's file | OK |
| T9 | 5 tests vs topUpOperator | modifies same file | OK — test_topUpIgnoresAllowlist asserts the documented weaker guarantee |
| T10 | 2 tests vs sweep | adds Deploy.s.sol | OK — script notes broadcast key must be owner |
| T11 | 3 tests vs withAttribution | creates sdk package | OK |
| T12 | 4 tests vs pickFeeAdapter | — | OK |
| T13 | 4 tests vs describePreCheckFailure only | LeashClient itself untested until T14 | Accepted: T14 is its integration test |
| T14 | describe.runIf gate | — | OK — skips without creds, never green-when-present-and-broken |

## Rulings

Ruling R1: T3's mainnet run is reordered to after T5; only T3's code may be
written earlier. — Reason: T3 asserts a real attributionTag round-trips, and
the tag does not exist until T5 registers. — Cost if wrong: none; the plan
already documents a Sepolia dry-run with a placeholder tag as the interim step.

Ruling R2: Steps requiring funded keys, GitHub auth, or mainnet broadcast are
NOT delegated to subagents. Specifically: T2 step 4, T3 step 2 (mainnet), T5
entirely, T10 steps 6-8, T14 step 4. Subagents implement all local code; these
steps stop and go to the human partner. — Reason: irreversible, security-
sensitive, and outward-facing per this skill's four stop conditions. — Cost if
wrong: none; delegating them would be the error.

Ruling R3: Tasks 11 and 12 are dispatched as one batch. — Reason: both are
small pure functions whose complete code is in the plan; same package, same
shape, transcription plus tests. — Cost if wrong: one slightly larger review
surface.

## Progress

Task 1: implemented (commit 6bc9072) — pnpm install OK, tsx 4.23.13 resolves; .gitignore untouched (existing entries sufficient). Review dispatched.
Task 1: minor (deferred): pnpm-lock.yaml generated but neither committed nor ignored.
Task 1: minor (deferred): plan's Task 1 "Produces" line claims contracts/ resolves as a pnpm package, but pnpm-workspace.yaml (correctly) omits it.
Task 1: Ruling: pnpm-lock.yaml gets committed in Task 11, the next task that changes dependencies — not as a Task 1 fix round. — Reason: Minor findings do not enter the fix loop, and Task 11 is the first task that meaningfully changes the dep graph, so the lockfile it commits is the useful one. — Cost if wrong: a few tasks of non-reproducible installs on a solo machine.
Task 1: Ruling: contracts/ stays OUT of pnpm-workspace.yaml; the plan's "Produces" line is wrong, the implemented file is right. — Reason: contracts/ is a Foundry project and does not need pnpm workspace membership; forge resolves its own deps via lib/. — Cost if wrong: none observed; if some later tooling needs it, adding the entry is a one-line change.
Task 1: complete (commits 5132319..6bc9072, review clean — spec OK, quality approved, 2 minors deferred)
Toolchain verified present: forge/cast/anvil 1.5.1-stable, gh 2.89.0, pnpm 9.12.0, node v22.16.0.

## History rewrite (human partner request)

Git identity changed to hms1499 <thanvanhuy159@gmail.com> and all 3 existing
commits rewritten via filter-branch. Repo has NO remote, so this was purely local.
Backup ref left at refs/original/refs/heads/main.

**SHA remap — earlier ledger lines reference the OLD SHAs:**
- 61f55c2 (spec)     -> ea4fc49
- 5132319 (plan)     -> 05fd599
- 6bc9072 (Task 1)   -> c92390d

Task 1 complete line above should be read as: commits 05fd599..c92390d.
The review-package file named review-5132319..6bc9072.diff is a historical
artifact of the pre-rewrite SHAs; its content is still the Task 1 diff.

Task 2: implemented (commit 523fa76) — FeeCurrencyDirectory 0x15F344b9E6c3Cb6F0376A36A64928b13F62C6276, 20 adapters. Controller independently re-verified via `cast call getCurrencies()`: all 20 addresses and their order match constants.ts exactly; directory address is 42 chars. Step 4 (real send from zero-CELO wallet) deferred to human partner per Ruling R2.
Task 2: minor (deferred): USDC's adapter 0x2F25...602B reverts on symbol()/name()/decimals() — it is an adapter wrapper, not an ERC20. Expected per Celo docs; cross-checked against underlying USDC 0xcebA9300f2b948710d2653dD7B07f33A8B32118C.
Task 2: Ruling: the plan's run command `pnpm -F spikes exec tsx <file>` (from repo root) is wrong — it doubles the path and fails with ERR_MODULE_NOT_FOUND. Correct form is `cd spikes && pnpm exec tsx <file>`. — Reason: implementer hit it empirically and the working form is recorded in the report; Task 3's brief carries the same broken command, so the correction must travel with that dispatch. — Cost if wrong: none; both forms are non-destructive and the failure is loud, not silent.
Task 2: minor (deferred): FEE_CURRENCY_DIRECTORY uses bare `as const` while KNOWN_FEE_ADAPTERS uses the stricter `as const satisfies readonly \`0x${string}\`[]`. Asymmetric but type-safe; nothing downstream breaks.
Task 2: minor (deferred): README adds Source / notes-column / cross-check sections beyond the brief's template — additive docs, not a violation.
Task 2: complete (commits c92390d..523fa76, review clean — spec OK, quality approved, 0 Critical/Important)
Task 4: implemented (commit a979112) — VERDICT: ERC-1271 SUPPORTED (high confidence). Celo USDC (0xcebA9300f2b948710d2653dD7B07f33A8B32118C, Circle FiatTokenCeloV2_2) and Celo USDT (underlying 0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e) both verify transferWithAuthorization via SignatureChecker.isValidSignatureNow, which checks extcodesize(signer) and falls back to an ERC-1271 isValidSignature staticcall. Source read raw from Blockscout verifier API (no Celoscan key needed), two independent tokens cross-checked.
Task 4: implementer's own caveat, kept: necessary-but-not-sufficient. Confirms the TOKEN accepts ERC-1271; does NOT confirm Leash's contract or the x402 facilitator SDK round-trips a bytes-typed signature end to end.
Task 4: implementer reported the plan's `pnpm -F spikes exec tsx` DID work in its environment, contradicting the Task 2 ruling. It flagged the discrepancy rather than silently overriding. Both forms are therefore usable; `cd spikes && pnpm exec tsx` remains the command of record.

Task 4: Ruling: Tasks 6-9 proceed UNCHANGED. — Reason: ERC-1271 is purely additive to SpendPolicyAccount; it does not alter _consume, execute, topUpOperator, ownership, or pause, which is all Tasks 6-9 build. — Cost if wrong: none; no rework to those tasks either way.

Task 4: Ruling: the ERC-1271 / Path-A decision is NOT taken now and is bound to the Task 10 mainnet deploy, which is already a human-partner stop. — Reason: deploying without ERC-1271 and adding it later means abandoning the deployed address, so the decision must precede the broadcast, not follow it. Deciding now would either burn 6-8h of a 4h slack budget on speculation or lock out Path A prematurely. — Cost if wrong: if we later want ERC-1271 and deployed without it, one redeploy plus re-funding; the mainnet address is not yet referenced anywhere public.

Task 4: SECURITY FINDING (controller, not the implementer) — a naive ERC-1271 implementation would be a total policy bypass. If isValidSignature approves any operator-signed digest, the operator can drain the contract via x402 transferWithAuthorization WITHOUT ever entering _consume(), defeating the entire product thesis. isValidSignature receives only a bytes32 hash and cannot recover (to, value), so policy CANNOT be enforced at signature-check time. Any safe design must pre-authorize: an operator calls e.g. authorizeX402Payment(to, value, validAfter, validBefore, nonce), which runs _consume() and stores the resulting EIP-712 digest; isValidSignature then only looks the digest up and burns it. This must be resolved before Task 10 broadcasts.

Task 4: Ruling: Task 4's review and Task 6's implementation are dispatched concurrently. — Reason: they touch provably disjoint files (spikes/*.ts + docs vs contracts/*.sol) and Task 6's requirements do not depend on Task 4's verdict, per the ruling above. — Cost if wrong: a Task 4 re-review would not invalidate any Task 6 work.
Task 6: implemented (commit ed95ab9) — 5/5 OwnershipTest passing. CONTROLLER CONCERN: 68 of 73 files in the commit are vendored forge-std (30,456 insertions). Only 5 files are actual project code. Raised to the task reviewer for a verdict rather than ruled on unilaterally, since it is an implementation choice, not a plan defect. Review package filtered to exclude contracts/lib so the reviewer sees real code.
Task 4: minor (deferred): README/report phrase "byte-for-byte the same logic" is imprecise — source text differs trivially between the two tokens; "identical logic" would be accurate. Does not affect the conclusion.
Task 4: complete (commits 523fa76..a979112, review clean — spec OK, evidence approved). Reviewer independently reproduced the load-bearing citations: call chain EIP3009.sol:127/207/258 -> _requireValidSignature:276 -> SignatureChecker.isValidSignatureNow:282 (same shape in Tether's at 90/132/157 -> 209 -> 215); confirmed a `bytes memory signature` overload exists so the ERC-1271 path is externally reachable; confirmed genuine independence via differing implementation bytecode (46,416 vs 34,092 hex chars). Reviewer's trust for a deployment decision: HIGH, with the facilitator-SDK caveat as the one open item.
Task 6: review verdict — spec ✅ no gaps (every name Tasks 7-10 depend on present exactly: owner immutable, paused, operators, setOperator, setPaused, onlyOwner/onlyOperator/notPaused, NotOwner/NotOperator/ContractPaused, OperatorChanged/PausedSet, receive(), MockERC20 mint/transfer/balanceOf). Quality approved with ONE Important finding.
Task 6: Important finding -> fix loop: forge-std vendored as 68 files / 30,270 lines instead of a git submodule, burying 186 lines of real code in a 30,456-insertion commit. Reviewer recommends fixing now (cost trivial: no remote configured, nothing pushed).
Task 6: minor (deferred): default forge init README still references the deleted forge script script/Counter.s.sol:CounterScript — folded into the fix round since the implementer is editing that file anyway.
Task 6: minor (deferred): implementer used `--no-git` where the brief said `--no-commit`; `--no-commit` does not exist in Foundry 1.5.1. Transparently disclosed in its report. Accepted, no action.
Task 6: fix round 1/5 dispatched (resumed original implementer) — convert forge-std to a submodule as a NEW commit, no history rewrite.
Task 6: Ruling: the fix is a forward commit only; scrubbing the 30k-line blob out of commit ed95ab9 itself is NOT done by the fix loop. — Reason: that requires rewriting history, which is a destructive operation reserved for the human partner's explicit consent, and commits already sit on top of ed95ab9. — Cost if wrong: the bloated commit stays visible in `git log --stat`; the final tree is correct either way, and the remove-vendoring commit tells an honest story.
Task 6: fix round 1/5 (commit 5fac204) — 71 files, +13/-30,273. forge-std now a gitlink: `160000 commit bf647bd6046f2f7da30d0c2bf435e5c76a780c1b contracts/lib/forge-std`, .gitmodules at repo root, submodule status reports v1.16.2. Controller re-verified mechanically; forge test OwnershipTest 5 passed / 0 failed after conversion. Scoped re-review dispatched.
Task 6: fix round 1 re-review — finding ADDRESSED (.gitmodules created, gitlink in place, 30,270 lines deleted, stale README deploy line replaced, Setup section documents `git submodule update --init --recursive`). NEW BREAKAGE: none; SpendPolicyAccount.sol / Ownership.t.sol / MockERC20.sol / foundry.toml untouched by the fix.
Task 6: complete (commits a979112..5fac204, review clean after 1 fix round, 3 minors deferred)
Task 7: implemented (commit e46d591) — LimitsTest 8/8, full suite 13/13, fuzz 256 runs.
Task 7: PLAN DEFECT found by the implementer: the plan's test_allowanceResetsNextUtcDay called consume(20e6) while setUp sets perTx=10e6, so it would revert PerTxCapExceeded before ever exercising the day rollover. Implementer split it into two 10e6 calls.
Task 7: Ruling: the implementer's deviation stands; the plan text was wrong. — Reason: controller verified the amended test — two 10e6 consumes exhaust the 20e6 daily cap, remaining hits 0, vm.warp(+1 days) advances _today() by exactly one index, remaining returns to 20e6. It now tests the rollover it was always meant to test, which the plan's version never reached. — Cost if wrong: none; the amended test is strictly stronger than the unreachable original.
Task 7: review verdict — spec ✅ byte-for-byte, no gaps. Amended rollover test confirmed to genuinely exercise the l.day != today branch. Correctness approved.
Task 7: minor (deferred): with a pathological near-uint256.max cap, `spent + amount` reverts on checked-arithmetic overflow (panic) rather than a named error. Not exploitable; no sane config reaches it.
Task 7: Important (design note, spec-mandated): `daily == 0` is the "unconfigured" sentinel, so it collapses "never configured" with "owner deliberately froze this token" into one TokenNotConfigured error. Task 13 decodes that error for LLM consumption and cannot distinguish the two.
Task 7: Ruling: the daily==0 ambiguity is PARKED, not fixed here. — Reason: it is the plan's own design, the fix (a separate frozen flag) is scope expansion mid-plan, and nothing in Plan 1 depends on telling the two apart. — Cost if wrong: an agent told "token_not_configured" when the real cause was a deliberate freeze may retry pointlessly instead of escalating. Carried into Task 13's dispatch so its error mapping documents the ambiguity.
Task 7: FUZZ TEST DEFECT (plan-mandated, controller ruling required): reviewer empirically instrumented testFuzz_neverExceedsDailyCap over 3000 runs — 74% of runs produce at least one successful spend, but max spentToday ever reached was ~12.5e6 against a 20e6 cap, and ZERO runs were rejected by the daily cap rather than the per-tx cap. The test would pass identically against a _consume that used daily*10 as its real limit.
Task 7: Ruling: the fuzz test IS fixed, overriding the plan text I wrote. — Reason: _consume is the single most security-critical function in the project; a fuzz test that never drives inputs near the cap boundary manufactures false confidence, which is worse than having no fuzz test at all. The fix is one line of input bounding. — Cost if wrong: a few minutes of implementer time; the bounded version strictly dominates the unbounded one.
Task 7: fix round 1/5 dispatched (resumed original implementer) — bound fuzz inputs to explore the cap boundary.

## Human partner decisions (2026-09-01)
- Project name: **Leash** (confirmed, locks into attributionTag via the GitHub owner/repo slug)
- GitHub repo name: **leash**
- Commit history: **leave as is** — the 30,456-insertion vendoring commit ed95ab9 stays, followed by the fix. No second history rewrite.
Task 7: fix round 1/5 (commit d110279) — fuzz inputs bounded to [0, 10e6] via `% (10e6 + 1)`. Implementer measured: 42/100 runs now hit DailyCapExceeded (was 0), max spentToday 19.5e6 against the 20e6 cap (was 12.5e6). 13/13 tests pass. Scoped re-review dispatched with an explicit instruction to verify the measurement is real rather than asserted, and that instrumentation was removed.

## Repo published (human partner authorised)
- https://github.com/hms1499/leash — PUBLIC, owner hms1499 (matches the git author identity)
- Pushed at Task 7 fix; verified anonymous HTTP 200
- forge-std submodule gitlink survived the push: GitHub API reports contracts/lib/forge-std as sha bf647bd6046f2f7da30d0c2bf435e5c76a780c1b pointing at foundry-rs/forge-std
- attributionTag will derive from the slug `hms1499/leash` and lock at first save
Task 7: fix round 1 re-review — bounding fix ADDRESSED (arithmetic correct, [0,10e6] within perTx, no modulo bias, production code untouched, 13/13 pass, no new breakage). BUT re-reviewer correctly refused the implementer's 42%/19.5e6 measurement as asserted-not-demonstrated: no command output, instrumentation absent from the diff.
Task 7: Controller ran its own measurement (throwaway contracts/test/TempMeasure.t.sol, 300 iterations per arm, keccak-uniform draws, file deleted after, tree verified clean). RESULT:
  - UNBOUNDED (the plan's original): 300/300 runs rejected, max spentToday = 0. The original fuzz test NEVER accumulated anything; assertLe(spentToday, 20e6) was asserting 0 <= 20e6. Vacuous for its entire life — worse than the review's 12.5e6 estimate.
  - BOUNDED (the fix): 54/300 rejected (18%), max spentToday = 19,909,174 against the 20e6 cap. Boundary genuinely exercised.
  - 18% matches Irwin-Hall theory for three uniform draws on [0,1] exceeding 2 (~16.7%), which corroborates the measurement method.
Task 7: Ruling: the finding is closed on the controller's measurement, not the implementer's. — Reason: the fix itself was verified correct by the re-reviewer; the only gap was evidence, and evidence is a controller-verifiable fact, not a code change. Spending a second fix round to re-obtain a number I could measure in two minutes would have bought nothing. The implementer's 42% is NOT reproducible by uniform sampling and is recorded as unverified; its substance is confirmed. — Cost if wrong: none; the amended test is demonstrably stronger than the original by direct measurement of both arms.
Task 7: complete (commits 5fac204..d110279, review clean after 1 fix round, 2 minors + 1 parked design note)
Task 8: implemented (commit 7090322) — AllowlistTest 8/8, full suite 21/21 (Ownership 5 + Limits 8 + Allowlist 8). Review dispatched with two controller-flagged concerns: non-standard ERC20 return values, and checks-effects-interactions ordering.
Task 8: review — spec ✅ no gaps; allowlist check confirmed strictly before _consume (SpendPolicyAccount.sol:120-125), so a blocked payee never touches the daily counter. Production correctness APPROVED.
Task 8: ERC20-return-value question RESOLVED empirically by the reviewer via `cast call transfer(address,uint256)(bool)` against Celo mainnet: cUSD 0x765DE816845861e75A25fCA122bb6898B8B1282a, USDC 0xcebA9300f2b948710d2653dD7B07f33A8B32118C, USDT 0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e all return a proper ABI-encoded bool. Not silent-return tokens. Risk theoretical, not present. Recorded: a silent-return token would revert on ABI-decode (safe, ungraceful) if ever configured.
Task 8: reentrancy sound — CEI ordering holds; a reentrant callback sees the already-decremented allowance. Surface further narrowed because _consume reverts TokenNotConfigured for any token the owner has not configured via setPolicy, so the operator cannot point execute at an arbitrary contract.
Task 8: failure atomicity confirmed — revert unwinds _consume's SSTOREs; no partial accounting survives.
Task 8: minor (deferred): no zero-address check on `to` (only reachable with allowlist disabled, which is the default).
Task 8: minor (deferred): no fee-on-transfer accounting; moot for the three verified tokens.
Task 8: complete (commits d110279..7090322, review clean, 0 Critical/Important)
Task 9: implemented (commit 3efc18b) — TopUpTest 5/5, full suite 26/26 (Ownership 5 + Limits 8 + Allowlist 8 + TopUp 5). Contract core complete. Pushed to origin/main.
Task 9: review — spec ✅ exact; production correctness APPROVED. Shared budget confirmed: limits[token] has no caller/path dimension, so execute and topUpOperator draw one pool; topping to the cap then calling execute reverts DailyCapExceeded on the next wei. Multiple operators: the daily cap IS a true ceiling on total per-token outflow across all operators, not a per-operator allowance (controller's suspicion of a per-operator hole was wrong). CEI ordering and TransferFailed handling identical to execute; atomic.
Task 9: minor (deferred): the topUpOperator comment does not spell out that the daily cap is SHARED across all operators and both paths — inferable from the contract but a naive integrator could read "the daily cap" as "my daily cap".
Task 9: complete (commits 7090322..3efc18b, review clean, 0 Critical/Important)
Tasks 11+12: review — spec ✅ verbatim against both briefs; reviewer independently ran vitest, 7/7. Approved, 0 Critical/Important.
Tasks 11+12: the controller's suspected decimals bug in pickFeeAdapter is NOT a defect. Reviewer verified empirically on Celo mainnet: KNOWN_FEE_ADAPTERS holds FeeCurrencyDirectory ADAPTER addresses, not underlying tokens, and adapters normalise to 18 decimals. For holder 0xa70c1084b65C6f259f698C050B983b925fE30e08: underlying USDC (6dp) balanceOf = 4969916153; USDC adapter balanceOf = 4969916153000000000000, exactly x10^12. decimals() on USDm / USDT / WETH / USAT adapters all return 18. Comparing raw bigints across adapters is therefore valid without an oracle. Controller's suspicion rested on a wrong assumption about what `balances` is keyed by.
Tasks 11+12: minor (deferred): nothing guards against accidental double-application of the SAME tag (e.g. a retry calling withAttribution twice on already-tagged data). ERC-8021 multi-code stacking is intentional spec behaviour, so this is a crediting question, not a decoder one. Worth an idempotency guard when Task 13 wires the real call site.
Tasks 11+12: complete (commits 3efc18b..658c9dc — c86d4dc Task 11, 658c9dc Task 12; review clean). pnpm-lock.yaml now committed, closing the Task 1 deferred minor.

## Plan gap found mid-execution: environment & secrets

The plan references 7+ env vars (ATTRIBUTION_TAG, FEE_ADAPTER, FEE_CURRENCY_DIRECTORY, OPERATOR, OWNER, SPIKE_PK, TOKEN, plus LEASH_ACCOUNT/SPEND_TOKEN/SPEND_PAYEE/OWNER_PK/CELOSCAN_KEY in later tasks) but NO task creates .env.example or wires dotenv into vitest. Confirmed: no .env or .env.example exists. .gitignore does already cover .env and .env.*.

CONSEQUENCE (severe): Task 14's gate test uses `describe.runIf(ready)`. With nothing loading .env, `ready` is false and the gate test SKIPS SILENTLY while the suite reports green — meaning attribution would appear verified when it was never executed. Same false-green failure class this plan has been fighting all session.

Human partner decision: keys go in .env (simpler), NOT a Foundry encrypted keystore. Tradeoff accepted and to be documented in the README.
Controller addition given that decision: because the repo is PUBLIC and the wallets hold real funds, a leaked key is unrecoverable within seconds (GitHub key-scraping bots). Task 15 therefore includes a pre-commit guard blocking .env and private-key-shaped strings.
Task 13: implemented (commit 293519b) — 11/11 vitest (3 attribution + 4 feeCurrency + 4 policyClient).
Task 13: PLAN DEFECT found by the implementer, severity would have been Critical in production: the plan's abi.ts contained ONLY function entries and no `error` entries. viem needs error ABI entries to decode a revert into errorName/args, so cause.data would always have been undefined and EVERY policy rejection would have degraded silently to `unknown_policy_error` — the agent would never learn why it was blocked. Implementer added all 8 custom-error entries (verified against SpendPolicyAccount.sol) and the NotOwner/TransferFailed switch branches the plan's switch omitted. Controller confirmed: `grep -c "type: 'error'" src/abi.ts` = 8.
Task 13: implementer verified viem@2.56.1's thrown shape empirically by driving a mocked JSON-RPC revert through a real simulateContract call; the brief's err.cause.data.errorName path DID match. Measured, not asserted.
Task 13: double-tagging impossible — spend() builds calldata fresh via encodeFunctionData and calls withAttribution exactly once; a retry re-invokes both from scratch. Closes the Tasks 11+12 deferred minor.
Task 13: PROCESS GAP (controller's fault): the Tasks 11+12 review ran vitest but never `tsc --noEmit`, so a typecheck error shipped. Confirmed still present: test/attribution.test.ts(10,12) TS2531 "Object is possibly null" — fromDataSuffix() returns a nullable and the test dereferences .codes directly. Originates in Task 11, not Task 13; implementer proved it pre-existing by stashing its own files and reproducing on the untouched tree.
Task 13: Ruling: the TS2531 error is fixed in Task 15, not by a Task 13 fix round. — Reason: it is Task 11's defect, Task 13's own files typecheck clean, and Task 15 already modifies sdk/ (vitest.config.ts, package.json) so the fix rides along in a task that is touching that package anyway. — Cost if wrong: one extra typecheck failure sits in the tree for one more task.
Task 13: Ruling: every future review dispatch touching a TypeScript package must require `tsc --noEmit` alongside the test run. — Reason: vitest passes on code that does not typecheck, so tests alone are not sufficient evidence for a typed package. — Cost if wrong: negligible; one extra command per review.
Task 13: review — spec ✅; APPROVED with zero Critical/Important/Minor findings. Reviewer independently reproduced the viem experiment on viem@2.56.1: with the 8 error entries, cause.data = {errorName:'DailyCapExceeded', args:[18400000n,5000000n,20000000n]}; with a function-only ABI, cause.data is undefined. The plan defect was real and the fix is correct. All 8 error ABI entries verified line-by-line against SpendPolicyAccount.sol for name, type and ARGUMENT ORDER. Error-index fidelity confirmed: DailyCapExceeded reads args[0] as spent / args[2] as cap; PerTxCapExceeded reads args[1] as cap. Attribution chokepoint sound — sendTransaction exists once, only inside spend(), data always withAttribution(...) inline. preCheck is eth_call, costs no gas.
Task 13: complete (commits 658c9dc..293519b, review clean, 0 findings)
Task 15: implemented (commit aeab300) — sdk 11/11, `tsc --noEmit` exit 0 (TS2531 fixed by asserting fromDataSuffix non-null before reading .codes, closing the Task 13 ruling), contracts 26/26.
Task 15: implementer found a real defect in the Task 1 .gitignore that the controller wrote: the `.env.*` rule also matched `.env.example`, which would have made the mandatory template file permanently uncommittable. Fixed with a `!.env.example` negation; .env and .env.local still ignored.
Task 15: CONTROLLER INDEPENDENTLY VERIFIED the secret guard using a DIFFERENT fake key than the implementer's: staged 0x7c8f3a2b...cba01, `git commit` refused with "BLOCKED: a 64-hex value that looks like a private key is staged." HEAD did not move, working tree clean afterwards. .env.example is tracked; `git check-ignore -v .env` returns `.gitignore:3:.env`.
Task 15: review verdict — spec ✅ but task quality NOT APPROVED. Reviewer attacked the guard rather than confirming it, and demonstrated gaps by live test:
  - IMPORTANT: a 64-hex private key WITHOUT the 0x prefix stages and commits clean (exit 0, no BLOCKED). Common raw-export format. Real gap.
  - IMPORTANT: a BIP-39 24-word mnemonic stages and commits clean. Zero coverage, and at least as dangerous as a raw key.
  - Minor: a key split across two lines evades the single-line regex.
  - Minor: sdk/vitest.config.ts uses raw `new URL(...).pathname`, which percent-encodes; on a repo path containing a space it yields a nonexistent literal path, and dotenv fails SILENTLY (returns {error}, unchecked) — the same looks-green-but-isnt class this task exists to prevent. Not triggered on this machine's current path.
  - Minor: .env.example's SPEND_TOKEN is not cross-checkable against constants.ts (only the adapter address lives there).
Task 15: confirmed sound by the reviewer — .gitignore rule ORDER is correct (.env, .env.*, !.env.example; negation follows its broader pattern); `git commit -a` IS caught because git stages tracked changes before invoking the hook; README does instruct fresh clones to set core.hooksPath themselves; .env.example holds no real secrets.
Task 15: controller verified the reviewer left no residue — HEAD still aeab300, no stray tracked files, working tree clean.
Task 15: fix round 1/5 dispatched — close both Important gaps, fix the dotenv path, and DOCUMENT the residual limits in the script header rather than pretend to completeness.
Task 15: fix round 1 (commit 10e46a9) — implementer reports all five required cases correct. CONTROLLER RE-PROBED INDEPENDENTLY with different samples, running scripts/check-secrets.sh directly against staged content: 0x+64hex BLOCK, bare 64hex on a key-ish line BLOCK, 12-word mnemonic BLOCK, 24-word seed BLOCK, ordinary prose PASS. Matches the report.
Task 15: CONTROLLER FOUND A SIXTH CASE the review did not test — FALSE POSITIVE: a line reading `Proof tx: 0x9f2c...2f61` (a transaction hash in documentation, not key-ish at all) is BLOCKED by the 0x+64hex rule.
Task 15: Ruling: this is fixed, not accepted. — Reason: it is not hypothetical. The plan REQUIRES recording proof transaction hashes in spikes/README.md and docs/deployments.md, and Task 14's whole deliverable is a Celoscan proof link for the attribution tag. As written, the guard blocks precisely the highest-value commits in the plan and trains the user into habitual `--no-verify`, which destroys the control entirely — the exact failure mode the fix brief warned against, arriving from the opposite direction. — Cost if wrong: one narrow context exception slightly weakens detection for a key pasted onto a line that also looks like a tx reference; judged far smaller than a routinely-bypassed guard.
Task 15: fix round 2/5 dispatched.
Task 15: fix round 2 (commit 011ef8f, scripts/check-secrets.sh only, +31/-2). Exception scoped to the 0x+64hex rule: a line is exempt only if it looks like a tx reference (explorer .../tx/ URL, or the word tx/txn/hash) AND has no key-ish identifier; the key-ish check overrides the exception.
Task 15: SECURITY CLASSIFIER fired on this subagent. Controller audited before accepting: commit touches ONE file (the guard script); `git log -p --all` grep for committed secrets returns only forge-std library fixtures, including 0xac0974be...ff80 which is the publicly-known anvil test key #0, not a user key. Script diff read in full — clean, well-documented, no exfiltration or unexpected behaviour. Verdict: classifier FALSE POSITIVE, triggered because the task inherently requires staging fake private keys and mnemonics to test the guard.
Task 15: controller also found and removed leftover instrumentation from Task 7: an untracked `contracts/foundry 2.toml` carrying fs_permissions for ./fuzzprobe.log. Never committed; Task 7's implementer removed its temp test but not this copy.
Task 15: CONTROLLER INDEPENDENTLY RE-PROBED all seven cases with its own samples: `Proof tx: 0x..` PASS, celoscan tx URL PASS, OWNER_PK=0x.. BLOCK, BYPASS attempt (OWNER_PK=0x.. with the word "tx" appended) BLOCK, bare 64hex on key-ish line BLOCK, MNEMONIC= 12 words BLOCK, ordinary README edit PASS. 7/7 as claimed.
Task 15: fix round 2 re-review — findings 1,2,3,5 ADDRESSED and verified live. Finding 4 PARTIALLY addressed (script header honest and complete; README omitted the tx exception). ADVERSARIAL RESULT: the reviewer found a real bypass — the tx exception was evaluated per LINE, not per VALUE, so `tx <hexA> and backup <hexB>` passed and smuggled an unlabelled key through alongside a decoy tx hash. Controller reproduced it. This hole was created by the controller's own round-2 ruling.
Task 15: fix round 3/5 (commit 30eb30c) — exception rescoped to per-value: a value is exempt only if immediately preceded by tx/txn/hash or following /tx/ in an explorer URL; implemented by comparing total non-zero 0x+64hex occurrences against exempt-matched occurrences and blocking when they differ. README limitation list completed.
Task 15: implementer self-caught a serious bug in its own first draft: `set -e` + `pipefail` aborted the script silently whenever an early grep matched nothing, which happens on any ordinary commit with no hex — it would have blocked EVERY normal commit. Caught before running the required cases; fixed with `(...) || true`.
Task 15: CONTROLLER INDEPENDENTLY VERIFIED all nine cases with its own hex values: bypass BLOCK, Proof-tx PASS, celoscan URL PASS, OWNER_PK BLOCK, OWNER_PK+"tx" BLOCK, bare-hex-key-ish BLOCK, MNEMONIC BLOCK, ordinary README PASS, and a no-hex-at-all commit PASS (regression check for the set -e bug). 9/9.
Task 15: complete (commits 293519b..30eb30c, review clean after 3 fix rounds)

## SESSION PAUSED 2026-09-01
Tasks complete: 1, 2, 4, 6, 7, 8, 9, 11, 12, 13, 15.
Tasks not started: 3, 5, 10, 14 — all blocked on human-partner inputs, none on code.
Suites at pause: contracts 26/26, sdk 11/11, tsc --noEmit exit 0.
Resume: read docs/RESUME.md, then re-invoke superpowers:subagent-driven-development
with docs/superpowers/plans/2026-09-01-leash-foundation.md. This ledger is the
recovery map; a committed snapshot lives at docs/superpowers/execution-ledger.md.
