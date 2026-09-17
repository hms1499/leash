import { describe, expect, it } from 'vitest'
import {
  afterFailedRead, afterDeployNote, balanceValue, describeBalance, describeTopUpMode, firstSetupStage,
  NOT_OWNER_NOTE, restoredOwnerNote, setupReadiness,
} from '../lib/setup.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

describe('setupReadiness', () => {
  const complete = {
    account: '0x0000000000000000000000000000000000000001',
    limitsConfirmed: true,
    agentAuthorized: true,
    protectedBalance: 5_000_000n,
    agentTransactionsLeft: 3,
  }

  it('is ready only when the agent can actually transact', () => {
    expect(setupReadiness(complete).ready).toBe(true)
  })

  it('does not mistake a funded policy account for a ready agent', () => {
    const readiness = setupReadiness({ ...complete, agentTransactionsLeft: 0 })
    expect(readiness.ready).toBe(false)
    expect(readiness.agentGasReady).toBe(false)
    expect(firstSetupStage(readiness)).toBe(3)
  })

  it('does not require MCP or an attribution tag', () => {
    expect(Object.keys(setupReadiness(complete))).toEqual([
      'accountCreated',
      'limitsConfirmed',
      'agentAuthorized',
      'protectedFundsDetected',
      'agentGasReady',
      'ready',
    ])
  })

  it('returns the first incomplete stage when setup is resumed', () => {
    expect(firstSetupStage(setupReadiness({
      ...complete,
      limitsConfirmed: false,
      agentAuthorized: false,
      protectedBalance: 0n,
      agentTransactionsLeft: 0,
    }))).toBe(2)
  })
})

describe('balance reads', () => {
  it('yields a value only from a completed read', () => {
    expect(balanceValue({ status: 'ok', value: 5_000_000n })).toBe(5_000_000n)
    expect(balanceValue({ status: 'reading' })).toBeNull()
    expect(balanceValue({ status: 'failed' })).toBeNull()
  })

  it('keeps a failed read out of readiness, exactly as an unread one is', () => {
    const base = {
      account: '0x0000000000000000000000000000000000000001',
      limitsConfirmed: true,
      agentAuthorized: true,
      agentTransactionsLeft: 3,
    }
    expect(setupReadiness({ ...base, protectedBalance: balanceValue({ status: 'failed' }) }).ready)
      .toBe(false)
    expect(setupReadiness({ ...base, protectedBalance: balanceValue({ status: 'reading' }) }).ready)
      .toBe(false)
    expect(setupReadiness({ ...base, protectedBalance: balanceValue({ status: 'ok', value: 1n }) }).ready)
      .toBe(true)
  })

  /**
   * The defect this replaced: `null` meant both "not read yet" and "the read
   * threw", so a failed balance read rendered "Checking…" for ever, with
   * "Review setup" disabled and nothing on screen saying why.
   */
  it('says a read failed rather than pretending it is still running', () => {
    expect(describeBalance({ status: 'reading' }, 6)).toEqual({ text: 'Checking…', failed: false })
    expect(describeBalance({ status: 'failed' }, 6)).toEqual({ text: 'Could not read', failed: true })
  })

  it('formats a balance without the trailing zeroes formatAmount would pad', () => {
    expect(describeBalance({ status: 'ok', value: 5_000_000n }, 6).text).toBe('5.00 USDC')
    expect(describeBalance({ status: 'ok', value: 190_000n }, 6).text).toBe('0.19 USDC')
    // Small figures survive: the agent gas float is the whole reason this
    // column exists, and 0.05 must not round to nothing.
    expect(describeBalance({ status: 'ok', value: 46_000n }, 6).text).toBe('0.046 USDC')
  })

  /**
   * `useAccountState` keeps the last observed snapshot visible across a failed
   * refresh rather than blanking it, and this column must not disagree: a
   * transient forno failure should not erase a figure the chain already gave.
   */
  it('does not erase an observed balance when a later read fails', () => {
    expect(afterFailedRead({ status: 'ok', value: 5_000_000n })).toEqual({ status: 'ok', value: 5_000_000n })
    expect(afterFailedRead({ status: 'reading' })).toEqual({ status: 'failed' })
    expect(afterFailedRead({ status: 'failed' })).toEqual({ status: 'failed' })
  })
})

