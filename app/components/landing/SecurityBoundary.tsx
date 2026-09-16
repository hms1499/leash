import Label from '../ui/Label'
import Panel from '../ui/Panel'
import { PROOFS, shortHash } from '../../lib/proofs.js'
import { DATA, PROSE, SUBHEAD } from '../ui/prose'

const PROTECTED = [
  'Every operator draw is bounded by the per-payment and daily caps.',
  'Only the owner can change policy, authorize operators, pause or sweep.',
  'The deployed rules are not a proxy and cannot be upgraded behind you.',
  /**
   * The answer to the top-up line in the column beside this one, which had
   * been standing on its own.
   *
   * `topUpEnabled` is a bare bool: false at construction, and only
   * `setTopUpEnabled` (onlyOwner) can raise it -- `topUpOperator` reverts
   * `TopUpDisabled` until it does. So the page was showing the risk of a path
   * that is shut by default while never showing that it is shut, or that the
   * owner holds the switch. A defence the reader cannot see does not reassure
   * anybody.
   */
  'The top-up path is closed at deployment; only the owner can open it.',
] as const

const NOT_PROTECTED = [
  'USDC already in the agent wallet is outside the contract.',
  'The payee allowlist cannot constrain top-ups used for x402.',
  /**
   * Still true in v2, and now says why rather than leaving a reader to infer
   * that ownership is frozen. `transferOwnership` is onlyOwner and
   * `acceptOwnership` checks `pendingOwner`, so the account can be handed on
   * -- but only by someone still holding the key. Losing it forecloses both.
   */
  'A lost owner key cannot be replaced — ownership only moves while you still hold it — and the contract has not been audited.',
] as const

/**
 * All five, not a slice of three.
 *
 * This read `[PROOFS[0], PROOFS[2], PROOFS[4]]` -- one row per unique
 * transaction -- which dropped two claims to avoid showing a link twice. The
 * two it dropped are the ones this project is least able to spare:
 *
 *   PROOFS[1]  the ERC-8021 attribution tag round-tripping off raw chain data
 *   PROOFS[3]  the facilitator settling while the agent held zero CELO and
 *              paid its own gas in USDC
 *
 * The second is the Celo fee-abstraction result -- the part of this that is
 * hard to reproduce elsewhere -- and it was the one thing on the page nobody
 * could read.
 *
 * test/proofs.test.ts already wrote the rule this now follows: "collapsing
 * them into one row would hide a claim. Four transactions carry five proofs."
 * The slice was what disagreed with it.
 *
 * Two rows therefore carry the same hash, and that is the point rather than a
 * defect -- which is why the hash is now drawn instead of a generic "View
 * transaction". A reader sees one spend proving two things.
 */
const EVIDENCE = PROOFS

/**
 * Counted, never typed.
 *
 * The sentence above this panel was written by hand as "Five claims over four
 * transactions" and was wrong within the hour: refreshing lib/proofs.ts to the
 * v2 set made it six over five, and the prose carried on saying four. No test
 * caught it, because a hardcoded string agrees with itself.
 *
 * This repo has paid for that mistake in three other places -- a suite count,
 * a plan count, a countdown -- and the rule each time was the same: a figure
 * written beside a thing that moves is wrong at the next edit. So the figure
 * is derived from the list it describes.
 */
const CLAIM_COUNT = EVIDENCE.length
const TX_COUNT = new Set(EVIDENCE.map((p) => p.url)).size

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
/** Spelled out, because this is prose. Falls back to the digit past ten, where
 *  a word stops being easier to read than a number. */
function spell(n: number): string {
  return WORDS[n] ?? String(n)
}

function BoundaryList({
  title, items, tone,
}: {
  title: string
  items: readonly string[]
  tone: 'ok' | 'bad'
}) {
  return (
    <div className="p-6">
      <Label style={{ color: `var(--${tone})` }}>{title}</Label>
      <ul className="mt-4 flex flex-col gap-3">
        {items.map((item) => (
          <li key={item} className="grid grid-cols-[auto_1fr] gap-3">
            <span className="num" style={{ fontSize: 'var(--t-data)', lineHeight: 'var(--t-data-line)', color: `var(--${tone})` }} aria-hidden="true">
              {tone === 'ok' ? '✓' : '!'}
            </span>
            <span style={{ ...PROSE, color: 'var(--dim)' }}>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function SecurityBoundary() {
  return (
    <div className="flex flex-col gap-4">
      {/* Two halves of one statement, so both take six columns and neither
          gets to be the wider one. */}
      <Panel className="grid grid-cols-12 overflow-hidden">
        <div className="col-span-12 md:col-span-6">
          <BoundaryList title="Protected by Leash" items={PROTECTED} tone="ok" />
        </div>
        <div className="col-span-12 border-t md:col-span-6 md:border-l md:border-t-0 [border-color:var(--line)]">
          <BoundaryList title="Outside the boundary" items={NOT_PROTECTED} tone="bad" />
        </div>
      </Panel>

      <Panel>
        <div className="p-6" style={{ borderBottom: '1px solid var(--line)' }}>
          <Label>On-chain evidence</Label>
          <p className="mt-2" style={{ ...PROSE, color: 'var(--dim)' }}>
            {/* Capitalised here rather than in `spell`, which is also used
                mid-sentence below. */}
            {`${spell(CLAIM_COUNT).replace(/^./, (c) => c.toUpperCase())} claims over ${spell(TX_COUNT)} transactions, each one open to inspect.`}
            {/* Only said when it is true. A set with one claim per transaction
                would otherwise explain a repetition the reader cannot see. */}
            {TX_COUNT < CLAIM_COUNT && ' Some name the same hash, because one spend can prove more than one thing.'}
          </p>
        </div>
        {EVIDENCE.map((proof, index) => (
          <a
            // The URL is no longer unique -- PROOFS[0] and PROOFS[1] share a
            // transaction -- so the claim is what identifies a row.
            key={proof.claim}
            href={proof.url}
            target="_blank"
            rel="noreferrer"
            className="grid gap-2 p-6 focus-ring-inset sm:grid-cols-[1fr_auto] sm:items-start"
            style={{
              borderTop: index === 0 ? 'none' : '1px solid var(--line)',
              color: 'var(--text)',
              outlineColor: 'var(--text)',
            }}
          >
            <span>
              <span className="block" style={SUBHEAD}>{proof.claim}</span>
              {/* The `detail` field, which no caller had ever rendered. Five
                  rows shipped as bare assertions with a link, when the reason
                  each transaction proves anything was sitting in
                  lib/proofs.ts the whole time -- "remainingToday fell by
                  exactly the amount spent, so the cap governed the transfer
                  rather than merely coexisting with it" is the argument, and
                  the claim above it is only the conclusion. */}
              <span className="block mt-2" style={{ ...PROSE, color: 'var(--dim)' }}>{proof.detail}</span>
            </span>
            {/* The hash itself, not a generic "View transaction". Two rows
                point at one spend, and a reader can only see that is deliberate
                if the two rows visibly name the same transaction. */}
            <span className="num shrink-0" style={{ ...DATA, color: 'var(--dim)' }}>
              {shortHash(proof.url)} ↗
            </span>
          </a>
        ))}
      </Panel>
    </div>
  )
}
