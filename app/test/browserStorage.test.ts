import { describe, it, expect, afterEach, vi } from 'vitest'
import { readLocal, writeLocal, removeLocal } from '../lib/browserStorage.js'

function install(impl: Partial<Storage>) {
  vi.stubGlobal('localStorage', impl as Storage)
}
afterEach(() => vi.unstubAllGlobals())

describe('browser storage never takes a write path down with it', () => {
  it('reads a value through when storage works', () => {
    install({ getItem: (k: string) => (k === 'a' ? 'b' : null) })
    expect(readLocal('a')).toBe('b')
  })

  it('returns null instead of throwing when access is blocked', () => {
    // Safari private mode and blocked third-party contexts raise SecurityError
    // on access, not on a missing key.
    install({ getItem: () => { throw new Error('SecurityError') } })
    expect(readLocal('a')).toBeNull()
  })

  it('swallows a failed write, because remembering is a convenience', () => {
    // The write it guards runs AFTER a pollUntil has confirmed the transaction
    // on chain. A throw here used to reach a catch that said "The transaction
    // was not sent." about a write that had landed.
    install({ setItem: () => { throw new Error('QuotaExceededError') } })
    expect(() => writeLocal('a', 'b')).not.toThrow()
  })

  it('swallows a failed removal', () => {
    install({ removeItem: () => { throw new Error('SecurityError') } })
    expect(() => removeLocal('a')).not.toThrow()
  })

  it('still performs the write when storage works', () => {
    const setItem = vi.fn()
    install({ setItem })
    writeLocal('a', 'b')
    expect(setItem).toHaveBeenCalledWith('a', 'b')
  })

  it('survives localStorage being absent entirely', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(readLocal('a')).toBeNull()
    expect(() => writeLocal('a', 'b')).not.toThrow()
    expect(() => removeLocal('a')).not.toThrow()
  })
})
