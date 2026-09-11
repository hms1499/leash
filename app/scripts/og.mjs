/**
 * Regenerate app/opengraph-image.png.
 *
 * The submission is a link, and this is the image a judge sees before the page
 * loads. It is a raster, so unlike every other surface in this app it cannot
 * read `var(--bg)` -- which is how it came to be carrying #0B0D10 and a
 * wordmark with no mark beside it after §4 lifted the grounds on 2026-09-11.
 *
 * So it is generated rather than drawn, and generated *from* `app/globals.css`:
 * there is no second copy of the palette here, only a reader for the one the
 * app runs on. Re-run after any change to the palette, the mark or the
 * headline:
 *
 *     cd app && node scripts/og.mjs
 *
 * `test/tokens.test.ts` asserts this file's own reader against the palette, so
 * a colour that moves without the image being regenerated is caught by the
 * suite rather than by someone looking at a link preview.
 */
import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const css = readFileSync(`${ROOT}app/globals.css`, 'utf8')

/** The runtime palette is the only palette. A missing token is a hard stop. */
export function token(name) {
  const found = new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(css)
  if (!found) throw new Error(`--${name} is not declared in app/globals.css`)
  return found[1]
}

/** The mark from components/ui/Mark.tsx, one drawing in two files. */
const MARK = `<svg viewBox="0 0 10 21" height="34" fill="${token('celo')}">
  <path fill-rule="evenodd" d="M5 0 10 2.5 5 5 0 2.5Z M5 0.56 8.88 2.5 5 4.44 1.12 2.5Z"/>
  <path d="M0 2.5 4.65 5 5 10.5 0 8Z"/><path d="M10 2.5 5.35 5 5 10.5 10 8Z"/>
  <path fill-rule="evenodd" d="M5 10.5 10 13 5 15.5 0 13Z M5 11.06 8.88 13 5 14.94 1.12 13Z"/>
  <path d="M0 13 4.65 15.5 5 21 0 18.5Z"/><path d="M10 13 5.35 15.5 5 21 10 18.5Z"/>
</svg>`

const html = `<!doctype html>
<html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  :root { color-scheme: dark }
  * { margin: 0; box-sizing: border-box }
  body {
    width: 1200px; height: 630px; background: ${token('bg')};
    font-family: 'JetBrains Mono', ui-monospace, Menlo, monospace;
    padding: 96px 96px 0; display: flex; flex-direction: column;
  }
  .brand { display: flex; align-items: center; gap: 12px; color: ${token('celo')};
           font-size: 20px; font-weight: 700; letter-spacing: .26em }
  /* 26ch keeps the headline on the two lines it was written to break on:
     "…a wallet" / "without trusting it." A third line pushes the meter into
     the copy below it. */
  h1 { color: ${token('text')}; font-size: 62px; line-height: 1.14; font-weight: 500;
       margin-top: 52px; letter-spacing: -.01em; max-width: 26ch }
  .meter { margin-top: 56px; height: 14px; background: ${token('well')}; position: relative;
           border-radius: 3px; overflow: hidden }
  .fill { position: absolute; inset: 0 66% 0 0; background: ${token('meter-fill')} }
  .cap { position: absolute; top: -4px; bottom: -4px; right: 24px; width: 6px;
         background: ${token('celo')}; border-radius: 2px }
  p { margin-top: 40px; color: ${token('dim')}; font-size: 26px; line-height: 1.45;
      font-family: ui-sans-serif, system-ui, sans-serif; max-width: 44ch }
</style></head>
<body>
  <div class="brand">${MARK}LEASH</div>
  <h1>Give an AI agent a wallet without trusting it.</h1>
  <div class="meter"><div class="fill"></div><div class="cap"></div></div>
  <p>Spend limits enforced by a contract on Celo mainnet, not by a sentence in a prompt.</p>
</body></html>`

const out = `${ROOT}app/opengraph-image.png`
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.setContent(html, { waitUntil: 'networkidle' })
// The webfont is fetched here rather than self-hosted: this runs once, by
// hand, and a judge sees the raster. `document.fonts.ready` is what stops the
// screenshot landing on the fallback face.
await page.evaluate(() => document.fonts.ready)
writeFileSync(out, await page.screenshot())
await browser.close()
console.log(`wrote ${out}`)
