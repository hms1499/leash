import { describe, it, expect } from 'vitest'
import { buildMcpJson, OPERATOR_PK_PLACEHOLDER } from '../lib/mcpJson.js'

const handoff = {
  account: '0xBE380aa73c036da30D3b2fd5E75B0d1d89E11C3d',
} as const

describe('buildMcpJson', () => {
  it('produces valid JSON', () => {
    expect(() => JSON.parse(buildMcpJson(handoff))).not.toThrow()
  })

  it('fills in every value the app knows', () => {
    const env = JSON.parse(buildMcpJson(handoff)).mcpServers.leash.env
    expect(env.LEASH_ACCOUNT).toBe(handoff.account)
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

  /**
   * The block used to carry `/absolute/path/to/leash/mcp/src/index.ts`, which
   * the reader had to edit by hand. Getting it wrong surfaces in the agent as
   * "server failed to connect" with the real cause buried.
   */
  it('installs the published package rather than a path only the author has', () => {
    const server = JSON.parse(buildMcpJson(handoff)).mcpServers.leash
    expect(server.command).toBe('npx')
    expect(server.args).toEqual(['-y', 'leash-agentpay'])
  })

  /**
   * Matching the two literals that happened to be there would only catch the
   * path we already removed. Every value this block emits is an address, a
   * placeholder or a package name, so none of them can legitimately contain a
   * path separator -- which makes "no separator anywhere" the assertion that
   * catches the next path, whatever shape it arrives in.
   */
  it('emits no local filesystem path at all, in any field', () => {
    const server = JSON.parse(buildMcpJson(handoff)).mcpServers.leash
    const values: string[] = [server.command, ...server.args, ...Object.values(server.env)]
    for (const v of values) expect(v).not.toMatch(/[/\\]/)
  })
})

/**
 * The block asked for five variables and now asks for two. Three of them were
 * values this app could not usefully fill in and the reader could not check:
 * two addresses with one correct value between all users, and an attribution
 * code that represents the app rather than the person running it.
 *
 * The failure each removal prevents is a different shape of silence -- a node
 * rejection the agent reports as a connection problem, a daily cap that reads
 * zero forever, and a server that exits before its first tool call -- so what
 * is asserted here is the count, not any one of them.
 */
describe('the block asks for as little as the server will accept', () => {
  // An exact key set, so a later edit that adds a third variable has to come
  // through this test and say why.
  it('carries exactly the two variables only this user can supply', () => {
    const env = JSON.parse(buildMcpJson(handoff)).mcpServers.leash.env
    expect(Object.keys(env)).toEqual(['LEASH_ACCOUNT', 'OPERATOR_PK'])
  })

  /**
   * The defaults live in `@leash/sdk` and are pinned there
   * (sdk/test/constants.test.ts). What this file guarantees is only that the
   * app stopped emitting its own copies -- two sources for one value is how
   * they come to disagree, which is the bug that put `"ATTRIBUTION_TAG": ""`
   * on the landing page under a note naming a string the block did not carry.
   */
  it('emits none of the three values the server now supplies itself', () => {
    const out = buildMcpJson(handoff)
    expect(out).not.toContain('0xcebA9300f2b948710d2653dD7B07f33A8B32118C')
    expect(out).not.toContain('0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B')
    expect(out).not.toMatch(/celo_[0-9a-f]{12}/)
  })
})
