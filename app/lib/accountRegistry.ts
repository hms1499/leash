import { isValidAddress } from './address.js'

export type SavedPolicyAccount = {
  address: `0x${string}`
  deployBlock?: string
  addedAt: number
}

export const ACCOUNT_REGISTRY_CHANGED = 'leash:accounts-changed'

function registryKey(owner: string): string {
  return `leash.accounts.${owner.toLowerCase()}`
}

/**
 * Writes that cannot take their caller down.
 *
 * listPolicyAccounts already guarded its read; the writes did not, and they
 * run inside callers whose catch belongs to a transaction. deploy() calls
 * savePolicyAccount after it has read the receipt and checked its status, so a
 * storage throw there produced "Sent as 0x… The chain has not confirmed it
 * yet" about a deployment that had demonstrably confirmed. See
 * lib/browserStorage.ts for the same reasoning at the other call sites.
 */
function persist(storage: Storage, key: string, value: string): void {
  try { storage.setItem(key, value) } catch { /* the chain is the record */ }
}

function forget(storage: Storage, key: string): void {
  try { storage.removeItem(key) } catch { /* see persist */ }
}

function isSavedAccount(value: unknown): value is SavedPolicyAccount {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<SavedPolicyAccount>
  return Boolean(
    typeof item.address === 'string' && isValidAddress(item.address) &&
    typeof item.addedAt === 'number' && Number.isFinite(item.addedAt) &&
    (item.deployBlock === undefined || /^\d+$/.test(item.deployBlock)),
  )
}

export function listPolicyAccounts(storage: Storage, owner: string): SavedPolicyAccount[] {
  try {
    const raw = storage.getItem(registryKey(owner))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const seen = new Set<string>()
    return parsed.filter(isSavedAccount).filter((item) => {
      const key = item.address.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).map((item) => ({
      // Build a new object so obsolete fields from an older registry schema,
      // such as the removed local label, do not remain part of app state.
      address: item.address,
      deployBlock: item.deployBlock,
      addedAt: item.addedAt,
    }))
  } catch {
    return []
  }
}

export function savePolicyAccount(
  storage: Storage,
  owner: string,
  account: Omit<SavedPolicyAccount, 'addedAt'> & { addedAt?: number },
): SavedPolicyAccount[] {
  const current = listPolicyAccounts(storage, owner)
  const index = current.findIndex((item) => item.address.toLowerCase() === account.address.toLowerCase())
  const previous = index >= 0 ? current[index] : undefined
  const nextItem: SavedPolicyAccount = {
    address: account.address,
    addedAt: previous?.addedAt ?? account.addedAt ?? Date.now(),
    deployBlock: account.deployBlock ?? previous?.deployBlock,
  }
  const next = index >= 0
    ? current.map((item, i) => i === index ? nextItem : item)
    : [...current, nextItem]
  persist(storage, registryKey(owner), JSON.stringify(next))
  return next
}

export function forgetPolicyAccount(
  storage: Storage,
  owner: string,
  address: string,
): SavedPolicyAccount[] {
  const next = listPolicyAccounts(storage, owner)
    .filter((item) => item.address.toLowerCase() !== address.toLowerCase())
  persist(storage, registryKey(owner), JSON.stringify(next))
  return next
}

export function selectPolicyAccount(storage: Storage, owner: string, address: string): void {
  const account = listPolicyAccounts(storage, owner)
    .find((item) => item.address.toLowerCase() === address.toLowerCase())
  if (!account) return
  persist(storage, 'leash.account', account.address)
  persist(storage, 'leash.accountOwner', owner)
  if (account.deployBlock) persist(storage, 'leash.deployBlock', account.deployBlock)
  else forget(storage, 'leash.deployBlock')
}

/** Moves the pre-multi-account singleton into the owner's registry once. */
export function migrateLegacyAccount(storage: Storage, owner: string): SavedPolicyAccount[] {
  let address: string | null = null
  let savedOwner: string | null = null
  let deployBlockRaw: string | null = null
  try {
    address = storage.getItem('leash.account')
    savedOwner = storage.getItem('leash.accountOwner')
    deployBlockRaw = storage.getItem('leash.deployBlock')
  } catch {
    // Blocked storage has nothing to migrate, and this runs inside effects
    // whose failure would otherwise read as an unexplained blank page.
    return []
  }
  if (!address || !isValidAddress(address) || !savedOwner || savedOwner.toLowerCase() !== owner.toLowerCase()) {
    return listPolicyAccounts(storage, owner)
  }
  const deployBlock = deployBlockRaw ?? undefined
  return savePolicyAccount(storage, owner, {
    address,
    deployBlock: deployBlock && /^\d+$/.test(deployBlock) ? deployBlock : undefined,
  })
}

export function accountDeployBlock(
  storage: Storage,
  owner: string | undefined,
  address: string,
): bigint | undefined {
  if (!owner) return undefined
  const saved = listPolicyAccounts(storage, owner)
    .find((item) => item.address.toLowerCase() === address.toLowerCase())
  return saved?.deployBlock && /^\d+$/.test(saved.deployBlock)
    ? BigInt(saved.deployBlock)
    : undefined
}

export function announceAccountRegistryChange(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ACCOUNT_REGISTRY_CHANGED))
}
