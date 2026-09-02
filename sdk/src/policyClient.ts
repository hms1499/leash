import {
  createPublicClient, createWalletClient, http, encodeFunctionData,
  type Account,
} from 'viem'
import { celo } from 'viem/chains'
import { spendPolicyAccountAbi } from './abi.js'
import { withAttribution } from './attribution.js'
import { pickFeeAdapter } from './feeCurrency.js'

// Typed via ReturnType rather than the bare `PublicClient`/`WalletClient`
// generics: annotating the fields with the bare imported types produced a
// "two different types with this name exist, but they are unrelated" error
// from tsc, because the bare types' default generic parameters don't
// structurally match what `createPublicClient({ chain: celo, ... })` actually
// infers. Deriving the field type from the constructor call sidesteps that.
type LeashPublicClient = ReturnType<typeof createPublicClient<ReturnType<typeof http>, typeof celo>>
type LeashWalletClient = ReturnType<typeof createWalletClient<ReturnType<typeof http>, typeof celo, Account>>

export type PreCheckResult =
  | { ok: true }
  | { ok: false; error: string; spent: bigint; cap: bigint }

/**
 * Maps a contract custom error onto a shape an LLM can act on.
 * Agents route around structured errors and stall on revert hex.
 */
export function describePreCheckFailure(
  revert: { name: string; args: readonly unknown[] },
): PreCheckResult {
  switch (revert.name) {
    case 'DailyCapExceeded':
      return {
        ok: false, error: 'daily_cap_exceeded',
        spent: revert.args[0] as bigint,
        cap: revert.args[2] as bigint,
      }
    case 'PerTxCapExceeded':
      return {
        ok: false, error: 'per_tx_cap_exceeded',
        spent: 0n,
        cap: revert.args[1] as bigint,
      }
    case 'PayeeNotAllowed':
      return { ok: false, error: 'payee_not_allowed', spent: 0n, cap: 0n }
    case 'TokenNotConfigured':
      // NOTE: the contract uses `daily == 0` as its "token not configured"
      // sentinel (see SpendPolicyAccount.sol). That means a token the owner
      // deliberately FROZE (by setting its daily cap to 0) is indistinguishable
      // on-chain from a token that was never configured at all — both revert
      // with this same error. Do not read `token_not_configured` as "call
      // configureToken and retry"; it may instead mean "this token was
      // intentionally frozen." The SDK cannot tell the two apart from this
      // revert alone, and neither should an agent consuming this JSON.
      return { ok: false, error: 'token_not_configured', spent: 0n, cap: 0n }
    case 'ContractPaused':
      return { ok: false, error: 'account_paused', spent: 0n, cap: 0n }
    case 'NotOperator':
      return { ok: false, error: 'not_an_operator', spent: 0n, cap: 0n }
    case 'NotOwner':
      return { ok: false, error: 'not_owner', spent: 0n, cap: 0n }
    case 'TransferFailed':
      return { ok: false, error: 'transfer_failed', spent: 0n, cap: 0n }
    default:
      return { ok: false, error: 'unknown_policy_error', spent: 0n, cap: 0n }
  }
}

/**
 * Builds tagged `execute` calldata. Exported for testing: the tag is the thing
 * that must never be missing or doubled, and asserting on bytes is the only
 * honest way to check that.
 */
export function buildSpendCalldata(
  token: `0x${string}`, to: `0x${string}`, amount: bigint, tag: string,
): `0x${string}` {
  return withAttribution(
    encodeFunctionData({ abi: spendPolicyAccountAbi, functionName: 'execute', args: [token, to, amount] }),
    tag,
  )
}

/** Builds tagged `topUpOperator` calldata. */
export function buildTopUpCalldata(
  token: `0x${string}`, amount: bigint, tag: string,
): `0x${string}` {
  return withAttribution(
    encodeFunctionData({ abi: spendPolicyAccountAbi, functionName: 'topUpOperator', args: [token, amount] }),
    tag,
  )
}

/**
 * Explicit gas limit for every transaction this client sends.
 *
 * Not an optimisation — it is what makes a low-balance operator able to
 * transact at all. When a `feeCurrency` transaction carries no gas limit, the
 * node reserves `blockGasLimit * gasPrice` against the operator's stablecoin
 * balance before it will even simulate. On Celo mainnet that is 30,000,000 gas,
 * measured at **0.465 USDC** of reserve against ~0.0022 actually spent: a 209x
 * demand that makes `topUpOperator` unreachable for exactly the operator that
 * needs it, since a wallet short of the price is far shorter of the reserve.
 *
 * With the limit set, the reserve is `gas * gasPrice` — about 0.003 USDC.
 * Unused gas is not charged, so an over-estimate costs nothing. `execute` and
 * `topUpOperator` both measured ~150k; 300k is that with room.
 */
const GAS_LIMIT = 300_000n

export class LeashClient {
  readonly #pub: LeashPublicClient
  readonly #wallet: LeashWalletClient
  readonly #account: Account
  readonly #address: `0x${string}`
  readonly #tag: string

