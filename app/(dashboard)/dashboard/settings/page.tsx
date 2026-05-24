"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion-variants";
import { CURRENCY_OPTIONS, TEAM_SIZE_OPTIONS } from "@/lib/constants";
import LoadingSkeleton from "@/components/ui/loading-skeleton";
import toast from "react-hot-toast";
import TeamSettings from "@/components/team/team-settings";
import NotificationPanel from "@/components/notifications/notification-panel";

type Tab = "preferences" | "team" | "notifications";

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currency, setCurrency] = useState("USD");
  const [teamSize, setTeamSize] = useState(1);
  const [activeTab, setActiveTab] = useState<Tab>("preferences");

  useEffect(() => {
    fetch("/api/user/preferences")
      .then((r) => r.json())
      .then((data) => {
        if (data.currency) setCurrency(data.currency);
        if (data.teamSize) setTeamSize(data.teamSize);
      })
      .catch(() => toast.error("Failed to load preferences"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/user/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency, teamSize }),
      });
      if (res.ok) {
        toast.success("Preferences saved");
      } else {
        toast.error("Failed to save");
      }
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "preferences", label: "Preferences" },
    { id: "team", label: "Team" },
    { id: "notifications", label: "Notifications" },
  ];

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <LoadingSkeleton variant="card" count={3} />
      </div>
    );
  }

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="p-6 space-y-8 max-w-4xl"
    >
      <motion.div variants={staggerItem}>
        <h1 className="text-3xl font-bold text-white">Settings</h1>
        <p className="text-gray-400 mt-1">Manage your account, team, and preferences</p>
      </motion.div>

      <motion.div variants={staggerItem} className="flex gap-1 rounded-2xl border border-white/10 bg-white/5 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 rounded-xl py-2.5 text-sm font-medium transition ${
              activeTab === tab.id ? "bg-white/10 text-white" : "text-gray-400 hover:text-gray-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </motion.div>

      {activeTab === "preferences" && (
        <motion.div variants={staggerItem} className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl space-y-6">
          <h2 className="text-lg font-bold text-white">Preferences</h2>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition hover:border-white/20 focus:border-white/30"
            >
              {CURRENCY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">Team Size</label>
            <select
              value={teamSize}
              onChange={(e) => setTeamSize(Number(e.target.value))}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition hover:border-white/20 focus:border-white/30"
            >
              {TEAM_SIZE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-2xl bg-white px-6 py-3 font-medium text-black transition hover:opacity-80 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Preferences"}
          </button>
        </motion.div>
      )}

      {activeTab === "team" && (
        <motion.div variants={staggerItem}>
          <p className="text-sm text-gray-400 mb-4">Team management available on Pro plan and above.</p>
        </motion.div>
      )}

      {activeTab === "notifications" && (
        <NotificationPanel />
      )}
    </motion.div>
  );
}
