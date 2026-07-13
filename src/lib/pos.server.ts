// Server-only helpers for the point-of-sale OTP flow.
// No secrets here, but kept out of the client bundle via the .server.ts name.

export const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const MAX_OTP_ATTEMPTS = 5;

export function generateOtp(): string {
  // 6-digit numeric code, zero-padded.
  const n = Math.floor(Math.random() * 1_000_000);
  return n.toString().padStart(6, "0");
}

export function makeReceiptNo(): string {
  const now = new Date();
  const y = now.getFullYear().toString().slice(2);
  const m = (now.getMonth() + 1).toString().padStart(2, "0");
  const d = now.getDate().toString().padStart(2, "0");
  const rand = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `RCP-${y}${m}${d}-${rand}`;
}