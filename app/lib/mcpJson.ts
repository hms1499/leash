export type McpHandoff = {
  account: `0x${string}`
  attributionTag: string
}

/**
 * The one value this block must never carry.
 *
 * This used to read "the one value this app must never learn", which stopped
 * being true when /setup grew a Generate agent wallet button -- it makes a
 * keypair in the tab, so the app does learn one. What survives, narrower and
 * still load-bearing, is stated here: the key never reaches this block. The
 * user pastes it into the file themselves, and that paste is the moment they
 * find out the file is now a secret.
 *
 * agentKey.test.ts asserts a generated key cannot reach the output of
 * buildMcpJson.
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

/**
 * Mirrors the block documented in docs/mcp-setup.md.
 *
 * It carried `SPEND_TOKEN` and `FEE_ADAPTER` until leash-agentpay 0.4.0 made
 * them optional. Both were 42-character addresses a reader had no way to check
 * and every reader got the same two values, because the product has only ever
 * supported USDC on Celo mainnet -- and the two ways they failed when mistyped
 * were an unreadable node rejection and a silent cap of zero. They now live in
 * `@leash/sdk` as `CELO_USDC` and `CELO_USDC_FEE_ADAPTER`, which is also where
 * the server reads its defaults from, so the block and the server cannot
 * disagree about them any more. A user who needs a different token still sets
 * the variable by hand; this block is the common case.
 */
export function buildMcpJson(h: McpHandoff): string {
  return JSON.stringify(
    {
      mcpServers: {
        leash: {
          command: 'npx',
          // The published package, not a path on the author's disk. `-y`
          // skips the install prompt, which an agent's runtime cannot answer.
          args: ['-y', 'leash-agentpay'],
          env: {
            LEASH_ACCOUNT: h.account,
            OPERATOR_PK: OPERATOR_PK_PLACEHOLDER,
            ATTRIBUTION_TAG: displayTag(h.attributionTag),
          },
        },
      },
    },
    null,
    2,
  )
}
