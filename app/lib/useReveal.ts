import { useEffect, useRef } from 'react'

/**
 * The reveal for a disclosure that does not unmount.
 *
 * `LimitsDrawer` and `OwnershipDrawer` open by rendering a `<Panel>` only when
 * `open` — the element mounts, and `.motion-reveal` being a CSS animation, it
 * plays once and needs nothing else. A `<details>` is not that shape: the
 * browser keeps its content in the DOM and hides it, so nothing ever mounts and
 * the class alone would never fire. `McpHandoff` and the wizard's "What you
 * need before creating" are both that shape, and both opened with no motion at
 * all while their two siblings had it — the divergence CLAUDE.md names.
 *
 * Toggling the class is what makes an animation restart, so applying it as
 * `open` flips is enough. The half that needs care is the first render:
 * design-system.md §12 says a transition does not run on it, and `McpHandoff`
 * is mounted already-open on `/setup`, where `defaultOpen` is set. Without the
 * mounted flag that panel would announce itself on arrival, which is an
 * entrance — the thing §12 refuses.
 *
 * Same division as `arrivedKeys` in lib/feed.ts: the decision is a pure
 * function the node suite can test, and the ref that feeds it stays in React.
 */
export function revealOnOpen(open: boolean, mounted: boolean): string {
  return open && mounted ? 'motion-reveal' : ''
}

/**
 * `revealOnOpen` with the mounted flag kept for the caller.
 *
 * A hook rather than a second copy of the ref in each component: `Feed` and
 * `LiveProof` each keep their own `primed` and needed a test to stop them
 * drifting apart. Two callers is where that starts, so this is the point to
 * share it rather than the point to write the guard.
 */
export function useRevealOnOpen(open: boolean): string {
  const mounted = useRef(false)
  useEffect(() => { mounted.current = true }, [])
  return revealOnOpen(open, mounted.current)
}
