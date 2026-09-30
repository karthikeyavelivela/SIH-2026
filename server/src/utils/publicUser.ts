// NOTE: this strip is load-bearing, not redundant. `select: false` on the
// User schema only hides passwordHash from query results — it does NOT hide
// it on a document just returned by `.create()`, nor after an explicit
// `.select('+passwordHash')` (as login does). Any handler that returns a
// User document to the client must route it through this function first.
export function publicUser(user: { toObject: () => Record<string, unknown> }) {
  const obj = user.toObject();
  delete obj.passwordHash;
  // Fraud-detection-only (fraudDetection.service.ts's rapid-account-creation
  // detector) — never returned to the user themself or any non-admin caller.
  delete obj.signupIp;

  /*
   * An avatar that was never actually stored.
   *
   * Before the photo endpoint learned to refuse a mocked upload, it saved
   * the deterministic fake URL the upload service returns when Cloudinary
   * is not configured. Those rows exist, and every screen that renders one
   * shows a broken image the person cannot clear.
   *
   * Stripped here, at the read boundary, rather than migrated: it fixes
   * every existing row on the next request without a data change, and it
   * keeps working if a mocked upload ever slips through again. The field
   * simply reads as absent, which every avatar component already handles
   * by falling back to the initial.
   */
  if (typeof obj.profilePhoto === 'string' && obj.profilePhoto.startsWith('https://mock.cloudinary.local/')) {
    delete obj.profilePhoto;
  }

  // pendingPhoneChange.otpHash is exactly as sensitive as passwordHash —
  // never leaves the server. newPhone/expiresAt/attempts are fine (a
  // client needs to know a change is pending and when it expires).
  // KYC documents: never a URL. Private ones have none worth sending, and a
  // legacy public URL is the exact leak the private storage exists to stop.
  // The client asks GET /api/kyc/documents/:id/url for a short-lived link.
  if (Array.isArray(obj.kycDocs)) {
    obj.kycDocs = (obj.kycDocs as Record<string, unknown>[]).map((d) => publicKycDoc(d));
  }

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

/** A KYC document as any client may see it: status and metadata, no location. */
export function publicKycDoc(doc: Record<string, unknown>): Record<string, unknown> {
  const { url: _url, publicId: _publicId, format: _format, ...rest } = doc;
  return { ...rest, viewable: true };
}
