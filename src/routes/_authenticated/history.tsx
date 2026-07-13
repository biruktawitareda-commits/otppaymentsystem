import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Receipt } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBirr, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/history")({
  component: HistoryPage,
});

type Tx = {
  id: string;
  receipt_no: string;
  customer_phone: string;
  cashier_name: string | null;
  amount: number;
  status: string;
  created_at: string;
};

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "paid") return "default";
  if (status === "pending") return "secondary";
  return "outline";
}

function HistoryPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, receipt_no, customer_phone, cashier_name, amount, status, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Tx[];
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Transaction history</h1>
        <p className="text-sm text-muted-foreground">All payments processed, most recent first.</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !data || data.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <Receipt className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium text-foreground">No transactions yet</p>
            <p className="text-sm text-muted-foreground">Sales will appear here as you process them.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {data.map((tx) => (
            <Card key={tx.id}>
              <CardContent className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{tx.customer_phone}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {tx.receipt_no} · {formatDateTime(tx.created_at)}
                    {tx.cashier_name ? ` · ${tx.cashier_name}` : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="font-semibold text-foreground">{formatBirr(tx.amount)}</span>
                  <Badge variant={statusVariant(tx.status)} className="capitalize">
                    {tx.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}