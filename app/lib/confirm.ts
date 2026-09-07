/**
 * The one `pollUntil` this project has, re-exported so every caller in `app/`
 * keeps its existing import path.
 *
 * The implementation and its tests live in `@leash/sdk` (`sdk/src/confirm.ts`).
 * It moved there because the rule it encodes — "wait on the condition, not the
 * receipt", and never mistake a failed read for a failed write — has to travel
 * with the code that sends transactions, and this file could not be imported
 * by `examples/` or `mcp/`. Both went without it, and both shipped a correct
 * write path with a wrong account of it.
 */
export { pollUntil } from '@leash/sdk'
