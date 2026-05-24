"use client";

import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion-variants";
import NotificationPanel from "@/components/notifications/notification-panel";

export default function NotificationsPage() {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="p-6 space-y-8"
    >
      <motion.div variants={staggerItem}>
        <h1 className="text-3xl font-bold text-white">Notifications</h1>
        <p className="text-gray-400 mt-1">Manage your alerts and notification preferences</p>
      </motion.div>

      <NotificationPanel />
    </motion.div>
  );
}
