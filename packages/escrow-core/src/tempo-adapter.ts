import { type Address, type PublicClient, type WalletClient, getAddress } from 'viem'
import { explorerTransactionUrl, tempoModerato, validateTempoToken, type AgreementEscrow, type ChainTransaction, type EscrowAdapter } from './index'

const escrowAbi = [
  { type: 'function', name: 'fund', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'approveMilestone', stateMutability: 'nonpayable', inputs: [{ name: 'index', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'releaseMilestone', stateMutability: 'nonpayable', inputs: [{ name: 'index', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'refund', stateMutability: 'nonpayable', inputs: [], outputs: [] }
] as const

export class TempoEscrowAdapter implements EscrowAdapter {
  constructor(private readonly publicClient: PublicClient, private readonly walletClient: WalletClient, private readonly escrowAddress: Address, private readonly account: Address) {}
  async create(): Promise<never> { throw new Error('Tempo escrow deployment is a separate audited deployment step; configure TEMPO_ESCROW_ADDRESS before funding') }
  async fund(escrow: AgreementEscrow) { validateTempoToken(escrow.tokenAddress, escrow.tokenDecimals); return this.write(escrow, 'fund', []) }
  async approveMilestone(escrow: AgreementEscrow, milestoneIndex: number) { return this.write(escrow, 'approveMilestone', [BigInt(milestoneIndex)]) }
  async releaseMilestone(escrow: AgreementEscrow, milestoneIndex: number) { return this.write(escrow, 'releaseMilestone', [BigInt(milestoneIndex)]) }
  async refund(escrow: AgreementEscrow) { return this.write(escrow, 'refund', []) }
  private async write(escrow: AgreementEscrow, functionName: 'fund' | 'approveMilestone' | 'releaseMilestone' | 'refund', args: readonly unknown[]): Promise<ChainTransaction> { const hash = await this.walletClient.writeContract({ address: getAddress(this.escrowAddress), abi: escrowAbi, functionName, args, account: this.account, chain: tempoModerato as never }); const receipt = await this.publicClient.waitForTransactionReceipt({ hash }); const status = receipt.status === 'success' ? 'confirmed' : 'failed'; return { chain: 'tempo-moderato', signature: hash, status, explorerUrl: explorerTransactionUrl('tempo-moderato', hash), confirmationSemantics: 'evm_receipt' } }
}