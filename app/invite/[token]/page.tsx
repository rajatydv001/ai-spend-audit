import type { Metadata } from "next";
import Link from "next/link";
import { getInviteSummary } from "@/lib/services/organization-service";
import { getSessionUser } from "@/lib/auth/dal";
import InviteActions from "@/components/invite/invite-actions";

export const metadata: Metadata = {
  title: "Invitation",
};

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  const first = local.slice(0, 2);
  return `${first}${"*".repeat(Math.max(3, local.length - 2))}@${domain}`;
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-black px-6 text-white">
      <div className="mb-8 flex items-center gap-3">
        <div className="h-3 w-3 rounded-full bg-green-400" />
        <span className="text-lg font-bold">AI Spend Audit</span>
      </div>

      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
        {children}
      </div>

      <p className="mt-8 text-xs text-gray-500">
        <Link href="/" className="hover:text-gray-300">
          &larr; Back to home
        </Link>
      </p>
    </main>
  );
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await getInviteSummary(token);
  const user = await getSessionUser();

  if (invite.status === "not_found") {
    return (
      <Card>
        <h1 className="text-2xl font-bold">Invitation not found</h1>
        <p className="mt-2 text-sm text-gray-400">
          This invitation may have been removed, or the link is incorrect.
        </p>
      </Card>
    );
  }

  if (invite.status === "expired") {
    return (
      <Card>
        <h1 className="text-2xl font-bold">Invitation expired</h1>
        <p className="mt-2 text-sm text-gray-400">
          This invitation expired on{" "}
          {new Date(invite.expiresAt).toLocaleDateString()}. Ask an administrator to send a new one.
        </p>
      </Card>
    );
  }

  if (invite.status === "used") {
    return (
      <Card>
        <h1 className="text-2xl font-bold">Invitation already used</h1>
        <p className="mt-2 text-sm text-gray-400">
          This invitation has already been accepted and can no longer be used.
        </p>
      </Card>
    );
  }

  if (invite.status === "declined") {
    return (
      <Card>
        <h1 className="text-2xl font-bold">Invitation declined</h1>
        <p className="mt-2 text-sm text-gray-400">
          This invitation has been declined and can no longer be used.
        </p>
      </Card>
    );
  }

  const isRecipient =
    user != null &&
    (invite.email.toLowerCase() === user.email.toLowerCase() || invite.recipientId === user.id);

  if (!user) {
    return (
      <Card>
        <h1 className="text-2xl font-bold">You&apos;ve been invited</h1>
        <p className="mt-2 text-sm text-gray-400">
          {invite.organizationName} invited you to join as{" "}
          <span className="text-gray-200">{invite.role}</span>.
        </p>
        <Link
          href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}
          className="mt-6 block w-full rounded-2xl bg-white px-6 py-3 text-center font-medium text-black transition hover:opacity-80"
        >
          Log in to respond
        </Link>
      </Card>
    );
  }

  if (!isRecipient) {
    return (
      <Card>
        <h1 className="text-2xl font-bold">Not for this account</h1>
        <p className="mt-2 text-sm text-gray-400">
          This invitation is addressed to{" "}
          <span className="text-gray-200">{maskEmail(invite.email)}</span>, but you are signed in as{" "}
          <span className="text-gray-200">{user.email}</span>.
        </p>
        <p className="mt-3 text-xs text-gray-500">
          Log in with the invited account to respond, or decline from there.
        </p>
      </Card>
    );
  }

  if (user.organizationId === invite.organizationId) {
    return (
      <Card>
        <h1 className="text-2xl font-bold">Already a member</h1>
        <p className="mt-2 text-sm text-gray-400">
          You are already a member of {invite.organizationName}.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="text-2xl font-bold">Join {invite.organizationName}</h1>
      <p className="mt-2 text-sm text-gray-400">
        You&apos;ve been invited to join as{" "}
        <span className="text-gray-200">{invite.role}</span>.
      </p>
      <div className="mt-8">
        <InviteActions
          token={token}
          movesFromOrg={user.organizationId != null && user.organizationId !== invite.organizationId}
        />
      </div>
    </Card>
  );
}