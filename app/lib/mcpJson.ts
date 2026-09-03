export type McpHandoff = {
  account: `0x${string}`
  token: `0x${string}`
  feeAdapter: `0x${string}`
  attributionTag: string
}

/**
 * The one value this app must never learn. The operator key is pasted by the
 * user, locally, into the file this block becomes.
 */
export const OPERATOR_PK_PLACEHOLDER = '0xYourAgentOperatorPrivateKey'

/**
 * The same check mcp/src/config.ts:36 makes at startup.
 *
 * It is duplicated here on purpose: the wizard already validates the fee
 * adapter against the live on-chain directory, but it wrote whatever was
 * typed into ATTRIBUTION_TAG. A user who types `celo_mytag` got a .mcp.json
 * that looks finished and a server that throws before its first tool call,
 * which their agent reports as "server failed to connect" with the real
 * message buried. Catching it here costs one regex; catching it there costs
 * the user the whole handoff.
 *
 * If the server's rule ever changes, these two must change together.
 */
export const ATTRIBUTION_TAG_SHAPE = /^celo_[0-9a-f]{12}$/

export function isAttributionTag(value: string): boolean {
  return ATTRIBUTION_TAG_SHAPE.test(value)
}

/** Mirrors the block documented in docs/mcp-setup.md. */
export function buildMcpJson(h: McpHandoff): string {
  return JSON.stringify(
    {
      mcpServers: {
        leash: {
          command: 'npx',
          args: ['-y', 'tsx', '/absolute/path/to/leash/mcp/src/index.ts'],
          env: {
            LEASH_ACCOUNT: h.account,
            OPERATOR_PK: OPERATOR_PK_PLACEHOLDER,
            ATTRIBUTION_TAG: h.attributionTag,
            SPEND_TOKEN: h.token,
            FEE_ADAPTER: h.feeAdapter,
          },
        },
      },
    },
    null,
    2,
  )
}
