import { createHash } from 'node:crypto'
import { InvoiceSchema, type Invoice } from './types'

type CanonicalValue = string | number | boolean | null | CanonicalValue[] | { [key: string]: CanonicalValue }
function normalize(value: unknown): CanonicalValue {
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(normalize)
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, nested]) => [key, normalize(nested)]))
  return value as CanonicalValue
}
export function canonicalInvoiceJson(invoice: Invoice): string { return JSON.stringify(normalize(InvoiceSchema.parse(invoice))) }
export function decisionHash(invoice: Invoice): `0x${string}` { return `0x${createHash('sha256').update(canonicalInvoiceJson(invoice), 'utf8').digest('hex')}` }