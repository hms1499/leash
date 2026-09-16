import Label from '../ui/Label'
import Panel from '../ui/Panel'
import ActionLink from '../ui/ActionLink'
import { DATA, PROSE, SUBHEAD } from '../ui/prose'
import { GRID } from '../ui/page'

/**
 * What a developer receives, named.
 *
 * A section by this name existed until 2026-09-08, when c7dde1f deleted it.
 * The reason recorded in the spec it rewrote was sound -- "a wall of JSON is
 * the first thing that stops a non-developer reading" -- but the cut took the
 * package name and the three tool names with it, and those are not a wall.
 * Measured on the rebuilt page: `leash-agentpay` appeared nowhere on the
 * homepage, and neither did `leash_status`, `leash_pay` or `leash_fetch`. A
 * reader could finish the page understanding the protection model exactly and
 * still not know what to install.
 *
 * So the names come back and the JSON block does not. e2e/landing.spec.ts
 * still asserts `mcpServers` appears zero times here, which is that 2026-09-08
 * decision kept rather than overturned: the real block is emitted by /setup,
 * for the reader's OWN account, with the operator verified against
 * `operators()` -- which is a better artifact than a sample anyone must edit.
 *
 * The old component hard-coded `0x7aDa926B…3fd2` as its sample account. That
 * is v1, one of the three superseded deployments CLAUDE.md forbids putting in
 * a fixture. Carrying no address at all is how this file cannot repeat that.
 */

const TOOLS = [
  {
    name: 'leash_status',
    title: 'Check the allowance',
    body: 'What is left today, what the caps are, and when the allowance resets.',
  },
  {
    name: 'leash_pay',
    title: 'Pay a recipient',
    body: 'Pay a Celo address. Refused past the caps, and the refusal explains itself.',
  },
  {
    name: 'leash_fetch',
    title: 'Buy a metered resource',
    body: 'Call an API that charges per request over x402 and pay for it. Quote first, against a ceiling you set.',
  },
] as const

/** The published package. Deliberately no version number: the registry moves,
 *  and a figure written beside a thing that moves is wrong by the next
 *  release. `npm view leash-agentpay version` is the answer that is true when
 *  it is read. */
const NPM = 'https://www.npmjs.com/package/leash-agentpay'
const SETUP_GUIDE = 'https://github.com/hms1499/leash/blob/main/docs/mcp-setup.md'

/** Same treatment SiteFooter gives an outbound link: named destination at the
 *  data step, and `tap-tall` for the 44px floor e2e/reach.spec.ts measures. */
const OUTBOUND = 'motion-press control-text tap-tall focus-ring'
const OUTBOUND_STYLE: React.CSSProperties = {
  ...DATA,
  borderRadius: 'var(--r-mark)',
  color: 'var(--dim)',
  outlineColor: 'var(--text)',
}

export default function AgentTools() {
  return (
    <div className="flex flex-col gap-6">
      <Panel className="p-6">
        <Label>Published on npm</Label>
        {/* The command, not a description of the command. This is the line a
            reader copies, and it is the one fact the rebuilt homepage had
            dropped entirely. */}
        {/* DATA, not the browser's own <pre> size. A bare <pre> draws 16px
            mono 400, which is no step on the scale, and e2e/faces.spec.ts
            caught exactly that the first time this shipped. It is the same
            step globals.css gives <code>, for the same reason. §2. */}
        <pre
          className="num mt-3 p-3 overflow-x-auto"
          style={{ ...DATA, background: 'var(--well)', borderRadius: 'var(--r-box)', color: 'var(--text)' }}
        >
          npx -y leash-agentpay
        </pre>
        <p className="mt-3" style={{ ...PROSE, color: 'var(--dim)' }}>
          Node.js 20 or newer, and any MCP client — Claude Code, Cursor and Codex
          all speak it. The server is stdio MCP and nothing else, so naming one
          client would turn away the rest for no reason.
        </p>
      </Panel>

      <div className={GRID}>
        {TOOLS.map((tool) => (
          <Panel key={tool.name} className="col-span-12 flex h-full flex-col p-6 md:col-span-6 lg:col-span-4">
            {/* --celo and the mono step, the way LiveProof sets an address:
                these are identifiers a reader will type, not prose. */}
            <p className="num" style={{ ...DATA, color: 'var(--celo)' }}>{tool.name}</p>
            <h3 className="mt-3" style={{ ...SUBHEAD, color: 'var(--text)' }}>{tool.title}</h3>
            <p className="mt-2" style={{ ...PROSE, color: 'var(--dim)' }}>{tool.body}</p>
          </Panel>
        ))}
      </div>

      <Panel className="p-6">
        <p style={{ ...PROSE, color: 'var(--dim)' }}>
          That is the whole surface. Nothing here raises a limit, moves the money
          out, or authorises another agent — those live on the contract, behind
          the owner&apos;s key.
        </p>
        <div className="mt-6 flex flex-wrap gap-6">
          <ActionLink href="/setup">Create an account and connect one</ActionLink>
          <a href={SETUP_GUIDE} target="_blank" rel="noreferrer" className={OUTBOUND} style={OUTBOUND_STYLE}>
            Setup guide ↗
          </a>
          <a href={NPM} target="_blank" rel="noreferrer" className={OUTBOUND} style={OUTBOUND_STYLE}>
            Package on npm ↗
          </a>
        </div>
      </Panel>
    </div>
  )
}
