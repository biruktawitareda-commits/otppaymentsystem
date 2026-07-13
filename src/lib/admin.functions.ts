import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const credsSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(6, "Password must be at least 6 characters").max(72),
  fullName: z.string().trim().min(1, "Name is required").max(100),
});

/** Returns whether an owner (admin) account exists yet. Used by the auth page. */
export const ownerExists = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count, error } = await supabaseAdmin
    .from("user_roles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");
  if (error) throw new Error(error.message);
  return { exists: (count ?? 0) > 0 };
});

/**
 * First-run owner setup. Self-closes once any admin exists, so it is safe to
 * leave callable without auth for the very first account.
 */
export const setupOwner = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => credsSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) > 0) {
      throw new Error("An owner account already exists. Please sign in.");
    }

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (error) throw new Error(error.message);
    const uid = created.user.id;

    await supabaseAdmin
      .from("profiles")
      .upsert({ id: uid, full_name: data.fullName, active: true });
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: uid, role: "admin" });
    if (roleErr) throw new Error(roleErr.message);

    return { ok: true };
  });

/** Owner creates a new cashier account. */
export const createCashier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => credsSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: owner access required");
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (error) throw new Error(error.message);
    const uid = created.user.id;

    await supabaseAdmin
      .from("profiles")
      .upsert({ id: uid, full_name: data.fullName, active: true });
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: uid, role: "cashier" });
    if (roleErr) throw new Error(roleErr.message);

    return { ok: true, cashierId: uid };
  });

/** Owner lists all cashiers with their sales stats. */
export const listCashiers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: owner access required");
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const [{ data: roles }, { data: profiles }, { data: usersList }, { data: txs }] =
      await Promise.all([
        supabaseAdmin.from("user_roles").select("user_id, role"),
        supabaseAdmin.from("profiles").select("id, full_name, active, created_at"),
        supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
        supabaseAdmin
          .from("transactions")
          .select("cashier_id, amount, status, paid_at"),
      ]);

    const emailById = new Map<string, string>();
    for (const u of usersList?.users ?? []) {
      if (u.id && u.email) emailById.set(u.id, u.email);
    }
    const roleById = new Map<string, string>();
    for (const r of roles ?? []) roleById.set(r.user_id, r.role);

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const statsById = new Map<
      string,
      { total: number; count: number; todayTotal: number; todayCount: number }
    >();
    for (const t of txs ?? []) {
      if (t.status !== "paid") continue;
      const s =
        statsById.get(t.cashier_id) ?? {
          total: 0,
          count: 0,
          todayTotal: 0,
          todayCount: 0,
        };
      const amt = Number(t.amount);
      s.total += amt;
      s.count += 1;
      if (t.paid_at && new Date(t.paid_at) >= startOfToday) {
        s.todayTotal += amt;
        s.todayCount += 1;
      }
      statsById.set(t.cashier_id, s);
    }

    const cashiers = (profiles ?? [])
      .filter((p) => roleById.get(p.id) === "cashier")
      .map((p) => {
        const s = statsById.get(p.id) ?? {
          total: 0,
          count: 0,
          todayTotal: 0,
          todayCount: 0,
        };
        return {
          id: p.id,
          fullName: p.full_name,
          email: emailById.get(p.id) ?? "",
          active: p.active,
          createdAt: p.created_at,
          salesTotal: s.total,
          salesCount: s.count,
          todayTotal: s.todayTotal,
          todayCount: s.todayCount,
        };
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));

    return { cashiers };
  });

/** Owner activates / deactivates a cashier (deactivated cashiers cannot use the app). */
export const setCashierActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ cashierId: z.string().uuid(), active: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: owner access required");
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ active: data.active })
      .eq("id", data.cashierId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });