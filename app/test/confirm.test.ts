import { describe, it, expect } from 'vitest'
import { pollUntil as sdkPollUntil } from '@leash/sdk'
import { pollUntil } from '../lib/confirm.js'

describe('app/lib/confirm', () => {
  // The behaviour is tested once, in sdk/test/confirm.test.ts. What the app
  // has to guard is that its own import path still reaches that one
  // implementation: a second copy here is how `examples/` came to ship a demo
  // that printed an allowance which had not moved.
  it('re-exports the SDK pollUntil rather than a second copy', () => {
    expect(pollUntil).toBe(sdkPollUntil)
  })
})