  constructor(opts: {
    account: Account
    accountAddress: `0x${string}`
    attributionTag: string
    rpcUrl?: string
  }) {
    this.#account = opts.account
    this.#address = opts.accountAddress
    this.#tag = opts.attributionTag
    this.#pub = createPublicClient({
      chain: celo, transport: http(opts.rpcUrl),
    })
    this.#wallet = createWalletClient({
      account: opts.account, chain: celo, transport: http(opts.rpcUrl),
    })
  }

  async remainingToday(token: `0x${string}`): Promise<bigint> {
    return this.#pub.readContract({
      address: this.#address,
      abi: spendPolicyAccountAbi,
      functionName: 'remainingToday',
      args: [token],
    })
  }

  /** Simulates the spend so a rejected call costs no gas. */
  async preCheck(
    token: `0x${string}`, to: `0x${string}`, amount: bigint,
  ): Promise<PreCheckResult> {
    try {
      await this.#pub.simulateContract({
        address: this.#address,
        abi: spendPolicyAccountAbi,
        functionName: 'execute',
        args: [token, to, amount],
        account: this.#account,
      })
      return { ok: true }
    } catch (err) {
      // viem 2.x throws `ContractFunctionExecutionError` from a failed
      // `simulateContract`, whose `.cause` is a `ContractFunctionRevertedError`
      // carrying the decoded revert as `.data = { errorName, args, abiItem }`
      // — confirmed against the installed viem@2.56.1 by driving a mocked
      // JSON-RPC "execution reverted" response through the real
      // `simulateContract` pipeline. `.data` only decodes when the ABI passed
      // to `simulateContract` includes the `error` entries (see abi.ts) — a
      // function-only ABI leaves `.data` undefined and every rejection would
      // fall through to `unknown_policy_error`.
      const data = (err as { cause?: { data?: { errorName?: string; args?: readonly unknown[] } } })
        .cause?.data
      return describePreCheckFailure({
        name: data?.errorName ?? 'unknown',
        args: data?.args ?? [],
      })
    }
  }

  /**
   * Sends a policy-checked spend, tagged and paying gas in a stablecoin.
   *
   * Calldata is built fresh from `encodeFunctionData` on every call and
   * tagged exactly once via `withAttribution` before being sent — nothing is
   * cached or reused across calls, so a caller retrying a failed `spend()`
   * gets a freshly built, freshly tagged transaction rather than a re-tag of
   * already-tagged bytes.
   */
  async spend(
    token: `0x${string}`, to: `0x${string}`, amount: bigint,
    feeBalances: ReadonlyMap<`0x${string}`, bigint>,
  ): Promise<`0x${string}`> {
    return this.#sendRaw({
      to: this.#address,
      data: buildSpendCalldata(token, to, amount, this.#tag),
      feeCurrency: pickFeeAdapter(feeBalances),
    })
  }

  /**
   * One place where a transaction is handed to the wallet, so attribution and
   * fee currency cannot be bypassed by a new method forgetting to apply them.
   */
  async #sendRaw(tx: { to: `0x${string}`; data: `0x${string}`; feeCurrency: `0x${string}` }) {
    return this.#wallet.sendTransaction({
      account: this.#account,
      chain: celo,
      to: tx.to,
      data: tx.data,
      feeCurrency: tx.feeCurrency,
      gas: GAS_LIMIT,
    })
  }

  /** How much of `token` the operator EOA itself holds. */
  async operatorBalance(token: `0x${string}`): Promise<bigint> {
    return this.#pub.readContract({
      address: token,
      abi: [{
        name: 'balanceOf', type: 'function', stateMutability: 'view',
        inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }],
      }] as const,
      functionName: 'balanceOf',
      args: [this.#account.address],
    })
  }

  /** How much of `token` the Leash account itself holds. */
  async accountBalance(token: `0x${string}`): Promise<bigint> {
    return this.#pub.readContract({
      address: token,
      abi: [{
        name: 'balanceOf', type: 'function', stateMutability: 'view',
        inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }],
      }] as const,
      functionName: 'balanceOf',
      args: [this.#address],
    })
  }

  /** The configured policy for `token`, straight off the contract. */
  async limits(token: `0x${string}`): Promise<{ perTx: bigint; daily: bigint; spentToday: bigint }> {
    const [perTx, daily, spentToday] = await this.#pub.readContract({
      address: this.#address,
      abi: spendPolicyAccountAbi,
      functionName: 'limits',
      args: [token],
    }) as readonly [bigint, bigint, bigint, bigint]
    return { perTx, daily, spentToday }
  }

  /** Simulates a top-up so a rejected draw costs no gas. */
  async preCheckTopUp(token: `0x${string}`, amount: bigint): Promise<PreCheckResult> {
    try {
      await this.#pub.simulateContract({
        address: this.#address,
        abi: spendPolicyAccountAbi,
        functionName: 'topUpOperator',
        args: [token, amount],
        account: this.#account,
      })
      return { ok: true }
    } catch (err) {
      const data = (err as { cause?: { data?: { errorName?: string; args?: readonly unknown[] } } })
        .cause?.data
      return describePreCheckFailure({
        name: data?.errorName ?? 'unknown',
        args: data?.args ?? [],
      })
    }
  }

  /**
   * Moves funds from the contract to the operator EOA under policy.
   *
   * This is Path B, and it is the only way x402 money can leave the contract:
   * `_consume` applies the per-tx and daily caps here, at the moment of the
   * draw. The payee allowlist deliberately does not apply — once funds sit in
   * the operator's own wallet the contract cannot police where they go, which
   * is exactly why the daily cap is the guarantee being made.
   */
  async topUp(
    token: `0x${string}`,
    amount: bigint,
    feeBalances: ReadonlyMap<`0x${string}`, bigint>,
  ): Promise<`0x${string}`> {
    return this.#sendRaw({
      to: this.#address,
      data: buildTopUpCalldata(token, amount, this.#tag),
      feeCurrency: pickFeeAdapter(feeBalances),
    })
  }
}
