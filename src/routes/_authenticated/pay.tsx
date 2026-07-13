import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Loader2,
  ShieldCheck,
  CheckCircle2,
  Printer,
  MessageSquare,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { startPayment, verifyOtp, cancelPayment } from "@/lib/pos.functions";
import { formatBirr, formatDateTime, type LineItem } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/pay")({
  component: PayPage,
});

type Row = { id: number; name: string; qty: string; price: string };

type Pending = {
  transactionId: string;
  receiptNo: string;
  amount: number;
  otp: string;
  simulatedSms: string;
};

type Receipt = {
  receiptNo: string;
  cashierName: string;
  customerPhone: string;
  amount: number;
  items: LineItem[];
  paidAt: string | null;
  simulatedReceiptSms: string;
};

let rowSeq = 1;
const newRow = (): Row => ({ id: rowSeq++, name: "", qty: "1", price: "" });

function PayPage() {
  const start = useServerFn(startPayment);
  const verify = useServerFn(verifyOtp);
  const cancel = useServerFn(cancelPayment);

  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [code, setCode] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);

  const total = useMemo(
    () =>
      rows.reduce((sum, r) => {
        const q = parseFloat(r.qty) || 0;
        const p = parseFloat(r.price) || 0;
        return sum + q * p;
      }, 0),
    [rows],
  );

  function updateRow(id: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function removeRow(id: number) {
    setRows((rs) => (rs.length === 1 ? rs : rs.filter((r) => r.id !== id)));
  }

  async function handleStart() {
    const items: LineItem[] = rows
      .map((r) => ({
        name: r.name.trim(),
        qty: parseFloat(r.qty) || 0,
        price: parseFloat(r.price) || 0,
      }))
      .filter((i) => i.name && i.qty > 0);

    if (items.length === 0) {
      toast.error("Add at least one item with a name and quantity.");
      return;
    }
    if (total <= 0) {
      toast.error("Total must be greater than 0.");
      return;
    }
    if (phone.trim().length < 6) {
      toast.error("Enter the customer's phone number.");
      return;
    }

    setBusy(true);
    try {
      const res = await start({ data: { customerPhone: phone.trim(), items } });
      setPending(res);
      setCode("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start payment.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(value?: string) {
    if (!pending) return;
    const c = value ?? code;
    if (c.length !== 6) return;
    setBusy(true);
    try {
      const res = await verify({ data: { transactionId: pending.transactionId, code: c } });
      setReceipt(res);
      setPending(null);
      toast.success("Payment confirmed!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verification failed.");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!pending) return;
    try {
      await cancel({ data: { transactionId: pending.transactionId } });
    } catch {
      /* ignore */
    }
    setPending(null);
    setCode("");
  }

  function newSale() {
    rowSeq = 1;
    setRows([newRow()]);
    setPhone("");
    setReceipt(null);
    setPending(null);
    setCode("");
  }

  if (receipt) {
    return <ReceiptView receipt={receipt} onNew={newSale} />;
  }

  if (pending) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" /> Confirm payment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-secondary p-4 text-center">
              <p className="text-sm text-muted-foreground">Amount due</p>
              <p className="text-3xl font-bold text-foreground">{formatBirr(pending.amount)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Receipt {pending.receiptNo}</p>
            </div>

            <div className="flex items-start gap-2 rounded-md border border-dashed bg-accent/10 p-3 text-sm">
              <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-accent-foreground" />
              <div>
                <p className="font-medium text-foreground">Simulated SMS to customer</p>
                <p className="text-muted-foreground">{pending.simulatedSms}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  (Real SMS will be sent once Twilio is connected.)
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-center block">Enter the 6-digit code</Label>
              <div className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={code}
                  onChange={(v) => {
                    setCode(v);
                    if (v.length === 6) handleVerify(v);
                  }}
                >
                  <InputOTPGroup>
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <InputOTPSlot key={i} index={i} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={handleCancel} disabled={busy}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={() => handleVerify()} disabled={busy || code.length !== 6}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">New sale</h1>
        <p className="text-sm text-muted-foreground">
          Add items, enter the customer's phone, then send the one-time code.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="grid grid-cols-12 gap-2">
              <Input
                className="col-span-12 sm:col-span-6"
                placeholder="Item name"
                value={r.name}
                onChange={(e) => updateRow(r.id, { name: e.target.value })}
              />
              <Input
                className="col-span-4 sm:col-span-2"
                type="number"
                min="0"
                inputMode="decimal"
                placeholder="Qty"
                value={r.qty}
                onChange={(e) => updateRow(r.id, { qty: e.target.value })}
              />
              <Input
                className="col-span-6 sm:col-span-3"
                type="number"
                min="0"
                inputMode="decimal"
                placeholder="Unit price"
                value={r.price}
                onChange={(e) => updateRow(r.id, { price: e.target.value })}
              />
              <Button
                variant="ghost"
                size="icon"
                className="col-span-2 sm:col-span-1"
                onClick={() => removeRow(r.id)}
                aria-label="Remove item"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, newRow()])}>
            <Plus className="mr-1 h-4 w-4" /> Add item
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label htmlFor="phone">Customer phone</Label>
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              placeholder="e.g. 0912 345 678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg bg-secondary p-4">
            <span className="text-sm font-medium text-muted-foreground">Total</span>
            <span className="text-2xl font-bold text-foreground">{formatBirr(total)}</span>
          </div>
          <Button className="w-full" size="lg" onClick={handleStart} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send OTP & charge"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ReceiptView({ receipt, onNew }: { receipt: Receipt; onNew: () => void }) {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex flex-col items-center text-center">
        <CheckCircle2 className="h-14 w-14 text-primary" />
        <h1 className="mt-2 text-2xl font-bold text-foreground">Payment successful</h1>
        <p className="text-sm text-muted-foreground">Receipt sent to {receipt.customerPhone}</p>
      </div>

      <Card id="receipt-print">
        <CardContent className="space-y-4 pt-6">
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">MartPay</p>
            <p className="text-xs text-muted-foreground">Receipt {receipt.receiptNo}</p>
            <p className="text-xs text-muted-foreground">
              {receipt.paidAt ? formatDateTime(receipt.paidAt) : ""}
            </p>
          </div>
          <div className="space-y-1 border-y py-3 text-sm">
            {receipt.items.map((it, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-foreground">
                  {it.name} <span className="text-muted-foreground">×{it.qty}</span>
                </span>
                <span className="text-foreground">{formatBirr(it.qty * it.price)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-lg font-bold">
            <span>Total</span>
            <span>{formatBirr(receipt.amount)}</span>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Served by {receipt.cashierName || "Cashier"} · Thank you for shopping!
          </p>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => window.print()}>
          <Printer className="mr-1 h-4 w-4" /> Print / PDF
        </Button>
        <Button className="flex-1" onClick={onNew}>
          New sale
        </Button>
      </div>
    </div>
  );
}