import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, UserPlus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { listCashiers, createCashier, setCashierActive } from "@/lib/admin.functions";
import { formatBirr } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/cashiers")({
  component: CashiersPage,
});

function CashiersPage() {
  const list = useServerFn(listCashiers);
  const create = useServerFn(createCashier);
  const setActive = useServerFn(setCashierActive);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["cashiers"],
    queryFn: () => list(),
  });

  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const createMut = useMutation({
    mutationFn: () =>
      create({ data: { fullName: fullName.trim(), email: email.trim(), password } }),
    onSuccess: () => {
      toast.success("Cashier created");
      setOpen(false);
      setFullName("");
      setEmail("");
      setPassword("");
      queryClient.invalidateQueries({ queryKey: ["cashiers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create cashier"),
  });

  const toggleMut = useMutation({
    mutationFn: (vars: { cashierId: string; active: boolean }) => setActive({ data: vars }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cashiers"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update cashier"),
  });

  const cashiers = data?.cashiers ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cashiers</h1>
          <p className="text-sm text-muted-foreground">Manage register staff and their sales.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <UserPlus className="mr-1 h-4 w-4" /> Add
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add cashier</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="c-name">Full name</Label>
                <Input id="c-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-email">Login email</Label>
                <Input
                  id="c-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-pass">Password</Label>
                <Input
                  id="c-pass"
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                />
                <p className="text-xs text-muted-foreground">Share these credentials with the cashier.</p>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => createMut.mutate()}
                disabled={createMut.isPending || !fullName || !email || password.length < 6}
              >
                {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create cashier"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : cashiers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <Users className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium text-foreground">No cashiers yet</p>
            <p className="text-sm text-muted-foreground">Add your first register staff to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {cashiers.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{c.fullName}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.email}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Today: {c.todayCount} · {formatBirr(c.todayTotal)} · All: {formatBirr(c.salesTotal)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Switch
                    checked={c.active}
                    onCheckedChange={(v) => toggleMut.mutate({ cashierId: c.id, active: v })}
                  />
                  <span className="text-xs text-muted-foreground">{c.active ? "Active" : "Disabled"}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}