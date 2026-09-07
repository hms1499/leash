import { describe, it, expect, vi } from 'vitest'
import { confirmTransaction } from '../src/confirm.js'

const fast = { attempts: 4, intervalMs: 0 }

describe('confirmTransaction', () => {
  it('reports success only when a receipt says the transaction succeeded', async () => {
    const getReceipt = vi.fn().mockResolvedValue({ status: 'success' })
    await expect(confirmTransaction(getReceipt, fast)).resolves.toBe('success')
  })

  // waitForTransactionReceipt resolves on revert. A transaction that landed
  // and reverted moved no money, and must never be reported as a payment.
  it('reports a reverted transaction as reverted, not as success', async () => {
    const getReceipt = vi.fn().mockResolvedValue({ status: 'reverted' })
    await expect(confirmTransaction(getReceipt, fast)).resolves.toBe('reverted')
  })

  // The receipt is absent for every block until the transaction is mined, and
  // forno answers that by throwing. Giving up on the first throw would call a
  // landed payment unobserved.
  it('keeps waiting while the receipt is not there yet', async () => {
    const getReceipt = vi.fn()
      .mockRejectedValueOnce(new Error('TransactionReceiptNotFoundError'))
      .mockRejectedValueOnce(new Error('HTTP 500'))
      .mockResolvedValue({ status: 'success' })
    await expect(confirmTransaction(getReceipt, fast)).resolves.toBe('success')
    expect(getReceipt).toHaveBeenCalledTimes(3)
  })

  // "We stopped waiting" is its own answer. It is not success, and it is not
  // failure: the transaction may still be in the mempool, so the caller must
  // be told something it cannot mistake for either.
  it('reports unobserved when no receipt ever arrives', async () => {
    const getReceipt = vi.fn().mockRejectedValue(new Error('still pending'))
    await expect(confirmTransaction(getReceipt, fast)).resolves.toBe('unobserved')
    expect(getReceipt).toHaveBeenCalledTimes(4)
  })

  it('never throws, so a failed read cannot reach the caller as a failed write', async () => {
    const getReceipt = vi.fn().mockRejectedValue(new Error('forno is down'))
    await expect(confirmTransaction(getReceipt, fast)).resolves.toBe('unobserved')
  })
})
