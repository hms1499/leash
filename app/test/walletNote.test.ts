import { describe, expect, it } from 'vitest'
import { noteForWallet } from '../lib/walletNote.js'

const A = '0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57'
const B = '0x64Ad61211C1b0B7f20B3e04B49661f30f152ae78'

describe('noteForWallet', () => {
  it('shows a note to the wallet that caused it', () => {
    expect(noteForWallet({ text: '✓ Nomination saved.', wallet: A }, A)).toBe('✓ Nomination saved.')
  })

  // Measured on mainnet 2026-09-12: wallet B nominated, the maintainer switched
  // MetaMask to wallet A, and "✓ Nomination saved." was still on screen —
  // under a panel addressed to A, about something A had not done. React does
  // not remount on an account switch, so component state outlives the wallet
  // it describes.
  it('hides it from a wallet that did not', () => {
    expect(noteForWallet({ text: '✓ Nomination saved.', wallet: B }, A)).toBeNull()
  })

  it('hides it when the wallet disconnects', () => {
    expect(noteForWallet({ text: '✓ Nomination saved.', wallet: A }, undefined)).toBeNull()
  })

  it('has nothing to show when nothing has happened', () => {
    expect(noteForWallet(null, A)).toBeNull()
  })

  // Wallets disagree about checksum casing; the same account must not read as
  // two, or a note would vanish from the wallet that earned it.
  it('is case-insensitive, like every other address comparison here', () => {
    expect(noteForWallet({ text: 'x', wallet: A.toUpperCase() }, A.toLowerCase())).toBe('x')
  })
})
