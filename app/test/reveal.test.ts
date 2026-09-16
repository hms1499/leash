import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { revealOnOpen } from '../lib/useReveal.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

describe('revealOnOpen', () => {
  it('reveals a disclosure the reader opened', () => {
    expect(revealOnOpen(true, true)).toBe('motion-reveal')
  })

  it('stays quiet while shut', () => {
    expect(revealOnOpen(false, true)).toBe('')
  })

  /**
   * design-system.md §12: "A transition does not run on first render."
   *
   * This is the case that needs the flag. `McpHandoff` is mounted already-open
   * on /setup, where `defaultOpen` is set, so without this it would announce
   * itself on arrival -- an entrance, which §12 refuses.
   */
  it('does not run on the first render, even when it mounts open', () => {
    expect(revealOnOpen(true, false)).toBe('')
  })

  it('is quiet on a first render that is also shut', () => {
    expect(revealOnOpen(false, false)).toBe('')
  })
})

/**
 * Every `<details>` in the app opens the same way.
 *
 * `LimitsDrawer` and `OwnershipDrawer` open by mounting a Panel, so
 * `.motion-reveal` arrives with the element and plays by itself. A `<details>`
 * keeps its content in the DOM, so nothing mounts and the class never fires --
 * which is why `McpHandoff` and the wizard's prerequisites list opened with no
 * motion at all while their two siblings had it.
 *
 * CLAUDE.md: two implementations of one operation must not behave differently.
 * A third `<details>` added later would be the next divergence, so this counts
 * them rather than naming the two.
 */
describe('every disclosure opens the same way', () => {
  function sources(dir: string, found: string[] = []): string[] {
    for (const entry of readdirSync(join(ROOT, dir))) {
      const rel = `${dir}/${entry}`
      if (statSync(join(ROOT, rel)).isDirectory()) {
        if (entry.startsWith('.')) continue
        sources(rel, found)
      } else if (entry.endsWith('.tsx')) {
        found.push(rel)
      }
    }
    return found
  }

  const FILES = [...sources('app'), ...sources('components')].sort()

  it('gives every <details> the shared reveal hook', () => {
    const missing = FILES.filter((f) => {
      const src = readFileSync(join(ROOT, f), 'utf8')
      // Comments name `<details` in prose -- Hero explains where the wizard's
      // sits -- and that is documentation rather than a disclosure.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      return /<details[\s>]/.test(code) && !code.includes('useRevealOnOpen')
    })
    expect(missing, 'a <details> here opens with no motion, while the drawers next to it '
      + 'animate. Use useRevealOnOpen. docs/design-system.md §12.').toEqual([])
  })
})
