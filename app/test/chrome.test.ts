import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * Four screens, four hand-built headers, and no primitive owning any of them
 * -- which is how /accounts came to show the bare word CELO in its top right
 * with nothing saying it is a network. §6's own rule: a screen needing
 * something none of the primitives provides is a new primitive, not a one-off.
 *
 * Shell and SiteFooter are the two legitimate exceptions. Shell is the frame
 * for the message screens -- not found, a render error, an address that is not
 * an address -- and predates this. The footer's brand is a different element
 * in a different place.
 */
const ALLOWED = [
  'components/ui/AppHeader.tsx',
  'components/ui/Shell.tsx',
  'components/ui/BrandLink.tsx',
  'components/landing/SiteFooter.tsx',
]

function sources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${entry}`
    if (statSync(join(ROOT, rel)).isDirectory()) {
      if (entry.startsWith('.')) continue
      sources(rel, found)
    } else if (entry.endsWith('.tsx')) found.push(rel)
  }
  return found
}

describe('the chrome', () => {
  it('is built once, not per screen', () => {
    const offenders = [...sources('app'), ...sources('components')]
      .filter((f) => !ALLOWED.includes(f))
      .filter((f) => /BrandLink/.test(readFileSync(join(ROOT, f), 'utf8')))
    expect(offenders, 'these build their own chrome instead of using AppHeader:\n'
      + `${offenders.join('\n')}\n\ndocs/design-system.md §6.`).toEqual([])
  })
})
