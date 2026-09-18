export type McpHandoff = {
  account: `0x${string}`
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
 * Mirrors the block documented in docs/mcp-setup.md.
 *
 * ## Two variables, from five
 *
 * `SPEND_TOKEN` and `FEE_ADAPTER` went in leash-agentpay 0.4.0 and
 * `ATTRIBUTION_TAG` in 0.5.0. All three are still accepted; none of them is a
 * value this block can usefully fill in, and each one cost a reader something
 * different:
 *
 * - The two addresses had exactly one correct value between all users, which
 *   the reader had no way to check. A wrong fee adapter is rejected at the
 *   node on the first send; a wrong token is not rejected at all, it reports a
 *   daily cap of zero forever. They are `CELO_USDC` and
 *   `CELO_USDC_FEE_ADAPTER` in `@leash/sdk` now, where the server reads its
 *   defaults from, so the block and the server cannot disagree.
 *
 * - `ATTRIBUTION_TAG` was worse, because the value was not the app's to know
 *   and the user did not have one either. `@celo/attribution-tags` says a code
 *   is added by the entity it represents and an app emits its own, so the code
 *   belonged to `leash-agentpay` all along -- and the advice this file used to
 *   print in its place, twelve random hex characters, made a code representing
 *   nobody. The server emits `LEASH_ATTRIBUTION_CODE` itself. A builder with a
 *   registered code of their own sets the variable by hand and gets both codes
 *   in one suffix; `docs/mcp-setup.md` is where that is written down.
 *
 * ## What the deletions took with them
 *
 * `displayTag`, `isAttributionTag` and `ATTRIBUTION_TAG_PLACEHOLDER` lived
 * here and are gone. They existed for one bug: the landing page shipped
 * `"ATTRIBUTION_TAG": ""` under a note telling the reader to replace
 * `celo_yourtag`, a string that block did not contain, and copying it produced
 * a server that threw before its first tool call. Deriving the substitution
 * from the tag's shape fixed it (a46fa52). The block carries no tag now, so
 * neither the bug nor its guard has anything left to describe. The rule they
 * enforced survives as `ATTRIBUTION_CODE_SHAPE` in `@leash/sdk`, checked at
 * startup by the one component that still reads the variable.
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
          },
        },
      },
    },
    null,
    2,
  )
}
