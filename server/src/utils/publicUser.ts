// NOTE: this strip is load-bearing, not redundant. `select: false` on the
// User schema only hides passwordHash from query results — it does NOT hide
// it on a document just returned by `.create()`, nor after an explicit
// `.select('+passwordHash')` (as login does). Any handler that returns a
// User document to the client must route it through this function first.
export function publicUser(user: { toObject: () => Record<string, unknown> }) {
  const obj = user.toObject();
  delete obj.passwordHash;
  return obj;
}
