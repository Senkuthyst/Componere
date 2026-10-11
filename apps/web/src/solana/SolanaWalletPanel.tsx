import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useEffect, useMemo, useState } from 'react'

const shortAddress = (value: string) => `${value.slice(0, 4)}...${value.slice(-4)}`

export function SolanaWalletPanel() {
  const { publicKey, connected, connecting, wallet, select, connect, disconnect } = useWallet()
  const { connection } = useConnection()
  const [balance, setBalance] = useState<number | null>(null)

  useEffect(() => {
    if (!publicKey) {
      setBalance(null)
      return
    }

    let cancelled = false
    void connection.getBalance(publicKey).then((value) => {
      if (!cancelled) {
        setBalance(value / LAMPORTS_PER_SOL)
      }
    }).catch(() => {
      if (!cancelled) {
        setBalance(null)
      }
    })

    return () => {
      cancelled = true
    }
  }, [connection, publicKey])

  const activeNetwork = useMemo(() => 'Devnet', [])
  const networkMismatch = useMemo(() => {
    return !connected || !connection.rpcEndpoint.includes('devnet')
  }, [connection.rpcEndpoint, connected])

  const handleConnect = async () => {
    if (wallet) {
      await connect()
      return
    }

    select('Phantom')
  }

  return (
    <div className="solana-wallet-panel">
      <div className="solana-wallet-main">
        <span className={`online-dot ${connected ? 'connected' : ''}`} />
        <div>
          <small>Solana network</small>
          <strong>{activeNetwork}</strong>
        </div>
      </div>

      <div className="solana-wallet-meta">
        {connected && publicKey ? (
          <>
            <span className="wallet-key">{shortAddress(publicKey.toBase58())}</span>
            <span className="wallet-balance">{balance === null ? 'Checking balance…' : `${balance.toFixed(3)} SOL`}</span>
          </>
        ) : (
          <span className="wallet-key">Wallet disconnected</span>
        )}
      </div>

      {networkMismatch && connected && (
        <div className="solana-network-warning">
          Wrong network: switch to Devnet before funding or releasing escrow.
        </div>
      )}

      <button
        className={`wallet-button ${connected ? 'wallet-connected' : ''}`}
        onClick={() => {
          if (connected) {
            void disconnect()
            return
          }
          void handleConnect()
        }}
        disabled={connecting}
      >
        {connecting ? 'Connecting…' : connected ? 'Disconnect wallet' : 'Connect wallet'}
      </button>
    </div>
  )
}
