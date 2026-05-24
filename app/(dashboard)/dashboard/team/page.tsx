"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion-variants";
import TeamSettings from "@/components/team/team-settings";
import toast from "react-hot-toast";

export default function TeamPage() {
  const [members, setMembers] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentRole, setCurrentRole] = useState("");
  const [loading, setLoading] = useState(true);

  const loadOrg = async () => {
    try {
      const res = await fetch("/api/organization");
      const data = await res.json();
      if (data?.id) {
        setMembers(data.members || []);
        setDepartments(data.departments || []);
      }
      const userRes = await fetch("/api/user/preferences");
      const userData = await userRes.json();
      if (userData?.id) {
        setCurrentUserId(userData.id);
        setCurrentRole(userData.role || "VIEWER");
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadOrg(); }, []);

  const handleInvite = async (email: string, role: string) => {
    try {
      const res = await fetch("/api/organization/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      if (res.ok) {
        toast.success("Invitation sent!");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to invite");
      }
    } catch {
      toast.error("Failed to invite member");
    }
  };

  const handleChangeRole = async (memberId: string, role: string) => {
    try {
      const res = await fetch("/api/organization/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, role }),
      });
      if (res.ok) {
        toast.success("Role updated");
        loadOrg();
      }
    } catch {
      toast.error("Failed to update role");
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    try {
      const res = await fetch("/api/organization/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });
      if (res.ok) {
        toast.success("Member removed");
        loadOrg();
      }
    } catch {
      toast.error("Failed to remove member");
    }
  };

  const handleCreateDepartment = async (name: string) => {
    try {
      const res = await fetch("/api/organization/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        toast.success("Department created");
        loadOrg();
      }
    } catch {
      toast.error("Failed to create department");
    }
  };

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="p-6 space-y-8"
    >
      <motion.div variants={staggerItem}>
        <h1 className="text-3xl font-bold text-white">Team</h1>
        <p className="text-gray-400 mt-1">Manage your organization and team members</p>
      </motion.div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-white/5" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <motion.div variants={staggerItem} className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-xl">
          <p className="text-3xl mb-2">👥</p>
          <h2 className="text-lg font-bold text-white mb-2">Create Your Organization</h2>
          <p className="text-sm text-gray-400 mb-4">Start collaborating with your team</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.target as HTMLFormElement;
              const name = (form.elements.namedItem("orgName") as HTMLInputElement).value;
              try {
                const res = await fetch("/api/organization", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name }),
                });
                if (res.ok) {
                  toast.success("Organization created!");
                  loadOrg();
                }
              } catch {
                toast.error("Failed to create organization");
              }
            }}
            className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
          >
            <input
              name="orgName"
              placeholder="Your company name"
              className="flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white outline-none"
              required
            />
            <button type="submit" className="rounded-2xl bg-white px-6 py-2.5 text-sm font-medium text-black">
              Create
            </button>
          </form>
        </motion.div>
      ) : (
        <TeamSettings
          members={members}
          departments={departments}
          currentUserId={currentUserId}
          currentRole={currentRole}
          onInvite={handleInvite}
          onChangeRole={handleChangeRole}
          onRemoveMember={handleRemoveMember}
          onCreateDepartment={handleCreateDepartment}
        />
      )}
    </motion.div>
  );
}
