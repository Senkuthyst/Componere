# Tempo escrow contract

`MilestoneEscrow.sol` is the Tempo/EVM implementation boundary. It uses OpenZeppelin `SafeERC20` and `ReentrancyGuard`, requires the client to fund before approvals, prevents duplicate releases, and permits refunds only after expiry. Deployments must be configured with a verified TIP-20 token and recorded in environment configuration; no contract address is invented here.

The current official Moderato network configuration is chain ID `42431`, RPC `https://rpc.moderato.tempo.xyz`, and explorer `https://explore.testnet.tempo.xyz`.