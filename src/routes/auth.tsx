import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, ShoppingBasket } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ownerExists, setupOwner } from "@/lib/admin.functions";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    inactive: search.inactive === true || search.inactive === "true",
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { inactive } = Route.useSearch();
  const checkOwner = useServerFn(ownerExists);
  const setup = useServerFn(setupOwner);

  const { data: ownerData, isLoading: checking } = useQuery({
    queryKey: ["owner-exists"],
    queryFn: () => checkOwner(),
  });

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // If already signed in, go straight to the register.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/pay", replace: true });
    });
  }, [navigate]);

  useEffect(() => {
    if (inactive) toast.error("Your account has been disabled. Contact the owner.");
  }, [inactive]);

  const isSetup = ownerData ? !ownerData.exists : false;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (isSetup) {
        await setup({ data: { fullName: fullName.trim(), email: email.trim(), password } });
      }
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      navigate({ to: "/pay", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShoppingBasket className="h-7 w-7" />
          </span>
          <h1 className="mt-3 text-2xl font-bold text-foreground">MartPay</h1>
          <p className="text-sm text-muted-foreground">Supermarket OTP payments</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              {checking ? "Loading…" : isSetup ? "Create owner account" : "Cashier sign in"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {checking ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                {isSetup && (
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Your name</Label>
                    <Input
                      id="name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete={isSetup ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isSetup ? (
                    "Create account & sign in"
                  ) : (
                    "Sign in"
                  )}
                </Button>
                {isSetup && (
                  <p className="text-center text-xs text-muted-foreground">
                    This first account becomes the store owner (admin).
                  </p>
                )}
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}