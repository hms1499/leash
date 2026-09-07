import { isValidAddress } from './address.js'

export type SavedPolicyAccount = {
  address: `0x${string}`
  deployBlock?: string
  label?: string
  addedAt: number
}

export const ACCOUNT_REGISTRY_CHANGED = 'leash:accounts-changed'

function registryKey(owner: string): string {
  return `leash.accounts.${owner.toLowerCase()}`
}

function cleanLabel(label: string | undefined): string | undefined {
  const value = label?.trim().slice(0, 48)
  return value || undefined
}

function isSavedAccount(value: unknown): value is SavedPolicyAccount {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<SavedPolicyAccount>
  return Boolean(
    typeof item.address === 'string' && isValidAddress(item.address) &&
    typeof item.addedAt === 'number' && Number.isFinite(item.addedAt) &&
    (item.deployBlock === undefined || /^\d+$/.test(item.deployBlock)) &&
    (item.label === undefined || typeof item.label === 'string'),
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
    })
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
    label: cleanLabel(account.label ?? previous?.label),
  }
  const next = index >= 0
    ? current.map((item, i) => i === index ? nextItem : item)
    : [...current, nextItem]
  storage.setItem(registryKey(owner), JSON.stringify(next))
  return next
}

export function updatePolicyAccountLabel(
  storage: Storage,
  owner: string,
  address: string,
  label: string,
): SavedPolicyAccount[] {
  const next = listPolicyAccounts(storage, owner).map((item) =>
    item.address.toLowerCase() === address.toLowerCase()
      ? { ...item, label: cleanLabel(label) }
      : item,
  )
  storage.setItem(registryKey(owner), JSON.stringify(next))
  return next
}

export function forgetPolicyAccount(
  storage: Storage,
  owner: string,
  address: string,
): SavedPolicyAccount[] {
  const next = listPolicyAccounts(storage, owner)
    .filter((item) => item.address.toLowerCase() !== address.toLowerCase())
  storage.setItem(registryKey(owner), JSON.stringify(next))
  return next
}

export function selectPolicyAccount(storage: Storage, owner: string, address: string): void {
  const account = listPolicyAccounts(storage, owner)
    .find((item) => item.address.toLowerCase() === address.toLowerCase())
  if (!account) return
  storage.setItem('leash.account', account.address)
  storage.setItem('leash.accountOwner', owner)
  if (account.deployBlock) storage.setItem('leash.deployBlock', account.deployBlock)
  else storage.removeItem('leash.deployBlock')
}

/** Moves the pre-multi-account singleton into the owner's registry once. */
export function migrateLegacyAccount(storage: Storage, owner: string): SavedPolicyAccount[] {
  const address = storage.getItem('leash.account')
  const savedOwner = storage.getItem('leash.accountOwner')
  if (!address || !isValidAddress(address) || !savedOwner || savedOwner.toLowerCase() !== owner.toLowerCase()) {
    return listPolicyAccounts(storage, owner)
  }
  const deployBlock = storage.getItem('leash.deployBlock') ?? undefined
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
