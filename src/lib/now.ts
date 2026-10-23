/**
 * Server-side clock boundary.
 *
 * Keeping `Date.now()` in one non-component module is what lets Server
 * Components compare timestamps without tripping the React purity lint, which
 * treats a clock read during render as a non-idempotent operation.
 */
export function nowMs(): number {
  return Date.now();
}
