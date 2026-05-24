"use client";

import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion-variants";

interface Member {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
  createdAt: string;
}

interface Department {
  id: string;
  name: string;
}

interface TeamSettingsProps {
  members: Member[];
  departments: Department[];
  currentUserId: string;
  currentRole: string;
  onInvite: (email: string, role: string) => void;
  onChangeRole: (memberId: string, role: string) => void;
  onRemoveMember: (memberId: string) => void;
  onCreateDepartment: (name: string) => void;
}

export default function TeamSettings({
  members,
  departments,
  currentUserId,
  currentRole,
  onInvite,
  onChangeRole,
  onRemoveMember,
  onCreateDepartment,
}: TeamSettingsProps) {
  const isAdmin = currentRole === "ADMIN";

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* Members */}
      <motion.div variants={staggerItem} className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
        <h2 className="text-lg font-bold text-white mb-4">Team Members ({members.length})</h2>

        <div className="space-y-3">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-black/40 p-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/20 text-sm font-bold text-blue-300">
                  {member.name?.[0]?.toUpperCase() || member.email[0].toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-white">
                    {member.name || "Unnamed"}
                    {member.id === currentUserId && (
                      <span className="ml-2 text-xs text-gray-500">(you)</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400">{member.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  member.role === "ADMIN" ? "bg-purple-500/20 text-purple-300"
                  : member.role === "ANALYST" ? "bg-blue-500/20 text-blue-300"
                  : "bg-gray-500/20 text-gray-300"
                }`}>
                  {member.role}
                </span>

                {isAdmin && member.id !== currentUserId && (
                  <div className="flex gap-1">
                    <select
                      value={member.role}
                      onChange={(e) => onChangeRole(member.id, e.target.value)}
                      className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-white outline-none"
                    >
                      <option value="ADMIN">Admin</option>
                      <option value="ANALYST">Analyst</option>
                      <option value="VIEWER">Viewer</option>
                    </select>
                    <button
                      onClick={() => onRemoveMember(member.id)}
                      className="rounded-lg bg-red-500/10 px-2 py-1 text-xs text-red-400 hover:bg-red-500/20"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Invite */}
      {isAdmin && (
        <motion.div variants={staggerItem} className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <h2 className="text-lg font-bold text-white mb-4">Invite Member</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.target as HTMLFormElement;
              const email = (form.elements.namedItem("email") as HTMLInputElement).value;
              const role = (form.elements.namedItem("role") as HTMLSelectElement).value;
              if (email) {
                onInvite(email, role);
                form.reset();
              }
            }}
            className="flex flex-col gap-3 sm:flex-row"
          >
            <input
              name="email"
              type="email"
              placeholder="colleague@company.com"
              required
              className="flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition hover:border-white/20 focus:border-white/30"
            />
            <select
              name="role"
              className="rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none"
            >
              <option value="ANALYST">Analyst</option>
              <option value="VIEWER">Viewer</option>
              <option value="ADMIN">Admin</option>
            </select>
            <button
              type="submit"
              className="rounded-2xl bg-white px-6 py-3 text-sm font-medium text-black transition hover:opacity-80"
            >
              Send Invite
            </button>
          </form>
        </motion.div>
      )}

      {/* Departments */}
      {isAdmin && (
        <motion.div variants={staggerItem} className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <h2 className="text-lg font-bold text-white mb-4">Departments</h2>

          <div className="flex flex-wrap gap-2 mb-4">
            {departments.map((dept) => (
              <span
                key={dept.id}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-300"
              >
                {dept.name}
              </span>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.target as HTMLFormElement;
              const name = (form.elements.namedItem("deptName") as HTMLInputElement).value;
              if (name) {
                onCreateDepartment(name);
                form.reset();
              }
            }}
            className="flex gap-3"
          >
            <input
              name="deptName"
              placeholder="e.g. Engineering"
              className="flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white outline-none transition hover:border-white/20 focus:border-white/30"
            />
            <button
              type="submit"
              className="rounded-2xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm text-gray-300 transition hover:bg-white/10"
            >
              Add
            </button>
          </form>
        </motion.div>
      )}
    </motion.div>
  );
}
