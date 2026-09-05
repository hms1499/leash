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

export const metadata: Metadata = {
  title: 'Leash — an agent wallet you do not have to trust',
  description:
    'Spend limits for an AI agent, enforced by a contract on Celo mainnet rather than by a prompt. Live, verifiable, and open source.',
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
