"use client";

import Navbar from "@/components/layout/navbar";
import Footer from "@/components/layout/footer";
import Features from "@/components/features";
import HowItWorks from "@/components/how-it-works";
import AuditForm from "@/components/audit-form";
import Charts from "@/components/charts";
import { useAuditStore } from "@/lib/store/audit-store";

export default function Home() {
  const result = useAuditStore((s) => s.result);

  return (
    <main className="min-h-screen bg-black text-white">
      <Navbar />

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-500/20 via-transparent to-transparent blur-3xl" />

        <div className="relative mx-auto flex max-w-7xl flex-col items-center px-6 py-32 text-center">
          <span className="mb-6 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-gray-300 backdrop-blur-xl">
            Save money on AI tools
          </span>

          <h1 className="max-w-4xl text-5xl font-bold leading-tight md:text-7xl">
            Stop Overspending on AI Subscriptions
          </h1>

          <p className="mt-6 max-w-2xl text-lg text-gray-400">
            Analyze your AI stack, identify wasted spend,
            and discover smarter alternatives instantly.
          </p>

          <div className="mt-10 flex gap-4">
            <a
              href="#audit"
              className="rounded-2xl bg-white px-6 py-3 font-medium text-black transition hover:opacity-80"
            >
              Start Free Audit
            </a>

            <a
              href="#dashboard"
              className="rounded-2xl border border-white/10 px-6 py-3 font-medium text-white transition hover:bg-white/10"
            >
              View Demo
            </a>
          </div>
        </div>
      </section>

      <Features />

      <HowItWorks />

      <AuditForm />

      <Charts result={result} />

      <Footer />
    </main>
  );
}