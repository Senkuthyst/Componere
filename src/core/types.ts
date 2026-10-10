import { z } from 'zod'

export const AddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/)
export const Hex32Schema = z.string().regex(/^0x[a-fA-F0-9]{64}$/)
export const InvoiceSchema = z.object({
  invoiceId: z.string().min(1), vendorAddress: AddressSchema, tokenAddress: AddressSchema,
  amountBaseUnits: z.bigint().positive(), currency: z.string().min(1), dueDate: z.string().datetime({ offset: true }),
  lineItems: z.array(z.object({ description: z.string().min(1), quantity: z.number().positive(), unitAmountBaseUnits: z.bigint().nonnegative() })).min(1),
  policyQuorum: z.object({ required: z.number().int().positive(), approved: z.number().int().nonnegative() })
})
export type Invoice = z.infer<typeof InvoiceSchema>
export const MandateSchema = z.object({ recipient: AddressSchema, token: AddressSchema, limit: z.bigint().positive(), period: z.literal(0), expiry: z.number().int().positive(), selector: z.literal('transferWithMemo(address,uint256,bytes32)'), decisionHash: Hex32Schema })
export type Mandate = z.infer<typeof MandateSchema>
export type PolicyDecision = { approved: boolean; reason: 'QUORUM_MET' | 'QUORUM_NOT_MET' | 'AMOUNT_EXCEEDS_LIMIT' | 'RECIPIENT_SCOPE_MISMATCH' | 'MANDATE_EXPIRED'; decisionHash: `0x${string}` }
export const DEFAULT_RECIPIENT = '0x71C83893693fE31206cD394541703274FaF79B64' as const
export const DEFAULT_BUDGET_BASE_UNITS = 4_500_000_000n
export const MANDATE_DURATION_SECONDS = 300
export const TRANSFER_WITH_MEMO_SELECTOR = 'transferWithMemo(address,uint256,bytes32)' as const