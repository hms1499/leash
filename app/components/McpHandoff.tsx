'use client'

import { useState } from 'react'
import { buildMcpJson } from '../lib/mcpJson.js'
import Panel from './ui/Panel'
import Label from './ui/Label'
import Button from './ui/Button'
import { useRevealOnOpen } from '../lib/useReveal.js'

/**
 * The steps that follow this block, for a reader who came through the
 * wizard and has everything except OPERATOR_PK. Its first three are a folder
 * and a text file, deliberately ahead of the installs: this block is in their
 * clipboard and the operator key was shown once, and neither survives ten
 * minutes of `brew install node`. Deliberately NOT
 * docs/mcp-setup.md: that page opens with two paths and a Foundry deploy, and
 * a wizard user has to work out that its first two sections do not apply to
 * them. Sending them there was the handoff's weakest link.
 */
const GUIDE = 'https://github.com/hms1499/leash/blob/main/docs/quickstart.md'
/**
 * Where a registered builder goes for the one variable this block no longer
 * carries. Leaving the field on screen cost every other reader a decision they
 * had no way to make: the code represents the app that built the transaction,
 * which is the server, not them.
 */
const TAG_GUIDE =
  'https://github.com/hms1499/leash/blob/main/docs/mcp-setup.md#where-attribution_tag-comes-from'

export default function McpHandoff({
  account, operator = null, defaultOpen = false,
}: {
  account: `0x${string}`
  /**
   * Which wallet's key OPERATOR_PK must be, when the caller can name one.
   *
   * An account can have several authorised operators -- d1405ba fixed a
   * revoke that left a second one spending -- so "your agent wallet's private
   * key" is ambiguous on exactly the accounts where being wrong costs most.
   * Callers pass a value they have VERIFIED against operators(), never a
   * query parameter.
   */
  operator?: `0x${string}` | null
  /** Open on /setup, where this is the step; shut on the dashboard, where it is a reference. */
  defaultOpen?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  // Held in state rather than passed straight to `open`. It was the tag field's
  // keystrokes that made a bare `open={prop}` slam the panel shut; that field
  // is gone, but a parent re-render for any other reason would do the same, and
  // the disclosure's own state is where an open disclosure belongs regardless.
  const [open, setOpen] = useState(defaultOpen)
  // Empty on the first render, so the already-open panel on /setup arrives
  // rather than announcing itself. §12.
  const reveal = useRevealOnOpen(open)

  // Two variables. leash-agentpay defaults the token and the fee adapter to
  // USDC on Celo mainnet (0.4.0) and emits its own attribution code (0.5.0),
  // so the only values left are the ones nothing but this user can supply.
  const block = buildMcpJson({ account })

  return (
    <Panel as="section" className="p-6">
      <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary className="motion-press control-text tap-tall cursor-pointer focus-ring"
          style={{ borderRadius: 'var(--r-mark)', outlineColor: 'var(--text)' }}>
          <Label>Connect your agent runtime</Label>
          <span className="block text-sm mt-1" style={{ color: 'var(--dim)' }}>
            The <code>.mcp.json</code> for this account. Optional — the account is
            already protected and working without it.
          </span>
        </summary>

        {/* The reveal a <details> cannot get by mounting. Applied to the block
            rather than to the whole disclosure: this is the artifact the reader
            opened the panel for, and §12's 90ms is there to say the shove the
            page just took was theirs. */}
        <pre
          className={`num mt-4 p-3 overflow-x-auto ${reveal}`.trimEnd()}
          style={{ background: 'var(--well)', borderRadius: 'var(--r-box)' }}
        >
          {block}
        </pre>

        <Button
          variant="primary"
          className="mt-3"
          onClick={() => {
            void (async () => {
              try {
                // Await the write: a denied permission, an insecure context, or
                // an unfocused document all reject silently otherwise, and
                // "Copied" would be a lie about the one artifact this task
                // exists to deliver.
                await navigator.clipboard.writeText(block)
                setCopyFailed(false)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              } catch {
                setCopied(false)
                setCopyFailed(true)
              }
            })()
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
        {copyFailed && (
          // An outcome landing, which is §12's other use for the 90ms -- the
          // same thing Address does when a copy resolves. This one mounts on
          // failure, so the class fires without help.
          <p className="motion-reveal text-sm mt-2" style={{ color: 'var(--bad)' }}>
            Copy failed — select the block and copy manually.
          </p>
        )}

        <p className="text-sm mt-5" style={{ color: 'var(--bad)' }}>
          Replace <code>OPERATOR_PK</code> with the private key of{' '}
          {operator
            ? <><code className="num">{operator}</code>, the wallet this account has authorised.</>
            : <>your agent wallet.</>}{' '}
          This block never carries it and nothing is sent anywhere. It is a hot
          key: whoever holds it can spend up to your limits.
        </p>
        <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
          This runs the published <code>leash-agentpay</code> package through{' '}
          <code>npx</code>. Node.js 20 or newer is required.{' '}
          <a href={GUIDE} target="_blank" rel="noreferrer"
            style={{ color: 'var(--text)', textDecoration: 'underline' }}>
            Next steps: connect it to Claude Code
          </a>
        </p>
        <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
          Every transaction carries Leash&apos;s ERC-8021 attribution code, so
          there is nothing here to fill in. Shipping your own registered
          product on top of this server?{' '}
          <a href={TAG_GUIDE} target="_blank" rel="noreferrer"
            style={{ color: 'var(--text)', textDecoration: 'underline' }}>
            Add your code beside it
          </a>
          .
        </p>
      </details>
    </Panel>
  )
}
