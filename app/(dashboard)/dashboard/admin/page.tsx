"use client";

import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion-variants";
import AdminDashboard from "@/components/admin/admin-dashboard";

export default function AdminPage() {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="p-6 space-y-8"
    >
      <motion.div variants={staggerItem}>
        <h1 className="text-3xl font-bold text-white">Admin Panel</h1>
        <p className="text-gray-400 mt-1">System overview, usage metrics, and audit logs</p>
      </motion.div>

      <AdminDashboard />
    </motion.div>
  );
}
