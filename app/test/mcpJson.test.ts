import { describe, it, expect } from 'vitest'
import {
  buildMcpJson, isAttributionTag, OPERATOR_PK_PLACEHOLDER,
  ATTRIBUTION_TAG_PLACEHOLDER, displayTag,
} from '../lib/mcpJson.js'

const handoff = {
  account: '0x7aDa926B021BAef4896F51F237bCA61435E43fd2',
  token: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
  feeAdapter: '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B',
  attributionTag: 'celo_3dec652cd977',
} as const

/**
 * The landing page shipped `"ATTRIBUTION_TAG": ""` while the note under the
 * block told the reader to replace `celo_yourtag` — a string the block did
 * not contain. Copying it produced an MCP server that threw
 * "ATTRIBUTION_TAG is not set" before its first tool call, which is the
 * funnel failing at its mouth.
 *
 * The substitution used to live in the caller: /setup did it, the landing did
 * not, and the component's own doc claimed the component did. These assert it
 * from the shape of the tag instead, so no caller can reintroduce it.
 */
describe('displayTag', () => {
  it('keeps a tag that the server would accept', () => {
    expect(displayTag('celo_3dec652cd977')).toBe('celo_3dec652cd977')
  })

  it.each(['', '   ', 'celo_mytag', 'celo_3DEC652CD977', 'not-a-tag'])(
    'substitutes the placeholder for %o',
    (bad) => {
      expect(displayTag(bad)).toBe(ATTRIBUTION_TAG_PLACEHOLDER)
    },
  )

  // Whatever it returns has to be the thing the note tells people to look for.
  it('returns a placeholder the reader is actually told to replace', () => {
    expect(ATTRIBUTION_TAG_PLACEHOLDER).toBe('celo_yourtag')
  })

  // And the placeholder must itself be refused, or it would look configured.
  it('the placeholder is not a tag the server would accept', () => {
    expect(isAttributionTag(ATTRIBUTION_TAG_PLACEHOLDER)).toBe(false)
  })
})

describe('the emitted block never carries an unusable tag', () => {
  it.each(['', 'celo_mytag', 'not-a-tag'])('given %o', (bad) => {
    const env = JSON.parse(buildMcpJson({ ...handoff, attributionTag: bad })).mcpServers.leash.env
    expect(env.ATTRIBUTION_TAG).toBe(ATTRIBUTION_TAG_PLACEHOLDER)
  })

  it('passes a real tag through untouched', () => {
    const env = JSON.parse(buildMcpJson(handoff)).mcpServers.leash.env
    expect(env.ATTRIBUTION_TAG).toBe('celo_3dec652cd977')
  })
})

describe('buildMcpJson', () => {
  it('produces valid JSON', () => {
    expect(() => JSON.parse(buildMcpJson(handoff))).not.toThrow()
  })

  it('fills in every value the app knows', () => {
    const env = JSON.parse(buildMcpJson(handoff)).mcpServers.leash.env
    expect(env.LEASH_ACCOUNT).toBe(handoff.account)
    expect(env.SPEND_TOKEN).toBe(handoff.token)
    expect(env.FEE_ADAPTER).toBe(handoff.feeAdapter)
    expect(env.ATTRIBUTION_TAG).toBe(handoff.attributionTag)
  })

  // The single most important assertion in this file. The app must never
  // hold, request, or emit a private key.
  it('leaves the operator key as a placeholder and never a real key', () => {
    const out = buildMcpJson(handoff)
    const env = JSON.parse(out).mcpServers.leash.env
    expect(env.OPERATOR_PK).toBe(OPERATOR_PK_PLACEHOLDER)
    expect(out).not.toMatch(/0x[0-9a-fA-F]{64}/)
  })

  it('names the server "leash" so the documented tool names resolve', () => {
    expect(Object.keys(JSON.parse(buildMcpJson(handoff)).mcpServers)).toEqual(['leash'])
  })
})

describe('isAttributionTag', () => {
  // Must agree with mcp/src/config.ts:36 exactly. A tag this accepts and that
  // rejects produces a .mcp.json that looks finished and an MCP server that
  // exits at startup, surfacing to the user as "server failed to connect".
  it('accepts the shape the MCP server demands', () => {
    expect(isAttributionTag('celo_3dec652cd977')).toBe(true)
  })

  it('rejects a plausible-looking name, which is what people actually type', () => {
    expect(isAttributionTag('celo_mytag')).toBe(false)
  })

  it('rejects uppercase hex, which the server also rejects', () => {
    expect(isAttributionTag('celo_3DEC652CD977')).toBe(false)
  })

  it('rejects the wrong number of hex characters', () => {
    expect(isAttributionTag('celo_3dec652cd97')).toBe(false)
    expect(isAttributionTag('celo_3dec652cd9770')).toBe(false)
  })

  it('rejects a missing prefix and surrounding whitespace', () => {
    expect(isAttributionTag('3dec652cd977')).toBe(false)
    expect(isAttributionTag(' celo_3dec652cd977 ')).toBe(false)
  })

  it('rejects the placeholder the block ships when the field is left blank', () => {
    expect(isAttributionTag('celo_yourtag')).toBe(false)
  })
})
