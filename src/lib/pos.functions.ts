import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  OTP_TTL_MS,
  MAX_OTP_ATTEMPTS,
  generateOtp,
  makeReceiptNo,
  assertActiveCashier,
} from "./pos.server";

const itemSchema = z.object({
  name: z.string().trim().min(1, "Item name required").max(80),
  qty: z.number().finite().positive().max(100000),
  price: z.number().finite().nonnegative().max(100000000),
});

const startSchema = z.object({
  customerPhone: z
    .string()
    .trim()
    .min(6, "Enter a valid phone number")
    .max(20)
    .regex(/^[0-9+\-\s]+$/, "Phone number can only contain digits"),
  items: z.array(itemSchema).min(1, "Add at least one item").max(100),
});

function formatBirr(amount: number): string {
  return `${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} Birr`;
}

/**
 * Start a payment: create a pending transaction and generate an OTP.
 * SMS is simulated for now — the OTP is returned so the cashier can show it
 * to the customer / test the flow. When Twilio is added, stop returning `otp`
 * and send it by SMS inside this handler instead.
 */
export const startPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => startSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    await assertActiveCashier(supabase, userId);

    const amount = Math.round(
      data.items.reduce((sum, i) => sum + i.qty * i.price, 0) * 100,
    ) / 100;
    if (amount <= 0) throw new Error("Total must be greater than 0");

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();

    const otp = generateOtp();
    const receiptNo = makeReceiptNo();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

    const { data: tx, error } = await supabase
      .from("transactions")
      .insert({
        receipt_no: receiptNo,
        cashier_id: userId,
        cashier_name: profile?.full_name ?? "",
        customer_phone: data.customerPhone,
        amount,
        items: data.items,
        status: "pending",
        otp_code: otp,
        otp_expires_at: expiresAt,
        otp_attempts: 0,
      })
      .select("id, receipt_no, amount")
      .single();

    if (error) throw new Error(error.message);

    const simulatedSms = `Confirm your payment of ${formatBirr(
      amount,
    )}. Your one-time code is ${otp}. It expires in 5 minutes.`;

    return {
      transactionId: tx.id as string,
      receiptNo: tx.receipt_no as string,
      amount,
      // Simulated SMS mode — remove `otp` from this return once real SMS is wired.
      otp,
      simulatedSms,
    };
  });

const verifySchema = z.object({
  transactionId: z.string().uuid(),
  code: z.string().trim().regex(/^[0-9]{6}$/, "Enter the 6-digit code"),
});

/**
 * Verify an OTP. On success the transaction is marked paid and a receipt is
 * returned (the receipt SMS text is simulated for now).
 */
export const verifyOtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => verifySchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    await assertActiveCashier(supabase, userId);

    const { data: tx, error } = await supabase
      .from("transactions")
      .select(
        "id, receipt_no, cashier_name, customer_phone, amount, items, status, otp_code, otp_expires_at, otp_attempts, paid_at",
      )
      .eq("id", data.transactionId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!tx) throw new Error("Transaction not found");

    if (tx.status === "paid") {
      return buildReceipt(tx);
    }
    if (tx.status === "cancelled") {
      throw new Error("This payment was cancelled. Start a new one.");
    }

    if (tx.otp_expires_at && new Date(tx.otp_expires_at).getTime() < Date.now()) {
      throw new Error("The code has expired. Please start the payment again.");
    }

    if ((tx.otp_attempts ?? 0) >= MAX_OTP_ATTEMPTS) {
      throw new Error("Too many incorrect attempts. Please start again.");
    }

    if (tx.otp_code !== data.code) {
      await supabase
        .from("transactions")
        .update({ otp_attempts: (tx.otp_attempts ?? 0) + 1 })
        .eq("id", tx.id);
      const remaining = MAX_OTP_ATTEMPTS - ((tx.otp_attempts ?? 0) + 1);
      throw new Error(
        remaining > 0
          ? `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} left.`
          : "Incorrect code. Too many attempts — please start again.",
      );
    }

    const paidAt = new Date().toISOString();
    const { data: updated, error: updErr } = await supabase
      .from("transactions")
      .update({ status: "paid", paid_at: paidAt, otp_code: null })
      .eq("id", tx.id)
      .select(
        "id, receipt_no, cashier_name, customer_phone, amount, items, status, paid_at",
      )
      .single();

    if (updErr) throw new Error(updErr.message);

    return buildReceipt(updated);
  });

type ReceiptRow = {
  id: string;
  receipt_no: string;
  cashier_name: string;
  customer_phone: string;
  amount: number;
  items: unknown;
  status: string;
  paid_at: string | null;
};

function buildReceipt(tx: ReceiptRow) {
  const items = Array.isArray(tx.items)
    ? (tx.items as { name: string; qty: number; price: number }[])
    : [];
  const simulatedReceiptSms =
    `PAYMENT CONFIRMED\n` +
    `Receipt: ${tx.receipt_no}\n` +
    `Amount: ${formatBirr(Number(tx.amount))}\n` +
    `Served by: ${tx.cashier_name || "Cashier"}\n` +
    `Thank you for shopping with us!`;

  return {
    transactionId: tx.id,
    receiptNo: tx.receipt_no,
    cashierName: tx.cashier_name,
    customerPhone: tx.customer_phone,
    amount: Number(tx.amount),
    items,
    paidAt: tx.paid_at,
    simulatedReceiptSms,
  };
}

/** Cancel a still-pending payment. */
export const cancelPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ transactionId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertActiveCashier(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("transactions")
      .update({ status: "cancelled", otp_code: null })
      .eq("id", data.transactionId)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });