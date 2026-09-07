"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion-variants";
import toast from "react-hot-toast";

interface OrgMember {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
  createdAt: string;
}

interface Org {
  id: string;
  name: string;
  slug: string;
  members: OrgMember[];
}

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
}

interface LastInvite {
  email: string;
  url: string;
  emailStatus: "sent" | "not_configured" | "delivery_failed";
}

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  ANALYST: "Analyst",
  VIEWER: "Viewer",
};

export default function TeamPage() {
  const [org, setOrg] = useState<Org | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("ANALYST");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [lastInvite, setLastInvite] = useState<LastInvite | null>(null);
  const [orgName, setOrgName] = useState("");
  const [createBusy, setCreateBusy] = useState(false);

  const isAdmin = myRole === "ADMIN";

  const fetchOrg = useCallback(async () => {
    const res = await fetch("/api/organization/current");
    if (!res.ok) throw new Error("Failed to load your organization");
    return res.json();
  }, []);

  const fetchInvites = useCallback(async (orgId: string) => {
    const res = await fetch(`/api/organization/invite?orgId=${encodeURIComponent(orgId)}`);
    if (!res.ok) throw new Error("Failed to load pending invitations");
    const data = await res.json();
    return data.invites ?? [];
  }, []);

  const refresh = useCallback(async () => {
    const data = await fetchOrg();
    setOrg(data.org);
    setMyRole(data.role);
    setMyId(data.userId ?? null);
    if (data.org) {
      setInvites(await fetchInvites(data.org.id));
    }
  }, [fetchOrg, fetchInvites]);

  useEffect(() => {
    let cancelled = false;
    fetchOrg()
      .then(async (data) => {
        if (cancelled) return;
        setOrg(data.org);
        setMyRole(data.role);
        setMyId(data.userId ?? null);
        if (data.org) {
          const pending = await fetchInvites(data.org.id);
          if (!cancelled) setInvites(pending);
        }
      })
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Failed to load your organization"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchOrg, fetchInvites]);

  const handleCreateOrg = async () => {
    if (!orgName.trim()) {
      toast.error("Enter an organization name");
      return;
    }
    setCreateBusy(true);
    try {
      const res = await fetch("/api/organization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: orgName.trim() }),
      });
      if (!res.ok) throw new Error();
      toast.success("Organization created");
      setOrgName("");
      await refresh();
    } catch {
      toast.error("Failed to create organization");
    } finally {
      setCreateBusy(false);
    }
  };

  const handleInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!org) return;
    if (!inviteEmail.trim()) {
      toast.error("Enter an email address");
      return;
    }
    setInviteBusy(true);
    try {
      const res = await fetch("/api/organization/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: org.id, email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Invite failed");
      if (data.inviteUrl) {
        setLastInvite({
          email: inviteEmail.trim(),
          url: data.inviteUrl,
          emailStatus: data.emailStatus ?? "not_configured",
        });
      }
      setInviteEmail("");
      if (data.emailStatus === "sent") {
        toast.success(`Invitation emailed to ${inviteEmail.trim()}`);
      }
      if (org) {
        setInvites(await fetchInvites(org.id));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send invitation");
    } finally {
      setInviteBusy(false);
    }
  };

  const copyInviteLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied");
    } catch {
      toast.error("Could not copy the invite link. Select it manually to copy.");
    }
  };

  const handleRemove = async (memberId: string, name: string | null) => {
    if (!org) return;
    if (!window.confirm(`Remove ${name ?? "this member"} from the organization?`)) return;
    try {
      const res = await fetch("/api/organization/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: org.id, memberId }),
      });
      if (!res.ok) throw new Error();
      toast.success("Member removed");
      await refresh();
    } catch {
      toast.error("Failed to remove member");
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="h-10 w-48 animate-pulse rounded-xl bg-white/5" />
        <div className="mt-8 h-64 animate-pulse rounded-3xl bg-white/5" />
      </div>
    );
  }

  if (!org) {
    return (
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="p-6 space-y-8 max-w-md"
      >
        <motion.div variants={staggerItem}>
          <h1 className="text-3xl font-bold text-white">Team</h1>
          <p className="text-gray-400 mt-1">Create an organization to invite collaborators</p>
        </motion.div>

        <motion.div variants={staggerItem}>
          <label htmlFor="org-name" className="mb-2 block text-sm text-gray-300">
            Organization name
          </label>
          <input
            id="org-name"
            type="text"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="Acme Inc."
            className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none transition hover:border-white/20 focus:border-white/30"
          />
          <button
            type="button"
            onClick={handleCreateOrg}
            disabled={createBusy}
            className="mt-4 w-full rounded-2xl bg-white px-6 py-3 font-medium text-black transition hover:opacity-80 disabled:opacity-50"
          >
            {createBusy ? "Creating..." : "Create Organization"}
          </button>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="p-6 space-y-8"
    >
      <motion.div variants={staggerItem}>
        <h1 className="text-3xl font-bold text-white">Team</h1>
        <p className="text-gray-400 mt-1">{org.name}</p>
      </motion.div>

      <motion.div
        variants={staggerItem}
        className="rounded-2xl border border-white/10 bg-white/5 px-6 py-5 backdrop-blur-xl"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500">Organization</p>
            <p className="mt-1 text-xl font-bold text-white">{org.name}</p>
          </div>
          <div className="flex gap-4 text-right">
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500">Members</p>
              <p className="mt-1 text-sm font-medium text-gray-300">{org.members.length}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500">Pending invites</p>
              <p className="mt-1 text-sm font-medium text-gray-300">{invites.length}</p>
            </div>
          </div>
        </div>
      </motion.div>

      {!isAdmin && (
        <motion.div
          variants={staggerItem}
          className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-gray-400"
        >
          You are a member of this organization. Organization management is available to administrators only.
        </motion.div>
      )}

      {isAdmin && (
        <motion.form
          variants={staggerItem}
          onSubmit={handleInvite}
          className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl"
        >
          <h2 className="text-lg font-semibold text-white">Invite a member</h2>
          <p className="text-sm text-gray-400 mt-1">
            Each invite gets a one-time join link valid for 7 days. When email is
            configured, the invitee is emailed the link; otherwise the link is shown
            below for you to copy and share.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teammate@example.com"
              className="flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none transition hover:border-white/20 focus:border-white/30"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none transition hover:border-white/20 focus:border-white/30"
            >
              <option value="ANALYST">Analyst</option>
              <option value="VIEWER">Viewer</option>
              <option value="ADMIN">Admin</option>
            </select>
            <button
              type="submit"
              disabled={inviteBusy}
              className="rounded-2xl bg-white px-6 py-2 font-medium text-black transition hover:opacity-80 disabled:opacity-50"
            >
              {inviteBusy ? "Sending..." : "Send Invite"}
            </button>
          </div>

          {lastInvite && (
            <div
              className={`mt-4 rounded-xl border px-4 py-3 ${
                lastInvite.emailStatus === "sent"
                  ? "border-white/10 bg-white/5"
                  : "border-amber-500/30 bg-amber-500/10"
              }`}
            >
              <p className="text-xs text-gray-300">
                {lastInvite.emailStatus === "sent"
                  ? `Invitation emailed to ${lastInvite.email}. The link below also works.`
                  : lastInvite.emailStatus === "not_configured"
                    ? `Invitation created for ${lastInvite.email}, but email delivery is not configured. Share the link below.`
                    : `Invitation created for ${lastInvite.email}, but email delivery failed. Share the link below.`}
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  readOnly
                  value={lastInvite.url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs text-gray-300 outline-none"
                />
                <button
                  type="button"
                  onClick={() => copyInviteLink(lastInvite.url)}
                  className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white transition hover:bg-white/10"
                >
                  Copy link
                </button>
              </div>
            </div>
          )}
        </motion.form>
      )}

      <motion.div variants={staggerItem} className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Members</h2>
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
          <div className="divide-y divide-white/10">
            {org.members.map((member) => (
              <div key={member.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-medium text-white">
                    {(member.name?.[0] ?? member.email[0] ?? "?").toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{member.name ?? "Member"}</p>
                    <p className="truncate text-xs text-gray-500">{member.email}</p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-3">
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-gray-300">
                    {ROLE_LABEL[member.role] ?? member.role}
                  </span>
                  {isAdmin && member.id !== myId && (
                    <button
                      type="button"
                      onClick={() => handleRemove(member.id, member.name)}
                      className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-300 hover:bg-red-500/20"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
            {org.members.length === 0 && (
              <p className="px-5 py-4 text-sm text-gray-500">No members yet.</p>
            )}
          </div>
        </div>
      </motion.div>

      {isAdmin && invites.length > 0 && (
        <motion.div variants={staggerItem} className="space-y-4">
          <h2 className="text-lg font-semibold text-white">Pending invitations</h2>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
            <div className="divide-y divide-white/10">
              {invites.map((invite) => (
                <div key={invite.id} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{invite.email}</p>
                    <p className="truncate text-xs text-gray-500">
                      Invited as {ROLE_LABEL[invite.role] ?? invite.role}
                    </p>
                  </div>
                  <p className="flex-shrink-0 text-xs text-gray-500">
                    Expires {new Date(invite.expiresAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}