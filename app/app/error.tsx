'use client'

import Shell from '../components/ui/Shell'
import Button from '../components/ui/Button'

/**
 * A render error in the browser knows NOTHING about the chain.
 *
 * So this says a page failed and offers a reload. It must never say a
 * transaction failed, or that money did or did not move: this project's rule
 * is that nothing is reported which was not observed, and from here nothing
 * has been.
 */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <Shell title="Something failed while drawing this page.">
      <p>
        This is a fault in the page, not on the chain. Nothing here tells you
        whether a transaction went through — check the account on Celoscan if
        one was in flight.
      </p>
      <div className="mt-3">
        <Button variant="primary" onClick={reset}>Try again</Button>
      </div>
    </Shell>
  )
}
