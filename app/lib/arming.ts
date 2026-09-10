'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * How long a destructive control stays armed before it tears itself down.
 *
 * Long enough to read the warning that arming reveals — the allowlist one is
 * four lines — and short enough that an armed Stop is never still armed when
 * someone comes back to the tab. Disarming is the safe direction: the spend
 * that does not happen can be retried, the pause that fires by accident
 * cannot be un-fired without another transaction.
 */
export const ARM_TIMEOUT_MS = 8000

/**
 * The two-beat confirm every destructive control in this app uses: the first
 * press arms, the second sends. A modal would break the pace of a live demo
 * and this is a real transaction either way (StopButton).
 *
 * It disarms on Escape and on a timeout, and deliberately **not** on blur.
 *
 * Blur was how both callers disarmed until 2026-09-10, and it made the
 * warning unreadable by exactly the people it was written for. Arming reveals
 * a `role="alert"`; an alert asks to be read; and reading it with a keyboard
 * or a screen reader means moving focus off the button — which silently threw
 * the arming away. The next press then only re-armed, so the control took
 * three presses and explained none of it. On `■ Stop` — the control an owner
 * reaches for when something is going wrong — a click on empty space did the
 * same thing.
 */
export function useArming() {
  const [armed, setArmed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  const disarm = useCallback(() => { clear(); setArmed(false) }, [clear])

  const arm = useCallback(() => {
    clear()
    setArmed(true)
    timer.current = setTimeout(() => { timer.current = null; setArmed(false) }, ARM_TIMEOUT_MS)
  }, [clear])

  // Escape is bound to the document, not to the control. The whole point of
  // this hook is that focus is free to leave the button; a handler bound to
  // the button would be deaf at exactly the moment it is needed.
  useEffect(() => {
    if (!armed) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') disarm() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [armed, disarm])

  // Unmounting while armed must not leave a timer holding a setState.
  useEffect(() => clear, [clear])

  return { armed, arm, disarm }
}
