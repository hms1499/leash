import { describe, it, expect, vi } from 'vitest'
import { pollUntil } from '../lib/confirm.js'

const fast = { attempts: 4, intervalMs: 0 }

describe('pollUntil', () => {
  it('stops at the first observation and reports it', async () => {
    const check = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    await expect(pollUntil(check, fast)).resolves.toBe(true)
    expect(check).toHaveBeenCalledTimes(2)
  })

  // forno is load-balanced: one node can 500 while the transaction has
  // already landed. Ending the poll there would report a landed transaction
  // as never sent.
  it('keeps polling past a failed read', async () => {
    const check = vi.fn()
      .mockRejectedValueOnce(new Error('HTTP 500'))
      .mockResolvedValueOnce(true)
    await expect(pollUntil(check, fast)).resolves.toBe(true)
    expect(check).toHaveBeenCalledTimes(2)
  })

  it('reports no observation when the value never changes', async () => {
    const check = vi.fn().mockResolvedValue(false)
    await expect(pollUntil(check, fast)).resolves.toBe(false)
    expect(check).toHaveBeenCalledTimes(4)
  })

  // The caller's own catch means "the write failed". A poll that throws must
  // never reach it, or a landed transaction is reported as not sent.
  it('never throws, even when every read fails', async () => {
    const check = vi.fn().mockRejectedValue(new Error('forno is down'))
    await expect(pollUntil(check, fast)).resolves.toBe(false)
    expect(check).toHaveBeenCalledTimes(4)
  })
})
