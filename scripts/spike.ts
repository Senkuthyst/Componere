import { decodeAbiParameters, getAddress, parseUnits } from 'viem'
import { http } from 'viem'
import { tempoModerato } from 'viem/chains'
import { Account, Actions, P256, createClient } from 'viem/tempo'

const ALPHA_USD = '0x20c0000000000000000000000000000000000001' as const
const TRANSFER_WITH_MEMO_SELECTOR = '0x95777d59' as const
const TRANSFER_WITH_MEMO_SIGNATURE = 'transferWithMemo(address,uint256,bytes32)' as const
const BUDGET = parseUnits('10', 6)
const VALID_AMOUNT = parseUnits('1', 6)
const RPC_URL = process.env.TEMPO_RPC_URL ?? 'https://rpc.moderato.tempo.xyz'

type Check = { name: string; passed: boolean; detail: string }

function requiredAddress(name: string): `0x${string}` {
  const value = process.env[name]
  if (!value) throw new Error(`Set ${name} to a testnet address`)
  return getAddress(value)
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function expectRejected(name: string, operation: () => Promise<unknown>): Promise<Check> {
  try {
    const result = await operation()
    return { name, passed: false, detail: `unexpected success: ${JSON.stringify(result, (_, value) => typeof value === 'bigint' ? value.toString() : value)}` }
  } catch (error) {
    const detail = errorText(error)
    console.log(`${name}: rejected by chain\n  ${detail}`)
    return { name, passed: true, detail }
  }
}

function printTable(checks: Check[]) {
  console.log('\nStage 1 PASS/FAIL')
  console.table(checks.map(({ name, passed, detail }) => ({ check: name, result: passed ? 'PASS' : 'FAIL', detail })))
}

async function main() {
  const privateKey = process.env.TEMPO_ROOT_PRIVATE_KEY
  if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    const check = { name: 'root account and recipient configuration', passed: false, detail: 'Set TEMPO_ROOT_PRIVATE_KEY and TEMPO_RECIPIENT; no chain calls were attempted.' }
    printTable([check])
    console.error('\nPlan B: if the gate cannot run, the backend can sign transferWithMemo directly with the decision hash in the memo; enforcement must be labeled app-level.')
    process.exitCode = 1
    return
  }

  const recipient = requiredAddress('TEMPO_RECIPIENT')
  const wrongRecipient = getAddress(process.env.TEMPO_WRONG_RECIPIENT ?? '0x0000000000000000000000000000000000000002')
  const root = Account.fromSecp256k1(privateKey as `0x${string}`)
  const accessKey = Account.fromP256(P256.randomPrivateKey(), { access: root })
  // The documented Tempo decorator exposes these methods, but current viem's
  // generic client type does not preserve the decorated account intersection.
  const rootClient = createClient({ account: root, chain: tempoModerato, transport: http(RPC_URL), feeToken: ALPHA_USD }) as any
  const accessClient = createClient({ account: accessKey, chain: tempoModerato, transport: http(RPC_URL), feeToken: ALPHA_USD }) as any
  const transferSync = Actions.token.transferSync as any
  const checks: Check[] = []

  let before: bigint
  let after: bigint
  let memo: `0x${string}`

  try {
    const authorization = await rootClient.accessKey.authorizeSync({
      accessKey,
      expiry: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      limits: [{ token: ALPHA_USD, limit: BUDGET, period: 0 }],
      scopes: [{ address: ALPHA_USD, selector: TRANSFER_WITH_MEMO_SIGNATURE, recipients: [recipient] }]
    })
    console.log(`authorized access key ${accessKey.accessKeyAddress} with tx ${authorization.receipt.transactionHash}`)
    checks.push({ name: `authorize P-256 key, 24h / 10 AlphaUSD / selector ${TRANSFER_WITH_MEMO_SELECTOR}`, passed: authorization.receipt.status === 'success', detail: authorization.receipt.transactionHash })

    before = (await rootClient.accessKey.getRemainingLimit({ accessKey, token: ALPHA_USD })).remaining
    console.log(`remaining before: ${before}`)
    memo = `0x${'11'.repeat(32)}`
    const transfer = await transferSync(accessClient, { token: ALPHA_USD, to: recipient, amount: VALID_AMOUNT, memo })
    const decodedMemo = decodeAbiParameters([{ type: 'bytes32' }], memo)[0]
    console.log(`valid transfer tx: ${transfer.receipt.transactionHash}`)
    console.log(`decoded memo: ${decodedMemo}`)
    checks.push({ name: 'valid transferWithMemo succeeds and memo decodes', passed: transfer.receipt.status === 'success' && decodedMemo === memo, detail: transfer.receipt.transactionHash })

    after = (await rootClient.accessKey.getRemainingLimit({ accessKey, token: ALPHA_USD })).remaining
    console.log(`remaining after: ${after}`)
    checks.push({ name: 'remaining limit decreases by one transfer', passed: after === before - VALID_AMOUNT, detail: `${before} -> ${after}` })

    checks.push(await expectRejected('wrong recipient', () => transferSync(accessClient, { token: ALPHA_USD, to: wrongRecipient, amount: VALID_AMOUNT, memo })))
    checks.push(await expectRejected('over remaining budget', () => transferSync(accessClient, { token: ALPHA_USD, to: recipient, amount: after + 1n, memo })))

    await rootClient.accessKey.revokeSync({ accessKey })
    const metadata = await rootClient.accessKey.getMetadata({ accessKey })
    checks.push({ name: 'root revokes access key', passed: metadata.isRevoked, detail: `isRevoked=${metadata.isRevoked}` })
    checks.push(await expectRejected('use after revokeSync', () => transferSync(accessClient, { token: ALPHA_USD, to: recipient, amount: VALID_AMOUNT, memo })))
  } catch (error) {
    checks.push({ name: 'Stage 1 chain execution', passed: false, detail: errorText(error) })
    console.error(`Stage 1 chain execution failed: ${errorText(error)}`)
  }

  printTable(checks)
  if (checks.some(({ passed }) => !passed)) {
    console.error('\nPlan B: the backend can sign transferWithMemo directly with the decision hash in the memo; enforcement must be labeled app-level.')
    process.exitCode = 1
  }
}

void main().catch((error) => {
  console.error(errorText(error))
  process.exitCode = 1
})