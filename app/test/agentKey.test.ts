import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { getAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { generateAgentWallet, keyToShow } from '../lib/agentKey.js'
import { buildMcpJson, OPERATOR_PK_PLACEHOLDER, FEE_ADAPTER } from '../lib/mcpJson.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * The wizard used to tell a user to run `cast wallet new`, twice, and
 * docs/quickstart.md never installed Foundry -- so somebody following the
 * instructions hit `command not found: cast` with no way forward, after five
 * mainnet transactions. This function is what replaces that sentence.
 */
describe('generateAgentWallet', () => {
  it('returns an address that is the one the key controls', () => {
    const wallet = generateAgentWallet()
    expect(privateKeyToAccount(wallet.privateKey).address).toBe(wallet.address)
  })

  it('returns a fresh key every call', () => {
    const keys = new Set(Array.from({ length: 8 }, () => generateAgentWallet().privateKey))
    expect(keys.size).toBe(8)
  })

  it('returns a 32-byte key', () => {
    expect(generateAgentWallet().privateKey).toMatch(/^0x[0-9a-f]{64}$/)
  })

  /**
   * Checksummed, because it is pasted into `addOperator` and shown beside the
   * addresses the rest of the wizard renders through <Address>.
   */
  it('returns a checksummed address', () => {
    const { address } = generateAgentWallet()
    expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(address).toBe(getAddress(address))
  })
})

/**
 * The invariant the generator is allowed to bend and not allowed to break.
 *
 * mcpJson.ts used to say the operator key was "the one value this app must
 * never learn". The wizard now generates it, so the app does learn it -- in
 * memory, for as long as the tab is open. What must stay true is narrower and
 * these assert it: the key never reaches the copied block, and it never
 * reaches storage that outlives the tab.
 */
describe('the generated key stays out of the artifacts', () => {
  it('never reaches the .mcp.json block', () => {
    const wallet = generateAgentWallet()
    const block = buildMcpJson({
      account: '0xBE380aa73c036da30D3b2fd5E75B0d1d89E11C3d',
      token: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
      feeAdapter: FEE_ADAPTER,
      attributionTag: 'celo_3dec652cd977',
    })
    expect(block).not.toContain(wallet.privateKey)
    expect(JSON.parse(block).mcpServers.leash.env.OPERATOR_PK).toBe(OPERATOR_PK_PLACEHOLDER)
  })

  /**
   * A source ratchet, in the manner of surface.test.ts and writePhase.test.ts:
   * the wizard persists its agent ADDRESS to localStorage and must never
   * persist the key beside it. "Shown once" is a claim the UI makes in so many
   * words, and a later edit that saved the key would make it a lie silently.
   */
  it('is never written to browser storage by the wizard', () => {
    const source = readFileSync(join(ROOT, 'app/setup/page.tsx'), 'utf8')
    const storageWrites = source.match(/(?:localStorage|sessionStorage)[^\n]*/g) ?? []
    for (const line of storageWrites) {
      expect(line).not.toMatch(/generatedKey|privateKey/)
    }
  })

  it('is never handed to McpHandoff, which the dashboard also renders', () => {
    const source = readFileSync(join(ROOT, 'components/McpHandoff.tsx'), 'utf8')
    expect(source).not.toMatch(/privateKey|generatedKey/)
  })
})

/**
 * The key is scoped to the wallet that generated it and the agent it controls.
 * React does not remount on a disconnect or an account switch, so a key held
 * in state used to be shown to whoever connected next -- beside their agent,
 * where it would be pasted into OPERATOR_PK and silently be the wrong key.
 */
describe('keyToShow', () => {
  const OWNER_A = '0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57'
  const OWNER_B = '0x64Ad61211C1b0B7f20B3e04B49661f30f152ae78'

  it('shows the key to the wallet that generated it, for the agent it controls', () => {
    const wallet = generateAgentWallet()
    expect(keyToShow({ privateKey: wallet.privateKey, wallet: OWNER_A }, OWNER_A, wallet.address))
      .toBe(wallet.privateKey)
  })

  it('hides it from another wallet', () => {
    const wallet = generateAgentWallet()
    expect(keyToShow({ privateKey: wallet.privateKey, wallet: OWNER_A }, OWNER_B, wallet.address))
      .toBeNull()
  })

  it('hides it once the wallet disconnects', () => {
    const wallet = generateAgentWallet()
    expect(keyToShow({ privateKey: wallet.privateKey, wallet: OWNER_A }, undefined, wallet.address))
      .toBeNull()
  })

  it('hides it beside an agent the key does not control', () => {
    const wallet = generateAgentWallet()
    const other = generateAgentWallet()
    expect(keyToShow({ privateKey: wallet.privateKey, wallet: OWNER_A }, OWNER_A, other.address))
      .toBeNull()
    expect(keyToShow({ privateKey: wallet.privateKey, wallet: OWNER_A }, OWNER_A, '')).toBeNull()
  })

  it('ignores checksum casing on both comparisons', () => {
    const wallet = generateAgentWallet()
    expect(keyToShow(
      { privateKey: wallet.privateKey, wallet: OWNER_A.toLowerCase() },
      OWNER_A,
      wallet.address.toLowerCase(),
    )).toBe(wallet.privateKey)
  })

  it('has nothing to show when nothing was generated', () => {
    expect(keyToShow(null, OWNER_A, OWNER_B)).toBeNull()
  })

  it('is what the wizard renders, and the wizard drops the key on disconnect', () => {
    const source = readFileSync(join(ROOT, 'app/setup/page.tsx'), 'utf8')
    expect(source).not.toMatch(/privateKey=\{generatedKey\}/)
    expect(source).toMatch(/keyToShow\(generatedKey, connected, agent\)/)
    // Located from its dependency list backwards, so Task 2 adding a line at
    // the top of this effect does not break the ratchet.
    const end = source.indexOf('}, [connected])')
    const connectedEffect = source.slice(source.lastIndexOf('useEffect(', end), end)
    expect(connectedEffect).toContain('setGeneratedKey(null)')
  })
})
