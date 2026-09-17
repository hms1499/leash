/**
 * What ConnectButton decides, kept out of the component because
 * app/vitest.config.ts runs in the node environment and no component-testing
 * dependency may be added. Same arrangement as lib/writePhase.ts.
 */

/**
 * Whether to connect on the reader's behalf.
 *
 * Only inside MiniPay, where opening the page already chose the wallet, and
 * only once per page: the effect that calls this used to fire on every
 * disconnected render, which made Disconnect inside MiniPay reconnect at once.
 * `status`, not `isConnected`, so it also stays out of wagmi's own reconnect
 * on a hard load.
 */
export function shouldAutoConnect(input: {
  miniPay: boolean
  status: string
  attempted: boolean
}): boolean {
  return input.miniPay && input.status === 'disconnected' && !input.attempted
}

export const NO_WALLET =
  'No browser wallet found. Install one, or open this page in MiniPay, then reload.'
export const CONNECT_CANCELLED = 'The wallet did not connect. The request was cancelled.'
export const CONNECT_PENDING =
  'Your wallet already has a connection request open. Finish it there.'
export const CONNECT_FAILED = 'The wallet did not connect. Try again.'

type Link = { name?: unknown; code?: unknown; cause?: unknown }

/**
 * One sentence for a failed connect, or null when there is no failure.
 *
 * Walks `cause` by hand rather than through viem's BaseError.walk: wagmi's
 * ProviderNotFoundError and a wallet's raw `{ code }` object are not viem
 * errors. Bounded, so a cyclic chain cannot hang the render.
 */
export function describeConnectError(error: unknown): string | null {
  if (error === null || error === undefined) return null
  let link: unknown = error
  for (let depth = 0; depth < 10 && link && typeof link === 'object'; depth++) {
    const { name, code, cause } = link as Link
    if (name === 'ProviderNotFoundError') return NO_WALLET
    if (code === 4001 || name === 'UserRejectedRequestError') return CONNECT_CANCELLED
    if (code === -32002) return CONNECT_PENDING
    link = cause
  }
  return CONNECT_FAILED
}
