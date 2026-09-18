import { getAddress, isAddress } from 'viem'
import { CELO_USDC, CELO_USDC_FEE_ADAPTER } from '@leash/sdk'

export type LeashConfig = {
  accountAddress: `0x${string}`
  operatorPk: `0x${string}`
  attributionTag: string
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
 * Reads configuration once, at startup, and fails loudly.
 *
 * Every check here is a failure that would otherwise appear much later as an
 * unexplained RPC error inside a tool call an agent cannot debug.
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
  const tag = requireEnv(env, 'ATTRIBUTION_TAG')
  if (!/^celo_[0-9a-f]{12}$/.test(tag)) {
    throw new Error(`ATTRIBUTION_TAG must look like celo_ plus 12 hex characters, got "${tag}"`)
  }
  const token = addressOr(env, 'SPEND_TOKEN', CELO_USDC)
  return {
    accountAddress: requireAddress(env, 'LEASH_ACCOUNT'),
    operatorPk: pk as `0x${string}`,
    attributionTag: tag,
    token: token.value,
    tokenFromDefault: token.fromDefault,
    feeAdapter: addressOr(env, 'FEE_ADAPTER', CELO_USDC_FEE_ADAPTER).value,
    rpcUrl: env.CELO_RPC_URL,
  }
}
