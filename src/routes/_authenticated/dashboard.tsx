import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, TrendingUp, Receipt, CalendarDays } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBirr } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

type PaidTx = {
  amount: number;
  paid_at: string | null;
  cashier_name: string | null;
};

function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-paid"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("amount, paid_at, cashier_name")
        .eq("status", "paid")
        .order("paid_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as PaidTx[];
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const txs = data ?? [];
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 6);

  const today = txs.filter((t) => t.paid_at && new Date(t.paid_at) >= startOfToday);
  const week = txs.filter((t) => t.paid_at && new Date(t.paid_at) >= startOfWeek);

  const sum = (arr: PaidTx[]) => arr.reduce((s, t) => s + Number(t.amount), 0);

  const byCashier = new Map<string, { total: number; count: number }>();
  for (const t of today) {
    const key = t.cashier_name || "Unknown";
    const c = byCashier.get(key) ?? { total: 0, count: 0 };
    c.total += Number(t.amount);
    c.count += 1;
    byCashier.set(key, c);
  }
  const cashierRows = [...byCashier.entries()].sort((a, b) => b[1].total - a[1].total);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Sales dashboard</h1>
        <p className="text-sm text-muted-foreground">Your store at a glance.</p>
      </div>

      <div className="rounded-xl bg-primary p-5 text-primary-foreground">
        <div className="flex items-center gap-2 text-sm opacity-90">
          <CalendarDays className="h-4 w-4" /> Today's summary
        </div>
        <p className="mt-2 text-3xl font-bold">{formatBirr(sum(today))}</p>
        <p className="text-sm opacity-90">
          {today.length} transaction{today.length === 1 ? "" : "s"} today
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <TrendingUp className="h-4 w-4" /> Last 7 days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-foreground">{formatBirr(sum(week))}</p>
            <p className="text-xs text-muted-foreground">{week.length} transactions</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Receipt className="h-4 w-4" /> All time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-foreground">{formatBirr(sum(txs))}</p>
            <p className="text-xs text-muted-foreground">{txs.length} transactions</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Today by cashier</CardTitle>
        </CardHeader>
        <CardContent>
          {cashierRows.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No sales yet today.</p>
          ) : (
            <div className="space-y-2">
              {cashierRows.map(([name, c]) => (
                <div key={name} className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">{name}</span>
                  <span className="text-muted-foreground">
                    {c.count} sale{c.count === 1 ? "" : "s"} ·{" "}
                    <span className="font-semibold text-foreground">{formatBirr(c.total)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}