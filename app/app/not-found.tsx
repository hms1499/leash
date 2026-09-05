import Shell from '../components/ui/Shell'

export default function NotFound() {
  return (
    <Shell title="That page does not exist.">
      <p>
        An account dashboard lives at <code>/a/</code> followed by its address.
      </p>
    </Shell>
  )
}
