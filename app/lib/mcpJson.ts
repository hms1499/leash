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
