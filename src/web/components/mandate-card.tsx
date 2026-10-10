import type { Mandate } from '../../core/types'

export function MandateCard({ mandate }: { mandate: Mandate }) {
  return <article><span>Ephemeral mandate</span><strong>{mandate.limit.toString()} base units</strong><small>{mandate.expiry} / period {mandate.period}</small></article>
}