import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  writeLabel, isBusy, CONFIRMING_LABEL, ownerControlView, outcomeForOtherWallet,
  type WritePhase,
} from '../lib/writePhase.js'

const stop = { idle: '■ Stop', sending: 'Stopping…' }
const nominate = { idle: 'Nominate new owner', sending: 'Nominating…' }

describe('writeLabel', () => {
  it('says what the control does when nothing is in flight', () => {
    expect(writeLabel('idle', stop)).toBe('■ Stop')
  })

  it('names the operation while the wallet has it', () => {
    expect(writeLabel('sending', stop)).toBe('Stopping…')
  })

  /**
   * The defect this exists for. `busy` used to cover both waits, so a button
   * read "Stopping…" from the moment it was pressed until pollUntil gave up --
   * 20 attempts at 3s is up to a minute of a label that had already stopped
   * being true, with nothing to tell an owner their wallet was done and the
   * chain was the one being waited on. That silence is what makes somebody
   * press again or reload mid-write.
   */
  it('says the chain is the one being waited on once the wallet is done', () => {
    expect(writeLabel('confirming', stop)).toBe(CONFIRMING_LABEL)
  })

  /**
   * CLAUDE.md: two implementations of one operation must not behave
   * differently. The confirming wait is the same wait everywhere -- pollUntil
   * on a condition -- so it gets the same words everywhere, and a caller
   * cannot supply its own.
   */
  it('is the same sentence for every control, whatever that control does', () => {
    expect(writeLabel('confirming', nominate)).toBe(writeLabel('confirming', stop))
  })
})

describe('isBusy', () => {
  it('is false only when nothing is in flight', () => {
    expect(isBusy('idle')).toBe(false)
  })

  /**
   * Both in-flight phases disable the control. The phase split is about what
   * the button SAYS, never about when it can be pressed again -- a second
   * press during either wait sends a second transaction.
   */
  it('disables the control through both waits, not just the first', () => {
    for (const phase of ['sending', 'confirming'] as WritePhase[]) {
      expect(isBusy(phase)).toBe(true)
    }
  })
})

/**
 * The two defects this file exists for, pinned against the source.
 *
 * Asserted this way for the same reason test/chain.test.ts asserts
 * useAccountState against its source: these components need a React
 * environment this suite does not run (spec §2.2 forbids adding one), and both
 * regressions are silent. Dropping a `setPhase('confirming')` costs no test and
 * no type error -- the button simply goes back to claiming the wallet still has
 * a transaction the wallet finished with a minute ago. Dropping a `role` is
 * quieter still: the screen looks identical and only a screen reader loses.
 */
