import type { Metadata } from 'next'
import { JetBrains_Mono } from 'next/font/google'
import './globals.css'
import Providers from './providers'

/**
 * Self-hosted at build time by next/font, not fetched from Google at runtime:
 * faster, and it leaks no referrer.
 *
 * SF Mono is reached on Apple devices through `ui-monospace` and looks
 * excellent there, but Apple's licence does not permit shipping it as a
 * webfont. In a design where everything is mono, a judge on Windows falling
 * back to Consolas is not a subtle substitution. What is designed should be
 * what is seen. docs/design-system.md §2.
 */
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

/**
 * Where this app is served from, for absolute URLs in the social preview.
 *
 * Derived rather than hard-coded, in this order: an explicit override, then
 * Vercel's stable production domain, then localhost. VERCEL_URL is
 * deliberately not used -- it is the *deployment's* URL, so it changes on
 * every push and a shared link would point at a dead preview.
 *
 * If none is set the value is localhost, and the preview simply does not
 * resolve for anyone else. That is the honest failure: a broken image rather
 * than a link to somewhere that is not us.
 */
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000')

const TITLE = 'Leash — an agent wallet you do not have to trust'
const DESCRIPTION =
  'Spend limits for an AI agent, enforced by a contract on Celo mainnet rather than by a prompt. Live, verifiable, and open source.'

/**
 * The submission is a link. Before this the app had no favicon, no
 * opengraph-image and no metadataBase, so pasted into a chat or a judging
 * sheet it rendered as bare text with a blank tab icon.
 *
 * opengraph-image.png and icon.svg are picked up by file convention -- Next
 * emits the og:image and icon tags from their presence, so they are not
 * listed here.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: 'Leash',
    title: TITLE,
    description: DESCRIPTION,
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={mono.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
