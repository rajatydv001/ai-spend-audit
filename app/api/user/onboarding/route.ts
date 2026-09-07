import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createOrganization } from "@/lib/services/organization-service";
import { requireUserId } from "@/lib/auth/dal";
import { parseBody, withErrorHandling } from "@/lib/errors";
import { rateLimitOrThrow } from "@/lib/services/rate-limit";
import { onboardingSchema } from "@/lib/validation/schemas";

export const POST = withErrorHandling(async (request: Request) => {
  const userId = await requireUserId();
  await rateLimitOrThrow(`onboarding:${userId}`, 5, 60 * 60 * 1000);
  const { organizationName, currency, teamSize } = await parseBody(request, onboardingSchema);

  // Signup now creates the user's personal workspace, so onboarding must never
  // mint a second organization over an existing membership.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { organizationId: true },
  });

  if (organizationName && !user?.organizationId) {
    await createOrganization(organizationName, userId);
  }

  if (currency || teamSize) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        ...(currency ? { currency } : {}),
        ...(teamSize ? { teamSize } : {}),
      },
    });
  }

  if (organizationName || currency || teamSize) {
    await prisma.user.update({
      where: { id: userId },
      data: { onboarded: true },
    });
  }

  return NextResponse.json({ success: true });
});

export const runtime = "nodejs";
