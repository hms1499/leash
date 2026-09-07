import AccountsPage from '../../components/AccountsPage'

// Wallet state is browser-owned. Avoid asking the production build to render
// this owner-specific page without the live provider tree.
export const dynamic = 'force-dynamic'

export default function AccountsRoute() {
  return <AccountsPage />
}
