"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion-variants";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

interface NotificationPreference {
  type: string;
  enabled: boolean;
}

export default function NotificationPanel() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function fetchData() {
      try {
        const res = await fetch("/api/notifications");
        const data = await res.json();
        if (!active) return;
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
        setPreferences(data.preferences || []);
      } catch {
        // silent
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchData();
    return () => {
      active = false;
    };
  }, []);

  const markAllRead = async () => {
    await fetch("/api/notifications", { method: "PATCH" });
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const togglePreference = async (type: string, enabled: boolean) => {
    await fetch("/api/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, enabled }),
    });
    setPreferences((prev) => {
      const existing = prev.find((p) => p.type === type);
      if (existing) {
        return prev.map((p) => p.type === type ? { ...p, enabled } : p);
      }
      return [...prev, { type, enabled, userId_type: { userId: "", type } }];
    });
  };

  const getPref = (type: string) => preferences.find((p) => p.type === type)?.enabled ?? true;

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* Notifications List */}
      <motion.div variants={staggerItem} className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">
            Notifications
            {unreadCount > 0 && (
              <span className="ml-2 rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-300">
                {unreadCount} new
              </span>
            )}
          </h2>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs text-gray-400 hover:text-white transition"
            >
              Mark all read
            </button>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-white/5" />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">No notifications yet</p>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`rounded-xl border p-4 ${
                  n.read ? "border-white/5 bg-black/20" : "border-white/10 bg-white/5"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${n.read ? "text-gray-400" : "text-white font-medium"}`}>
                      {n.title}
                    </p>
                    <p className="text-xs text-gray-500 mt-1 truncate">{n.message}</p>
                  </div>
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {new Date(n.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Preferences */}
      <motion.div variants={staggerItem} className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
        <h2 className="text-lg font-bold text-white mb-4">Notification Preferences</h2>
        <div className="space-y-4">
          {[
            { type: "WEEKLY_DIGEST", label: "Weekly Savings Digest", desc: "Get a weekly summary of your AI spend and savings" },
            { type: "OVERSPENDING_ALERT", label: "Overspending Alerts", desc: "Get notified when a tool exceeds your budget threshold" },
            { type: "OPTIMIZATION_REMINDER", label: "Optimization Reminders", desc: "Reminders to run new audits and find more savings" },
          ].map((pref) => (
            <div key={pref.type} className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white">{pref.label}</p>
                <p className="text-xs text-gray-500">{pref.desc}</p>
              </div>
              <button
                onClick={() => togglePreference(pref.type, !getPref(pref.type))}
                className={`relative h-6 w-11 rounded-full transition ${
                  getPref(pref.type) ? "bg-blue-500" : "bg-white/10"
                }`}
              >
                <span
                  className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition ${
                    getPref(pref.type) ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
