import { describe, it, expect } from 'vitest'
import { buildMcpJson, OPERATOR_PK_PLACEHOLDER } from '../lib/mcpJson.js'

const handoff = {
  account: '0x895B773Ef88cA27699Df58F9F45962F847bbE9CE',
  token: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
  feeAdapter: '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B',
  attributionTag: 'celo_3dec652cd977',
} as const

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
