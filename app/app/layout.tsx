import type { Metadata } from 'next'
import './globals.css'
import Providers from './providers'

export const metadata: Metadata = {
  title: 'Leash — an agent wallet you do not have to trust',
  description:
    'Spend limits for an AI agent, enforced by a contract on Celo mainnet rather than by a prompt. Live, verifiable, and open source.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
