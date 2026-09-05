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

/**
 * What ATTRIBUTION_TAG reads as when the real one is missing or malformed.
 *
 * Deliberately a value `isAttributionTag` refuses: a placeholder the server
 * would accept is worse than none, because it looks configured and then
 * misattributes every transaction.
 */
export const ATTRIBUTION_TAG_PLACEHOLDER = 'celo_yourtag'

/**
 * The tag to show, given whatever the caller has.
 *
 * This lives here, next to the block builder, because it used to live in the
 * callers: /setup substituted the placeholder and the landing page did not,
 * so the landing shipped `"ATTRIBUTION_TAG": ""` under a note telling the
 * reader to replace `celo_yourtag` — a string that block did not contain.
 * Anyone who copied it got a server that threw "ATTRIBUTION_TAG is not set"
 * before its first tool call.
 *
 * Deriving it from the tag's shape rather than from a caller-supplied status
 * is the point: a new caller cannot reintroduce the bug by forgetting a step.
 */
export function displayTag(tag: string): string {
  return isAttributionTag(tag) ? tag : ATTRIBUTION_TAG_PLACEHOLDER
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
            ATTRIBUTION_TAG: displayTag(h.attributionTag),
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
