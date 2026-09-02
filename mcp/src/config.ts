import { getAddress, isAddress } from 'viem'

export type LeashConfig = {
  accountAddress: `0x${string}`
  operatorPk: `0x${string}`
  attributionTag: string
  token: `0x${string}`
  feeAdapter: `0x${string}`
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
 * Reads configuration once, at startup, and fails loudly.
 *
 * Every check here is a failure that would otherwise appear much later as an
 * unexplained RPC error inside a tool call an agent cannot debug.
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
  return {
    accountAddress: requireAddress(env, 'LEASH_ACCOUNT'),
    operatorPk: pk as `0x${string}`,
    attributionTag: tag,
    token: requireAddress(env, 'SPEND_TOKEN'),
    feeAdapter: requireAddress(env, 'FEE_ADAPTER'),
    rpcUrl: env.CELO_RPC_URL,
  }
}
