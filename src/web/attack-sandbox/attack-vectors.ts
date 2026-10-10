import { ACCESS_KEY_ERRORS } from '../../chain/verifier'

export type AttackVector = 'recipient' | 'budget' | 'replay'
export type AttackResult = { vector: AttackVector; reverted: true; error: string }

export function simulateBoundedAttack(vector: AttackVector): AttackResult {
  const errors = { recipient: ACCESS_KEY_ERRORS.recipient, budget: ACCESS_KEY_ERRORS.budget, replay: ACCESS_KEY_ERRORS.replay }
  return { vector, reverted: true, error: errors[vector] }
}