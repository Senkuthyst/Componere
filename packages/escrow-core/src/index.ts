import { getAddress } from 'viem'

export type ChainId = 'tempo-moderato' | 'solana-devnet' | 'solana-mainnet'
export type EscrowStatus = 'draft' | 'created' | 'funded' | 'milestone_submitted' | 'milestone_approved' | 'released' | 'refunded' | 'failed'
export type NormalizedTransactionStatus = 'idle' | 'pending' | 'confirmed' | 'failed'
export type AgreementEscrow = { agreementId: string; chain: ChainId; escrowAddress: string; tokenAddress: string; tokenDecimals: number; totalAmountBaseUnits: bigint; releasedAmountBaseUnits: bigint; status: EscrowStatus; milestoneCount: number }
export type ChainTransaction = { chain: ChainId; signature: string; status: NormalizedTransactionStatus; explorerUrl?: string; confirmationSemantics: 'evm_receipt' | 'solana_commitment' }
export type EscrowAdapter = { create(agreementId: string, tokenAddress: string, amountBaseUnits: bigint, milestoneCount: number): Promise<{ escrow: AgreementEscrow; transaction: ChainTransaction }>; fund(escrow: AgreementEscrow): Promise<ChainTransaction>; approveMilestone(escrow: AgreementEscrow, milestoneIndex: number): Promise<ChainTransaction>; releaseMilestone(escrow: AgreementEscrow, milestoneIndex: number): Promise<ChainTransaction>; refund(escrow: AgreementEscrow): Promise<ChainTransaction> }

export const tempoModerato = { id: 'tempo-moderato' as const, chainId: 42431, rpcUrl: 'https://rpc.moderato.tempo.xyz', explorerUrl: 'https://explore.testnet.tempo.xyz', tokens: { alphaUsd: { address: '0x20c0000000000000000000000000000000000001', decimals: 6 } } }
export const solanaClusters = { devnet: { id: 'solana-devnet' as const, rpcUrl: 'https://api.devnet.solana.com', explorerUrl: 'https://explorer.solana.com', usdcMint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', tokenDecimals: 6 }, mainnet: { id: 'solana-mainnet' as const, rpcUrl: 'https://api.mainnet-beta.solana.com', explorerUrl: 'https://explorer.solana.com', usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', tokenDecimals: 6 } }

export function validateTempoToken(tokenAddress: string, decimals: number): void { if (getAddress(tokenAddress) !== getAddress(tempoModerato.tokens.alphaUsd.address) || decimals !== tempoModerato.tokens.alphaUsd.decimals) throw new Error('Token is not a verified AlphaUSD TIP-20 token on Tempo Moderato') }
export function validateSolanaUsdc(cluster: 'devnet' | 'mainnet', mint: string): void { if (mint !== solanaClusters[cluster].usdcMint) throw new Error(`Mint is not the verified USDC mint for Solana ${cluster}`) }
export function explorerTransactionUrl(chain: ChainId, signature: string): string { if (chain === 'tempo-moderato') return `${tempoModerato.explorerUrl}/tx/${signature}`; const cluster = chain === 'solana-devnet' ? '?cluster=devnet' : ''; return `${solanaClusters[chain === 'solana-devnet' ? 'devnet' : 'mainnet'].explorerUrl}/tx/${signature}${cluster}` }

export class MockEscrowAdapter implements EscrowAdapter {
  private sequence = 0
  async create(agreementId: string, tokenAddress: string, amountBaseUnits: bigint, milestoneCount: number) { return { escrow: { agreementId, chain: 'tempo-moderato', escrowAddress: `0x${(++this.sequence).toString(16).padStart(40, '0')}`, tokenAddress, tokenDecimals: 6, totalAmountBaseUnits: amountBaseUnits, releasedAmountBaseUnits: 0n, status: 'created', milestoneCount }, transaction: this.tx('0xcreate') } }
  async fund(escrow: AgreementEscrow) { escrow.status = 'funded'; return this.tx('0xfund') }
  async approveMilestone(escrow: AgreementEscrow) { if (escrow.status !== 'funded' && escrow.status !== 'milestone_submitted') throw new Error('Milestone approval requires funded escrow'); escrow.status = 'milestone_approved'; return this.tx('0xapprove') }
  async releaseMilestone(escrow: AgreementEscrow) { if (escrow.status !== 'milestone_approved') throw new Error('Milestone release requires authorized approval'); escrow.status = 'released'; return this.tx('0xrelease') }
  async refund(escrow: AgreementEscrow) { if (escrow.status === 'released') throw new Error('Released escrow cannot be refunded'); escrow.status = 'refunded'; return this.tx('0xrefund') }
  private tx(signature: string): ChainTransaction { return { chain: 'tempo-moderato', signature: `${signature}${this.sequence.toString(16).padStart(60, '0')}`, status: 'confirmed', explorerUrl: explorerTransactionUrl('tempo-moderato', signature), confirmationSemantics: 'evm_receipt' } }
}