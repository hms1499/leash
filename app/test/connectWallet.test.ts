import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ProviderNotFoundError } from 'wagmi'
import { UserRejectedRequestError } from 'viem'
import {
  CONNECT_CANCELLED, CONNECT_FAILED, CONNECT_PENDING, NO_WALLET,
  describeConnectError, shouldAutoConnect,
} from '../lib/connectWallet.js'

describe('shouldAutoConnect', () => {
  it('connects once inside MiniPay', () => {
    expect(shouldAutoConnect({ miniPay: true, status: 'disconnected', attempted: false })).toBe(true)
  })

  // The effect used to fire on every isConnected=false, so Disconnect inside
  // MiniPay reconnected immediately and reset the wizard each time.
  it('does not reconnect after the one attempt', () => {
    expect(shouldAutoConnect({ miniPay: true, status: 'disconnected', attempted: true })).toBe(false)
  })

  // A hard load starts disconnected and then runs wagmi's own reconnect. A
  // second connect racing it is two requests to the same wallet.
  it('stays out of wagmi reconnecting and connecting', () => {
    expect(shouldAutoConnect({ miniPay: true, status: 'reconnecting', attempted: false })).toBe(false)
    expect(shouldAutoConnect({ miniPay: true, status: 'connecting', attempted: false })).toBe(false)
  })

  it('never connects outside MiniPay', () => {
    expect(shouldAutoConnect({ miniPay: false, status: 'disconnected', attempted: false })).toBe(false)
  })
})

describe('describeConnectError', () => {
  it('says nothing when there is no error', () => {
    expect(describeConnectError(null)).toBeNull()
    expect(describeConnectError(undefined)).toBeNull()
  })

  // injected() is always in the connector list, so with no extension the
  // button used to reject silently and look broken.
  it('names a missing wallet', () => {
    expect(describeConnectError(new ProviderNotFoundError())).toBe(NO_WALLET)
  })

  it('names a cancelled request, however deep the cause', () => {
    expect(describeConnectError(new UserRejectedRequestError(new Error('no')))).toBe(CONNECT_CANCELLED)
    expect(describeConnectError({ message: 'wrapped', cause: { code: 4001 } })).toBe(CONNECT_CANCELLED)
  })

  // MetaMask's answer to a second click while the first prompt is open.
  it('names a request already open in the wallet', () => {
    expect(describeConnectError({ code: -32002 })).toBe(CONNECT_PENDING)
  })

  it('falls back to a plain failure', () => {
    expect(describeConnectError(new Error('boom'))).toBe(CONNECT_FAILED)
  })

  it('does not loop on a cyclic cause chain', () => {
    const a: { cause?: unknown } = {}
    a.cause = a
    expect(describeConnectError(a)).toBe(CONNECT_FAILED)
  })
})

describe('ConnectButton wiring', () => {
  const ROOT = fileURLToPath(new URL('..', import.meta.url))
  const source = readFileSync(join(ROOT, 'components/ConnectButton.tsx'), 'utf8')

  it('uses the pure decisions rather than its own', () => {
    expect(source).toContain('shouldAutoConnect(')
    expect(source).toContain('describeConnectError(')
    expect(source).toContain('disabled={isPending}')
  })

  // Calling isMiniPay() in the render body is a hydration mismatch inside
  // MiniPay: the server says false, the client says true.
  it('learns MiniPay in an effect', () => {
    expect(source).toMatch(/useEffect\(\(\) => \{ setMiniPay\(isMiniPay\(\)\) \}, \[\]\)/)
  })

  it('names the disconnect action, starting with the visible text', () => {
    expect(source).toContain('aria-label={`${truncateAddress(address)}, disconnect`}')
  })

  // Label's default color is --dim, which on the paused header's --bad ground
  // is ~1.06:1 -- invisible. .on-bright in globals.css only recolors
  // .control-*, not Label, so every Label here must set its own color from
  // onDangerBand, the way the error note already does.
  it('recolors every Label from onDangerBand', () => {
    const openTags = source.match(/<Label[^>]*>/g) ?? []
    expect(openTags.length).toBeGreaterThan(0)
    for (const tag of openTags) {
      expect(tag).toContain('onDangerBand')
    }
  })
})
