import "server-only";
import { cache } from "react";
import { getSession } from "@/lib/auth/session";
import { isSessionActive } from "@/lib/services/session-service";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";

export const getSessionUser = cache(async () => {
  const session = await getSession();
  if (!session?.userId) return null;
  // A revoked or expired session must not resolve a user, even though the JWT
  // itself is still signed and unexpired (logout / server-side invalidation).
  if (!(await isSessionActive(session))) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      role: true,
      isPlatformAdmin: true,
      onboarded: true,
      organizationId: true,
      subscriptionId: true,
    },
  });
  return user;
});

export async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session?.userId) {
    throw new ApiError("Unauthorized", 401);
  }
  if (!(await isSessionActive(session))) {
    throw new ApiError("Unauthorized", 401);
  }
  return session.userId;
}