describe('describeTopUpMode', () => {
  // The review screen is the last place an owner sees what they chose before
  // they hand the account to an agent. "Off" has to say what is off, not just
  // that something is — the switch closes the one path that moves money into
  // a wallet the policy cannot reach afterwards.
  it('summarises the top-up switch for the review screen', () => {
    expect(describeTopUpMode(true)).toBe('On — the agent may draw funds into its own wallet')
    expect(describeTopUpMode(false)).toBe('Off — the agent cannot draw funds into its own wallet')
  })
})

const OWNER_A = '0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57'
const OWNER_B = '0x64Ad61211C1b0B7f20B3e04B49661f30f152ae78'
const ACCOUNT = '0xBE380aa73c036da30D3b2fd5E75B0d1d89E11C3d'

/**
 * localStorage names candidates; owner() decides. Every write the wizard sends
 * carries an explicit gas, so a wallet has no estimate to fail on -- a
 * non-owner's setPolicy is broadcast, reverts, and is paid for.
 */
describe('restoredOwnerNote', () => {
  it('resumes an account the connected wallet owns, whatever the casing', () => {
    expect(restoredOwnerNote(OWNER_A.toLowerCase(), OWNER_A)).toBeNull()
  })

  it('refuses one it does not', () => {
    expect(restoredOwnerNote(OWNER_B, OWNER_A)).toBe(NOT_OWNER_NOTE)
  })
})

describe('afterDeployNote', () => {
  it('says nothing when the deploying wallet is still connected', () => {
    expect(afterDeployNote(ACCOUNT, OWNER_A, OWNER_A.toLowerCase())).toBeNull()
  })

  it('names the account and its owner when another wallet is connected now', () => {
    expect(afterDeployNote(ACCOUNT, OWNER_A, OWNER_B)).toBe(
      `Created ${ACCOUNT} for ${OWNER_A}. Connect that wallet again to continue setting it up.`,
    )
  })

  it('says the same when no wallet is connected now', () => {
    expect(afterDeployNote(ACCOUNT, OWNER_A, undefined)).toContain(`for ${OWNER_A}`)
  })
})

describe('the wizard checks ownership', () => {
  const ROOT = fileURLToPath(new URL('..', import.meta.url))
  const source = readFileSync(join(ROOT, 'app/setup/page.tsx'), 'utf8')

  it('reads owner() inside the restore batch and re-checks on a wallet switch', () => {
    const restore = source.slice(source.indexOf('// Local storage supplies candidates'), source.indexOf('async function deploy()'))
    const batch = restore.slice(restore.indexOf('await Promise.all(['), restore.indexOf('])'))
    expect(batch).toContain("functionName: 'owner'")
    expect(restore).toContain('restoredOwnerNote(')
    expect(restore).toContain('}, [account, connected])')
  })

  it('does not attach a new account to a wallet that did not deploy it', () => {
    const deploy = source.slice(source.indexOf('async function deploy()'), source.indexOf('async function setLimits()'))
    expect(deploy.indexOf('afterDeployNote(')).toBeGreaterThan(-1)
    expect(deploy.indexOf('afterDeployNote(')).toBeLessThan(deploy.indexOf('setAccount(outcome.address)'))
    expect(deploy).not.toContain('connected!')
  })

  /**
   * A disconnect, or a switch to a wallet with no saved account, starts a
   * restore run for the OLD account in the same commit the connected effect
   * schedules setAccount(null); the next commit cancels that run. Without an
   * early guard and a cleanup that also resets `restoring`, the cancelled
   * run's `finally` skips setRestoring(false) and "Create protected account"
   * (disabled={deploying || restoring}) stays disabled with nothing said.
   */
  it('does not leave "restoring" stuck true when a later commit cancels this run', () => {
    const restore = source.slice(source.indexOf('// Local storage supplies candidates'), source.indexOf('async function deploy()'))
    expect(restore).toContain('if (!account || !connected) return')
    const cleanup = restore.slice(restore.indexOf('return () => {'))
    expect(cleanup).toContain('cancelled = true')
    expect(cleanup).toContain('setRestoring(false)')
  })
})
