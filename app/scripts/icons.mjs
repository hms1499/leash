/**
 * Regenerate the raster copy of the tab icon from app/icon.svg.
 *
 *     cd app && node scripts/icons.mjs
 *
 * The SVG is the drawing; the .ico is for everything that asks for
 * `/favicon.ico` by path without reading the document first -- link unfurlers,
 * feed readers, and any browser old enough to refuse an SVG icon. Measured
 * 2026-09-11, that path was a 404.
 *
 * Rendered rather than hand-drawn so there is one drawing: change icon.svg and
 * run this. The sibling scripts/og.mjs does the same for the Open Graph image.
 */
import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const svg = readFileSync(`${ROOT}app/icon.svg`, 'utf8')

/**
 * An ICO file holding one PNG. The format allows a PNG payload directly
 * (Vista onwards), so this is a 22-byte header in front of the bytes Chromium
 * already produced -- no encoder, and nothing to keep in step with the
 * drawing.
 */
function ico(png, size) {
  const header = Buffer.alloc(22)
  header.writeUInt16LE(0, 0)            // reserved
  header.writeUInt16LE(1, 2)            // type: icon
  header.writeUInt16LE(1, 4)            // one image
  header.writeUInt8(size % 256, 6)      // width, 0 meaning 256
  header.writeUInt8(size % 256, 7)      // height
  header.writeUInt8(0, 8)               // palette size: none
  header.writeUInt8(0, 9)               // reserved
  header.writeUInt16LE(1, 10)           // colour planes
  header.writeUInt16LE(32, 12)          // bits per pixel
  header.writeUInt32LE(png.length, 14)  // payload size
  header.writeUInt32LE(22, 18)          // payload offset
  return Buffer.concat([header, png])
}

const browser = await chromium.launch()

async function render(size) {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  })
  // The SVG is inlined rather than served: this script runs without the app.
  await page.setContent(
    `<body style="margin:0">${svg.replace(/width="32" height="32"/, `width="${size}" height="${size}"`)}</body>`,
  )
  const shot = await page.screenshot({ omitBackground: true })
  await page.close()
  return shot
}

/**
 * Only the .ico. An `icon.png` beside `icon.svg` looks like a useful fallback
 * and is not: Next routes both from the same `icon` basename, so adding the
 * PNG *replaced* the SVG link rather than joining it -- checked against the
 * served HTML on 2026-09-11. `favicon.ico` is a different route and a
 * different link, so the two coexist: modern browsers take the SVG, and
 * anything that asks for /favicon.ico by path gets an answer.
 */
writeFileSync(`${ROOT}app/favicon.ico`, ico(await render(32), 32))
await browser.close()
console.log(`wrote ${ROOT}app/favicon.ico`)
