/** Opaque, URL-safe share tokens (64 hex chars, ~256 bits). */
export function generateShareToken(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
}
