'use client'

import type { SetupStage } from '../../lib/setup.js'
import { STEPS } from './chrome.js'

/**
 * The four-step progress nav, and the only way back to a step already passed.
 *
 * It takes predicates rather than four booleans: `stageDone` and
 * `stageUnlocked` are the wizard's own reading of state it holds -- a resumed
 * account still being verified against Celo is locked out of every step but
 * the first -- and restating either rule here is how a stepper comes to
 * disagree with the panel below it about which step a reader may be on.
 */
export default function StageStepper({
  activeStage, onSelect, stageDone, stageUnlocked,
}: {
  activeStage: SetupStage
  onSelect: (stage: SetupStage) => void
  stageDone: (stage: SetupStage) => boolean
  stageUnlocked: (stage: SetupStage) => boolean
}) {
  return (
  <nav aria-label="Setup progress" className="mt-8">
    <ol className="grid grid-cols-12 gap-2">
      {STEPS.map((step) => {
        const done = stageDone(step.id)
        const unlocked = stageUnlocked(step.id)
        const current = activeStage === step.id
        return (
          <li key={step.id} className="col-span-6 md:col-span-3">
            <button
              type="button" disabled={!unlocked} aria-current={current ? 'step' : undefined}
              onClick={() => onSelect(step.id)}
              className="motion-press w-full p-3 text-left focus-ring disabled:cursor-not-allowed disabled:opacity-45"
              style={{ minHeight: 72, borderRadius: 'var(--r-box)',
                background: current ? 'var(--panel)' : 'transparent',
                border: `1px solid ${current ? 'var(--line-control)' : 'var(--line)'}`, outlineColor: 'var(--text)' }}
            >
              <span className="num" style={{ fontSize: 'var(--t-data)', lineHeight: 'var(--t-data-line)', color: done ? 'var(--ok)' : 'var(--dim)' }}>
                {done ? '✓' : `0${step.id}`}
              </span>
              <span className="block text-sm mt-1" style={{ color: current ? 'var(--text)' : 'var(--dim)' }}>
                <span className="sm:hidden">{step.short}</span>
                <span className="hidden sm:inline">{step.title}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  </nav>
  )
}
