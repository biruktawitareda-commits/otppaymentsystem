import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "cashier" | null;

export type AuthState = {
  loading: boolean;
  userId: string | null;
  email: string | null;
  fullName: string | null;
  role: AppRole;
};

const initial: AuthState = {
  loading: true,
  userId: null,
  email: null,
  fullName: null,
  role: null,
};

/**
 * Client-side session + role hook. RLS lets a user read only their own role,
 * so this is safe for driving UI (nav, admin links). Never trust it for
 * authorization — that lives in RLS and server functions.
 */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>(initial);

  useEffect(() => {
    let active = true;

    async function load(userId: string | null, email: string | null) {
      if (!userId) {
        if (active) setState({ ...initial, loading: false });
        return;
      }
      const [{ data: roles }, { data: profile }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
      ]);
      const role: AppRole = roles?.some((r) => r.role === "admin")
        ? "admin"
        : roles && roles.length > 0
          ? "cashier"
          : null;
      if (active) {
        setState({
          loading: false,
          userId,
          email,
          fullName: profile?.full_name ?? null,
          role,
        });
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user ?? null;
      load(user?.id ?? null, user?.email ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setState((s) => ({ ...s, loading: true }));
      load(user?.id ?? null, user?.email ?? null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}