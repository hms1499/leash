import { test, expect, type Page } from '@playwright/test'

const ACCOUNT = process.env.LEASH_E2E_ACCOUNT ?? '0xBE380aa73c036da30D3b2fd5E75B0d1d89E11C3d'
/** owner() of the account above, read off the chain -- not a fixture of ours. */
const OWNER = process.env.LEASH_E2E_OWNER ?? '0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57'
/** A second account in the owner's list, so the header carries its switcher. */
const SECOND = '0xA73DB76f20c5ede3ABE883565D22905760F83982'

/**
 * The owner's header on a phone.
 *
 * Every other phone check in this suite runs with no wallet, which is the one
 * header nobody operates. Connected, the owner's band holds the switcher, the
 * network badge, Stop and the wallet -- measured on the live app 2026-09-19 it
 * was 405px wide at 375, and 505px once a refused Stop put its note beside
 * the button. The note pushed Stop itself off the screen: the kill switch left
 * the viewport at the moment the owner needed to press it again.
 *
 * The wallet is a stand-in that names the owner and refuses every signature,
 * so nothing here can send a transaction.
 */
async function connectAsOwner(page: Page, width: number) {
  await page.setViewportSize({ width, height: 760 })
  await page.addInitScript(({ owner, accounts }) => {
    localStorage.setItem(
      `leash.accounts.${owner.toLowerCase()}`,
      JSON.stringify(accounts.map((address, i) => ({ address, addedAt: i + 1 }))),
    )
    const refuse = () => Object.assign(new Error('User rejected the request.'), { code: 4001 })
    ;(window as unknown as { ethereum: unknown }).ethereum = {
      on() {}, removeListener() {},
      async request({ method }: { method: string }) {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [owner]
        if (method === 'eth_chainId') return '0xa4ec'
        if (method.startsWith('wallet_')) return null
        if (method === 'eth_sendTransaction' || method.includes('sign')) throw refuse()
        throw Object.assign(new Error(`not a method this wallet answers: ${method}`), { code: 4200 })
      },
    }
  }, { owner: OWNER, accounts: [ACCOUNT, SECOND] })
  await page.goto(`/a/${ACCOUNT}`)
  await page.getByRole('button', { name: 'Connect wallet' }).click()
  // Stop renders only once owner() has come back and matches the wallet.
  await expect(page.getByRole('button', { name: /Stop$/ })).toBeVisible({ timeout: 30_000 })
}

/** What does not fit: sideways scroll, controls past the edge, labels on two lines. */
function measureHeader(page: Page) {
  return page.evaluate(() => {
    const width = window.innerWidth
    const controls = [...document.querySelectorAll<HTMLElement>('header button, header a, header select')]
    const name = (c: HTMLElement) => (c.textContent ?? '').trim()
    return {
      sideways: document.documentElement.scrollWidth - width,
      offscreen: controls
        .filter((c) => { const r = c.getBoundingClientRect(); return r.right > width + 0.5 || r.left < -0.5 })
        .map(name),
      // Button's floor is 44px; a label that wrapped draws 56-58.
      wrapped: controls
        .filter((c) => c.getBoundingClientRect().height > 44.5)
        .map((c) => `${name(c)} ${c.getBoundingClientRect().height.toFixed(0)}px`),
    }
  })
}

for (const width of [320, 360, 375]) {
  test(`the owner's header fits a ${width}px phone`, async ({ page }) => {
    await connectAsOwner(page, width)
    await expect(page.getByRole('combobox', { name: 'Protected account' })).toBeVisible()
    expect(await measureHeader(page)).toEqual({ sideways: 0, offscreen: [], wrapped: [] })
  })

  test(`Stop stays on a ${width}px screen after the wallet refuses it`, async ({ page }) => {
    await connectAsOwner(page, width)
    await page.getByRole('button', { name: /Stop$/ }).click()
    await page.getByRole('button', { name: 'Confirm stop' }).click()
    await expect(page.getByText('The transaction was not sent.')).toBeVisible()
    await expect(page.getByRole('button', { name: /Stop$/ })).toBeInViewport({ ratio: 1 })
    expect(await measureHeader(page)).toEqual({ sideways: 0, offscreen: [], wrapped: [] })
  })
}
