import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth" });
    }
    // Deactivated cashiers are signed out and blocked.
    const { data: profile } = await supabase
      .from("profiles")
      .select("active")
      .eq("id", data.user.id)
      .maybeSingle();
    if (profile && profile.active === false) {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth", search: { inactive: true } });
    }
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});