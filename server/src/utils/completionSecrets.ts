/**
 * Removes the completion-code hash and cipher from a booking before it is
 * sent anywhere. Both fields are select:false, so a normal query never
 * loads them — but a document that just had a code assigned carries them
 * in memory, and serialising that to the worker would leak the customer's
 * code.
 */
export function stripCompletionSecrets<T extends { toObject?: () => Record<string, unknown> }>(booking: T): Record<string, unknown> {
  const obj = typeof booking.toObject === 'function' ? booking.toObject() : ({ ...booking } as Record<string, unknown>);
  delete obj.completionCodeHash;
  delete obj.completionCodeCipher;
  return obj;
}
