import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ShoppingBasket,
  ShieldCheck,
  Receipt,
  BarChart3,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MartPay — Supermarket OTP Payments" },
      {
        name: "description",
        content:
          "Take supermarket payments with SMS one-time codes. Instant receipts, sales dashboard, and cashier logins — all in one register.",
      },
      { property: "og:title", content: "MartPay — Supermarket OTP Payments" },
      {
        property: "og:description",
        content:
          "Take supermarket payments with SMS one-time codes. Instant receipts, sales dashboard, and cashier logins — all in one register.",
      },
    ],
  }),
  component: Index,
});

const FEATURES = [
  { icon: ShieldCheck, title: "OTP confirmation", desc: "Customer confirms each sale with a one-time code." },
  { icon: Receipt, title: "Instant receipts", desc: "A clear receipt for every paid transaction." },
  { icon: BarChart3, title: "Sales dashboard", desc: "See daily and weekly totals at a glance." },
  { icon: Users, title: "Cashier logins", desc: "Each register has its own account and tracked sales." },
];

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShoppingBasket className="h-5 w-5" />
          </span>
          MartPay
        </div>
        <Link
          to="/auth"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Open register
        </Link>
      </header>

      <main className="mx-auto max-w-5xl px-4">
        <section className="py-16 text-center sm:py-24">
          <h1 className="mx-auto max-w-2xl text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            OTP payments for your supermarket
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            The customer gives their phone, gets a one-time code by SMS, and the sale is
            confirmed instantly. Receipts, sales reports, and cashier accounts included.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link
              to="/auth"
              className="rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Get started
            </Link>
          </div>
        </section>

        <section className="grid gap-4 pb-20 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border bg-card p-5">
              <f.icon className="h-6 w-6 text-primary" />
              <h2 className="mt-3 font-semibold text-foreground">{f.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
