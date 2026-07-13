// Server-only helpers for the point-of-sale OTP flow.
// No secrets here, but kept out of the client bundle via the .server.ts name.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const MAX_OTP_ATTEMPTS = 5;

/**
 * Server-side guard: reject any payment action from a cashier whose account has
 * been deactivated by the owner. This is enforced here (not only in the client
 * route guard) so a disabled cashier cannot keep transacting with a live session.
 */
export async function assertActiveCashier(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("profiles")
    .select("active")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.active === false) {
    throw new Error("Your account has been deactivated. Contact the store owner.");
  }
}

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