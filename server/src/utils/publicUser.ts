// NOTE: this strip is load-bearing, not redundant. `select: false` on the
// User schema only hides passwordHash from query results — it does NOT hide
// it on a document just returned by `.create()`, nor after an explicit
// `.select('+passwordHash')` (as login does). Any handler that returns a
// User document to the client must route it through this function first.
export function publicUser(user: { toObject: () => Record<string, unknown> }) {
  const obj = user.toObject();
  delete obj.passwordHash;

  // pendingPhoneChange.otpHash is exactly as sensitive as passwordHash —
  // never leaves the server. newPhone/expiresAt/attempts are fine (a
  // client needs to know a change is pending and when it expires).
  const pending = obj.pendingPhoneChange as Record<string, unknown> | undefined;
  if (pending) delete pending.otpHash;

  // Bank account number / UPI ID: mask all but the last 4 characters — a
  // profile page needs to show "which one is on file" (Phase 2's own
  // requirement: "mask all but last 4 digits"), never the full value back
  // out over the wire once it's saved.
  const payout = obj.payoutDetails as Record<string, unknown> | undefined;
  if (payout) {
    if (typeof payout.bankAccountNumber === 'string') {
      payout.bankAccountNumber = maskTail(payout.bankAccountNumber);
    }
    if (typeof payout.upiId === 'string') {
      payout.upiId = maskTail(payout.upiId);
    }
  }

  return obj;
}

function maskTail(value: string): string {
  if (value.length <= 4) return '•'.repeat(value.length);
  return '•'.repeat(value.length - 4) + value.slice(-4);
}
