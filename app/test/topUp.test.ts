import { describe, expect, it } from 'vitest'
import { describeTopUpState, topUpNeedsArming } from '../lib/topUp.js'

describe('describeTopUpState', () => {
  // The row a non-owner reads. It has to say what the switch MEANS, not just
  // which way it points: "Off" alone tells a reader nothing about whether
  // their money can leave, which is the only question this switch answers.
  it('says what each state permits, not just its name', () => {
    expect(describeTopUpState(true)).toMatch(/on/i)
    expect(describeTopUpState(true)).toMatch(/own wallet/i)
    expect(describeTopUpState(false)).toMatch(/off/i)
    expect(describeTopUpState(false)).toMatch(/cannot/i)
  })

  it('never reports a state as known before it has been read', () => {
    expect(describeTopUpState(null)).toBe('—')
  })
})

describe('topUpNeedsArming', () => {
  // Turning it ON opens the one path out of this account the allowlist cannot
  // reach. That direction gets the app's two-beat confirm, the same as Stop
  // and the same as removing the last approved payee.
  it('arms the direction that opens the drain path', () => {
    expect(topUpNeedsArming(true)).toBe(true)
  })

  // Turning it OFF only ever removes a permission. A control that made the
  // safe direction harder would be teaching the wrong reflex.
  it('does not arm the direction that closes it', () => {
    expect(topUpNeedsArming(false)).toBe(false)
  })
})
