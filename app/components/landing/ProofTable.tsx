import Panel from '../ui/Panel'
import { PROOFS, shortHash } from '../../lib/proofs.js'

export default function ProofTable() {
  return (
    <Panel>
      {PROOFS.map((p, i) => (
        <div
          key={`${p.url}-${i}`}
          className="p-6 flex flex-col gap-2"
          style={{ borderTop: i === 0 ? 'none' : '1px solid var(--line)' }}
        >
          <span className="text-sm" style={{ color: 'var(--text)', fontWeight: 600 }}>
            {p.claim}
          </span>
          <span className="text-sm" style={{ color: 'var(--dim)' }}>{p.detail}</span>
          <a
            className="num text-xs mt-2 break-all"
            style={{ color: 'var(--celo)' }}
            href={p.url}
            target="_blank"
            rel="noreferrer"
          >
            {shortHash(p.url)} ↗
          </a>
        </div>
      ))}
    </Panel>
  )
}
