import { createPublicClient, http } from 'viem'
import { celo } from 'viem/chains'
import { createConfig, injected } from 'wagmi'

export const RPC_URL =
  process.env.NEXT_PUBLIC_CELO_RPC_URL ?? 'https://forno.celo.org'

/**
 * One transport, shared by the read client and by wagmi, so a change to the
 * rate-limit defences below cannot apply to only half the app.
 *
 * `retryDelay` is raised from viem's default 150ms. viem already retries an
 * HTTP 429 (and a JSON-RPC body carrying `code: 429`) with an exponential
 * backoff of `(1 << attempt) * retryDelay`, but 150/300/600ms is far inside a
 * public endpoint's rate-limit window: all three retries land while the same
 * limit is still in force, so the burst that caused the 429 is answered with
 * three more requests. 500 gives 500/1000/2000ms, which is long enough for a
 * per-second bucket to refill.
 *
 * The pollers that call this client each hold an in-flight guard, so a read
 * that spends 3.5s in backoff cannot have the next 4s tick stack another one
 * on top of it. Without those guards a longer retryDelay makes rate limiting
 * worse, not better.
 */
const transport = http(RPC_URL, { retryDelay: 500 })

/**
 * Read path. Used by every page, including with no wallet connected.
 *
 * `batch.multicall` is the reason this app can be read from a public RPC at
 * all. Every `eth_call` issued in the same macrotask is aggregated into one
 * `aggregate3` against Multicall3 — `0xcA11bde05977b3631167028862bE2a173976CA11`,
 * which viem already carries in its `celo` chain definition — so one HTTP
 * request goes out instead of one per read. Measured against this code:
 *
 *   useAccountState's Promise.all      6 requests -> 1, every 4 seconds
 *   /accounts verification, per batch  5 candidates x 3 reads = 15 -> 1
 *   the setup wizard's paired reads    2 -> 1
 *
 * That is what was producing `POST .../celo 429 (Too Many Requests)` on every
 * dashboard load: roughly 2 requests per second per open tab, against free
 * public endpoints (forno, rpc.ankr.com/celo) that do not serve that rate.
 *
 * A failing call inside the batch stays that call's failure. viem sends
 * `allowFailure: true` for every leg and rethrows per caller, so the
 * revert-means-not-a-Leash-account check in AccountsPage still rejects one
 * candidate without failing the four beside it.
 *
 * This does NOT batch `eth_getLogs` or `eth_blockNumber` — Multicall3 only
 * aggregates calls. The feed's history walk is still (window / 5,000)
 * sequential round trips; see WINDOW_BLOCKS in lib/feed.ts.
 */
export const publicClient = createPublicClient({
  chain: celo,
  transport,
  batch: { multicall: true },
})

/**
 * Injected only, and no wallet-selection modal.
 *
 * MiniPay is an in-app browser that injects window.ethereum itself; a modal
 * asking which wallet to use is both wrong there and a recognisable template
 * everywhere else.
 */
export const wagmiConfig = createConfig({
  chains: [celo],
  connectors: [injected()],
  transports: { [celo.id]: transport },
  // Required under the App Router. Without it wagmi rehydrates its persisted
  // connection synchronously during render, so a returning visitor whose
  // wallet was already connected gets a hydration mismatch the first time a
  // component branches on `isConnected`.
  ssr: true,
})

/** True inside the MiniPay in-app browser, which auto-connects. */
export function isMiniPay(): boolean {
  if (typeof window === 'undefined') return false
  const eth = (window as { ethereum?: { isMiniPay?: boolean } }).ethereum
  return Boolean(eth?.isMiniPay)
}

/**
 * Every write in this app is a transaction against a contract on Celo. wagmi
 * will not assert this for us: writeContract/deployContract call
 * getConnectorClient with assertChainId:false and pass `chain: null` to viem
 * unless an explicit chainId is given, so a wallet left on another network
 * signs and broadcasts there. Passing this to every write turns that into a
 * clean rejection; the callers check it first so the message can say what to
 * do about it.
 */
export const REQUIRED_CHAIN_ID = celo.id

/**
 * Explicit gas limit for the deployment, because a browser wallet asked to
 * estimate one may simply fail.
 *
 * Measured 2026-09-04: OKX Wallet on Celo showed "Network fee estimation
 * unsuccessful", a Network fee of `--`, and a Confirm button that could not be
 * pressed. The request it received carried only `data` and `from` -- viem adds
 * nothing Celo-specific, and the transaction itself is sound: `cast estimate
 * --create` and viem's `estimateGas` both returned 797,607 for it against
 * mainnet, from that same wallet, which held 12.5 CELO. With no `gas` in the
 * request the wallet had nothing to fall back on when its own estimator came
 * back empty, so a working deployment was unreachable.
 *
 * 1,200,000 is the measured 797,607 with half again as much room. Unused gas
 * is refunded, so an over-estimate costs nothing; `sdk/src/policyClient.ts`
 * carries the same reasoning and the price of getting it wrong.
 */
export const DEPLOY_GAS = 1_200_000n

export const WRONG_NETWORK =
  'Your wallet is on another network. Switch it to Celo — the badge in the header does it — and try again.'
/**
 * Gas limits for the owner's writes, so a wallet whose estimator fails still
 * has a number to sign with.
 *
 * This is NOT the fee-currency hazard CLAUDE.md documents. That one is about
 * CIP-64 sends from the operator, where a missing limit makes the node reserve
 * the *block* gas limit in USDC — measured at 0.465 against 0.0022 actually
 * spent — and it lives in `sdk/src/policyClient.ts`. These writes are signed by
 * a browser wallet paying gas in CELO, and the wallet shows the fee first.
 *
 * The hazard here is the one DEPLOY_GAS above already records: OKX Wallet on
 * Celo, 2026-09-04, "Network fee estimation unsuccessful", a fee of `--`, and a
 * Confirm button that could not be pressed — because the request carried no
 * `gas` to fall back on when its own estimator came back empty. Nothing about
 * that was specific to contract creation, and `setPaused` is the kill switch.
 *
 * Measured with `cast estimate` on Celo mainnet, 2026-09-09, from the owner EOA
 * against account 0x7aDa926B:
 *
 *   setPolicy             28,762      setAllowlistEnabled   26,233
 *   setOperator           26,845      setAllowlist          46,086
 *   setPaused(true)       45,150      sweep                 51,181
 *   ERC-20 transfer       45,427
 *
 * Every figure below is roughly double its measurement, and deliberately so:
 * that account is already in use, and an estimate taken against warm storage
 * UNDERSTATES a fresh one. A slot going 0 -> non-zero costs 20,000 where
 * non-zero -> non-zero costs 2,900, so on a brand-new account `setPolicy`
 * writes two cold slots (~63,000, not 28,762), `setOperator` one (~44,000), and
 * a transfer to an address holding nothing is ~17,000 dearer than the figure
 * above. A first-run wizard is exactly the case these have to cover.
 *
 * Unused gas is refunded, so an over-estimate costs nothing and an
 * under-estimate turns a working button into a failed transaction.
 */
export const SET_POLICY_GAS = 120_000n
export const SET_OPERATOR_GAS = 100_000n
export const SET_ALLOWLIST_GAS = 100_000n
export const SET_ALLOWLIST_ENABLED_GAS = 80_000n
export const SET_PAUSED_GAS = 100_000n
export const SWEEP_GAS = 150_000n
export const ERC20_TRANSFER_GAS = 120_000n
