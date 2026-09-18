import { getAddress, isAddress } from 'viem'
import {
  ATTRIBUTION_CODE_SHAPE, CELO_USDC, CELO_USDC_FEE_ADAPTER, LEASH_ATTRIBUTION_CODE,
} from '@leash/sdk'

export type LeashConfig = {
  accountAddress: `0x${string}`
  operatorPk: `0x${string}`
  /**
   * The ERC-8021 codes every transaction carries, in suffix order.
   *
   * Always at least `LEASH_ATTRIBUTION_CODE`, because this app emitted the
   * transaction. A second code is the caller's own, when they have one.
   */
  attributionCodes: readonly string[]
  token: `0x${string}`
  feeAdapter: `0x${string}`
  /**
   * Whether `token` came from the default rather than from `SPEND_TOKEN`.
   *
   * Read by `statusTool` and nothing else. A defaulted token that no policy
   * was set on answers `limits()` with `0/0/0` — indistinguishable from an
   * exhausted allowance — so the one place that can say "you may be looking at
   * the wrong token" needs to know whether the user chose it.
   */
  tokenFromDefault: boolean
  rpcUrl?: string
}

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const v = env[name]
  if (!v) throw new Error(`${name} is not set. The Leash MCP server needs it to start.`)
  return v
}

function requireAddress(env: NodeJS.ProcessEnv, name: string): `0x${string}` {
  const v = requireEnv(env, name)
  if (!isAddress(v)) throw new Error(`${name} is not a valid address: ${v}`)
  return getAddress(v)
}

/**
 * An address the user may supply, falling back to a Celo mainnet constant.
 *
 * Set but malformed still throws: a default that silently replaced a typo
 * would be worse than the missing variable, because the user would be told
 * nothing while spending a token they did not name.
 */
function addressOr(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: `0x${string}`,
): { value: `0x${string}`; fromDefault: boolean } {
  const v = env[name]
  if (!v) return { value: getAddress(fallback), fromDefault: true }
  if (!isAddress(v)) throw new Error(`${name} is not a valid address: ${v}`)
  return { value: getAddress(v), fromDefault: false }
}

/**
 * The codes this server's transactions carry.
 *
 * `LEASH_ATTRIBUTION_CODE` is unconditional: `@celo/attribution-tags` says a
 * code is added by the entity it represents, and the entity that built and
 * signed this transaction is `leash-agentpay` whoever started it.
 *
 * `ATTRIBUTION_TAG` was required until 0.5.0 and is now the optional second
 * code, for a builder shipping their own registered product on top of this
 * server. Requiring it asked every user for a value representing something
 * they were not, and the advice it came with -- invent twelve random hex
 * characters -- produced a code representing nobody at all.
 *
 * Set but malformed still throws. A builder who has a code and mistyped it
 * wants to hear about it now: attribution is not retroactive, and a
 * transaction already mined without their code can never gain it.
 */
function attributionCodes(env: NodeJS.ProcessEnv): readonly string[] {
  const own = env.ATTRIBUTION_TAG
  if (!own) return [LEASH_ATTRIBUTION_CODE]
  if (!ATTRIBUTION_CODE_SHAPE.test(own)) {
    throw new Error(`ATTRIBUTION_TAG must look like celo_ plus 12 hex characters, got "${own}"`)
  }
  // Ours first, theirs second: the order the suffix is read back in, and the
  // order the layering rule describes -- the app's own code, then the caller's.
  return own === LEASH_ATTRIBUTION_CODE ? [own] : [LEASH_ATTRIBUTION_CODE, own]
}

/**
 * Reads configuration once, at startup, and fails loudly.
 *
 * Every check here is a failure that would otherwise appear much later as an
 * unexplained RPC error inside a tool call an agent cannot debug.
 *
 * `SPEND_TOKEN`, `FEE_ADAPTER` and `ATTRIBUTION_TAG` are all optional, which
 * leaves `LEASH_ACCOUNT` and `OPERATOR_PK` as the whole of what a user must
 * supply.
 *
 * `SPEND_TOKEN` and `FEE_ADAPTER` are optional. They were required until
 * 0.4.0, which put two 42-character addresses in front of every user — values
 * they had no way to verify and that fail in two different unhelpful ways when
 * mistyped: a wrong `FEE_ADAPTER` is rejected at the node when the first
 * transaction is sent, and a wrong `SPEND_TOKEN` is not rejected at all, it
 * just reports a cap of zero forever. The product has only ever supported USDC
 * on Celo mainnet, so the defaults state what was already true rather than
 * choosing anything new.
 */
export function loadConfig(env: NodeJS.ProcessEnv): LeashConfig {
  const pk = requireEnv(env, 'OPERATOR_PK')
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    throw new Error('OPERATOR_PK is not a 32-byte hex private key')
  }
  const token = addressOr(env, 'SPEND_TOKEN', CELO_USDC)
  return {
    accountAddress: requireAddress(env, 'LEASH_ACCOUNT'),
    operatorPk: pk as `0x${string}`,
    attributionCodes: attributionCodes(env),
    token: token.value,
    tokenFromDefault: token.fromDefault,
    feeAdapter: addressOr(env, 'FEE_ADAPTER', CELO_USDC_FEE_ADAPTER).value,
    rpcUrl: env.CELO_RPC_URL,
  }
}
