import { explorerTransactionUrl, solanaClusters, validateSolanaUsdc, type AgreementEscrow, type ChainTransaction, type EscrowAdapter } from './index'

export type SolanaInstructionSender = (instruction: { action: 'create' | 'fund' | 'approve' | 'release' | 'refund'; escrow: AgreementEscrow; milestoneIndex?: number }) => Promise<{ signature: string; confirmed: boolean }>
export class SolanaEscrowAdapter implements EscrowAdapter {
  constructor(private readonly cluster: 'devnet' | 'mainnet', private readonly sendInstruction: SolanaInstructionSender) {}
  async create(agreementId: string, tokenAddress: string, amountBaseUnits: bigint, milestoneCount: number) { validateSolanaUsdc(this.cluster, tokenAddress); const result = await this.sendInstruction({ action: 'create', escrow: { agreementId, chain: solanaClusters[this.cluster].id, escrowAddress: 'unassigned', tokenAddress, tokenDecimals: 6, totalAmountBaseUnits: amountBaseUnits, releasedAmountBaseUnits: 0n, status: 'draft', milestoneCount } }); return { escrow: { agreementId, chain: solanaClusters[this.cluster].id, escrowAddress: 'program-derived-address', tokenAddress, tokenDecimals: 6, totalAmountBaseUnits: amountBaseUnits, releasedAmountBaseUnits: 0n, status: 'created', milestoneCount }, transaction: this.tx(result.signature, result.confirmed) } }
  async fund(escrow: AgreementEscrow) { return this.action('fund', escrow) }
  async approveMilestone(escrow: AgreementEscrow, milestoneIndex: number) { return this.action('approve', escrow, milestoneIndex) }
  async releaseMilestone(escrow: AgreementEscrow, milestoneIndex: number) { return this.action('release', escrow, milestoneIndex) }
  async refund(escrow: AgreementEscrow) { return this.action('refund', escrow) }
  private async action(action: 'fund' | 'approve' | 'release' | 'refund', escrow: AgreementEscrow, milestoneIndex?: number) { const result = await this.sendInstruction({ action, escrow, milestoneIndex }); return this.tx(result.signature, result.confirmed) }
  private tx(signature: string, confirmed: boolean): ChainTransaction { return { chain: solanaClusters[this.cluster].id, signature, status: confirmed ? 'confirmed' : 'pending', explorerUrl: explorerTransactionUrl(solanaClusters[this.cluster].id, signature), confirmationSemantics: 'solana_commitment' } }
}