describe('every control that waits on the chain says so', () => {
  const read = (p: string) =>
    readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), 'utf8')

  /** Every file that polls the chain after a write. */
  const POLLERS = [
    'components/StopButton.tsx',
    'components/AgentPanel.tsx',
    'components/AgentAccessPanel.tsx',
    'components/OwnershipDrawer.tsx',
    'components/TopUpDrawer.tsx',
    'components/LimitsDrawer.tsx',
    'app/setup/page.tsx',
  ]

  it.each(POLLERS)('%s moves out of the wallet phase before it polls', (file) => {
    const src = read(file)
    expect(src).toContain("'confirming'")
  })

  /**
   * One `confirming` per `pollUntil` that follows a write. setup/page.tsx's
   * protectRecipient takes two wallet confirmations and so sets the phase
   * three times across two polls, which is why this is >= rather than ===.
   */
  it.each(POLLERS)('%s has a phase change for every wait, not just the first', (file) => {
    const src = read(file)
    const polls = (src.match(/pollUntil\(/g) ?? []).length
    const confirmings = (src.match(/setPhase\('confirming'\)|Phase\('confirming'\)/g) ?? []).length
    expect(confirmings).toBeGreaterThanOrEqual(polls === 0 ? 0 : 1)
    expect(confirmings).toBeLessThanOrEqual(polls + 1)
  })

  /**
   * StopButton and AgentPanel were the two outliers: the only account an owner
   * gets of a refused or unconfirmed write, in a plain element a screen reader
   * never announces. Every sibling already had the live region.
   *
   * Comments are stripped first. The first version of this assertion just
   * looked for role="status" anywhere in the file and passed against the
   * UNFIXED component, because the comment explaining the fix contained the
   * string it was searching for. An assertion that cannot fail proves nothing.
   */
  it.each([
    'components/StopButton.tsx',
    'components/AgentPanel.tsx',
    'components/AgentAccessPanel.tsx',
    'components/OwnershipDrawer.tsx',
    'components/TopUpDrawer.tsx',
    'components/LimitsDrawer.tsx',
  ])('%s announces every outcome note it renders', (file) => {
    const src = read(file).replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    // Every `{note && …}` / `{recipientNote && …}` render in the file.
    const renders = [...src.matchAll(/\{(\w*[Nn]ote) && /g)]
    expect(renders.length).toBeGreaterThan(0)
    for (const m of renders) {
      // The element that note renders into, up to the end of its opening tag.
      const after = src.slice(m.index!, m.index! + 400)
      expect(after, `${file}: ${m[1]} renders without a live region`)
        .toMatch(/role=\"(status|alert)\"/)
    }
  })
})

/**
 * LimitsDrawer and StopButton were mounted only while isOwner held. A
 * disconnect or an account switch during pollUntil unmounted them, and the
 * one message that said whether a real transaction landed went with them.
 */
describe('ownerControlView', () => {
  it('gives the owner the controls', () => {
    expect(ownerControlView(true, ['idle'], null)).toBe('controls')
    expect(ownerControlView(true, ['confirming'], 'x')).toBe('controls')
  })

  it('keeps a write in flight on screen after the owner has gone', () => {
    expect(ownerControlView(false, ['idle', 'confirming'], null)).toBe('pending')
    expect(ownerControlView(false, ['sending'], 'old note')).toBe('pending')
  })

  it('keeps its outcome on screen', () => {
    expect(ownerControlView(false, ['idle'], 'Sent, but the chain has not confirmed it yet.')).toBe('outcome')
  })

  it('shows nothing to a non-owner otherwise', () => {
    expect(ownerControlView(false, ['idle', 'idle'], null)).toBe('hidden')
  })
})

describe('outcomeForOtherWallet', () => {
  // The walletNote.ts rule: a message about one wallet says which.
  it('names the wallet the outcome is about', () => {
    expect(outcomeForOtherWallet('The transaction was not sent.', '0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57'))
      .toBe('0x2B33…4f57: The transaction was not sent.')
  })

  it('falls back to the bare note when the sender is unknown', () => {
    expect(outcomeForOtherWallet('x', null)).toBe('x')
  })
})

describe('owner controls are not unmounted by the page', () => {
  const ROOT = fileURLToPath(new URL('..', import.meta.url))
  const page = readFileSync(join(ROOT, 'app/a/[address]/page.tsx'), 'utf8')

  it('renders StopButton and LimitsDrawer without an isOwner guard', () => {
    expect(page).not.toMatch(/isOwner && \(\s*<StopButton/)
    expect(page).not.toMatch(/isOwner && \(\s*<LimitsDrawer/)
  })

  for (const file of ['components/StopButton.tsx', 'components/LimitsDrawer.tsx']) {
    it(`${file} decides with ownerControlView, after its last hook`, () => {
      const source = readFileSync(join(ROOT, file), 'utf8')
      const at = source.indexOf('ownerControlView(')
      expect(at).toBeGreaterThan(-1)
      expect(at).toBeGreaterThan(source.lastIndexOf('useEffect('))
      expect(at).toBeGreaterThan(source.lastIndexOf('useWriteContract('))
    })
  }
})
