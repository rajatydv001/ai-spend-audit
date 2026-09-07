"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion-variants";

export default function InviteActions({
  token,
  movesFromOrg,
}: {
  token: string;
  movesFromOrg: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [started, setStarted] = useState(false);

  const run = async (action: "accept" | "decline") => {
    setBusy(action);
    setStarted(true);
    try {
      const res = await fetch(action === "accept" ? "/api/organization/invite/accept" : "/api/organization/invite/decline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      if (action === "accept") {
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      setStarted(false);
    }
    setBusy(null);
  };

  if (!started) {
    return (
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="space-y-4"
      >
        {movesFromOrg && (
          <motion.p
            variants={staggerItem}
            className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
          >
            Accepting this invitation will move you into the new organization.
          </motion.p>
        )}
        <motion.div variants={staggerItem} className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run("accept")}
            className="flex-1 rounded-2xl bg-white px-6 py-3 font-medium text-black transition hover:opacity-80 disabled:opacity-50"
          >
            {busy === "accept" ? "Accepting..." : "Accept Invitation"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run("decline")}
            className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-6 py-3 font-medium text-gray-300 transition hover:bg-white/10 disabled:opacity-50"
          >
            {busy === "decline" ? "Declining..." : "Decline"}
          </button>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div variants={staggerItem} className="space-y-4">
      <p className="text-sm text-gray-400">
        Invitation processed. You can
      </p>
      <Link
        href="/dashboard"
        className="block w-full rounded-2xl bg-white px-6 py-3 text-center font-medium text-black transition hover:opacity-80"
      >
        Go to dashboard
      </Link>
    </motion.div>
  );
}