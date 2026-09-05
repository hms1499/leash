import Panel from '../ui/Panel'
import { PROSE } from '../ui/prose'

/**
 * The questions a reader actually has before trusting a contract with money,
 * answered where they are asked rather than in a spec nobody opens.
 *
 * Every answer here was checked against `contracts/src/SpendPolicyAccount.sol`
 * on 2026-09-05, not written from memory. Two of them are admissions: the
 * allowlist does not cover `topUpOperator`, and nothing has been audited. A
 * page that only lists reassurances is not answering the question, and this
 * product's whole argument is that a limit you can verify beats a promise.
 *
 * No numbered markers: this is a set, not a sequence. It reuses ProofTable's
 * divided-panel shape rather than a grid of cards, because these are rows of
 * one list and not five separate things.
 */
const QUESTIONS: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: 'If the agent’s key leaks, how much can it take?',
    a: 'The rest of that day’s allowance, and nothing behind it — both spending paths run through the same daily counter. But the payee allowlist guards only one of them: topUpOperator moves funds to the agent’s own wallet and never checks it. Treat the allowlist as protection against a wrong address, not against a stolen key.',
  },
  {
    q: 'Can you take my money?',
    a: 'No. The contract holds no address of ours, and it charges no fee. You are the owner from the moment you deploy it, and the owner is immutable — it cannot be changed afterwards, by us or by anyone.',
  },
  {
    q: 'Can I take my own money out?',
    a: 'At any time. sweep deliberately ignores the caps, the allowlist and the pause, because the policy exists to constrain the agent and never you. Without that escape hatch, funds sent under a token you had not configured would be stranded, and pausing a compromised agent would lock you out of the money you were trying to protect.',
  },
  {
    q: 'It is not upgradeable. What if there is a bug?',
    a: 'There is no patch, and that is the trade. In exchange nobody — including us — can change the rules after you deploy. If something is wrong you can still stop the agent and sweep the funds out; both are owner-only and neither depends on the policy being correct.',
  },
  {
    q: 'Has it been audited?',
    a: 'No. It is a 3406-byte contract with 32 tests behind it, and every claim above links to a transaction you can check yourself. Do not put in more than you are willing to lose.',
  },
  {
    q: 'Can I set the daily cap to zero to freeze it?',
    a: 'No. The contract reads a daily cap of zero as “this token was never configured”, so a deliberate freeze and a setup mistake fail with the same error and you cannot tell them apart. Use Stop instead: one transaction, reversible, and it says what it did.',
  },
]

export default function Questions() {
  return (
    <Panel>
      {QUESTIONS.map(({ q, a }, i) => (
        <div
          key={q}
          className="p-6 flex flex-col gap-2"
          style={{ borderTop: i === 0 ? 'none' : '1px solid var(--line)' }}
        >
          {/* Mono for the question, sans for the answer: §1 puts what a reader
              looks at in mono and what they read in sans. */}
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 'var(--t-data)',
            lineHeight: 'var(--t-data-line)', fontWeight: 600, color: 'var(--text)',
          }}>
            {q}
          </span>
          <p style={{ ...PROSE, maxWidth: '68ch', color: 'var(--dim)' }}>{a}</p>
        </div>
      ))}
    </Panel>
  )
}
