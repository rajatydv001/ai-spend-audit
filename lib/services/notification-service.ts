import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import type { NotificationType } from "@prisma/client";

export async function createNotificationLog(
  userId: string,
  type: NotificationType,
  title: string,
  message: string
) {
  return prisma.notificationLog.create({
    data: { userId, type, title, message },
  });
}

export async function getUnreadNotificationCount(userId: string) {
  return prisma.notificationLog.count({
    where: { userId, read: false },
  });
}

export async function getNotifications(
  userId: string,
  take: number = 50,
  cursor?: string
) {
  return prisma.notificationLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
}

export async function markNotificationRead(id: string, userId: string) {
  return prisma.notificationLog.updateMany({
    where: { id, userId },
    data: { read: true },
  });
}

export async function markAllNotificationsRead(userId: string) {
  return prisma.notificationLog.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });
}

export async function sendEmail(to: string, subject: string, html: string) {
  if (!env.RESEND_API_KEY) return;

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(env.RESEND_API_KEY);
    await resend.emails.send({
      from: "AI Spend Audit <noreply@ai-spend-audit.com>",
      to,
      subject,
      html,
    });
  } catch (error) {
    console.error("Failed to send email:", error);
  }
}

export type InviteEmailStatus = "sent" | "not_configured" | "delivery_failed";

/**
 * Delivers a team-invitation email and reports the real outcome. Never claims
 * an email was sent when it was not: if the Resend key is missing this returns
 * `not_configured`, and if the provider call fails it returns
 * `delivery_failed`. The invite URL is safe to share manually either way.
 */
export async function sendInviteEmail(args: {
  to: string;
  inviteUrl: string;
  organizationName: string;
  role: string;
  senderName?: string | null;
}): Promise<{ status: InviteEmailStatus }> {
  if (!env.RESEND_API_KEY) {
    console.error(
      "[email] RESEND_API_KEY is not configured; team-invitation email NOT sent for " +
        args.to +
        ". Share the invite URL manually."
    );
    return { status: "not_configured" };
  }

  const senderLine = args.senderName ? `, by ${args.senderName}` : "";
  const roleLabel = args.role === "ADMIN" ? "an Admin" : args.role === "ANALYST" ? "an Analyst" : "a Viewer";

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(env.RESEND_API_KEY);
    await resend.emails.send({
      from: "AI Spend Audit <noreply@ai-spend-audit.com>",
      to: args.to,
      subject: `You're invited to join ${args.organizationName} on AI Spend Audit`,
      html: `
        <h2>You've been invited to ${args.organizationName}</h2>
        <p>You've been invited to join <strong>${args.organizationName}</strong> as <strong>${roleLabel}</strong>${senderLine}.</p>
        <p>This invitation expires in 7 days and can be used once.</p>
        <p><a href="${args.inviteUrl}">Accept the invitation</a></p>
        <p>If the button does not work, copy and paste this link into your browser:</p>
        <p><a href="${args.inviteUrl}">${args.inviteUrl}</a></p>
        <p style="color:#888;font-size:12px">AI Spend Audit — AI cost optimization for your teams.</p>
      `,
    });
    return { status: "sent" };
  } catch (error) {
    console.error("Failed to send team-invitation email:", error);
    return { status: "delivery_failed" };
  }
}

export async function sendWeeklyDigest(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      audits: { orderBy: { createdAt: "desc" }, take: 1 },
      subscription: true,
      notifications: { where: { type: "WEEKLY_DIGEST" } },
    },
  });
  if (!user) return;

  const latestAudit = user.audits[0];
  const totalSavings = latestAudit?.totalSavings || 0;
  const totalSpend = latestAudit?.totalCurrentSpend || 0;

  const notification = await createNotificationLog(
    userId,
    "WEEKLY_DIGEST",
    "Weekly Savings Digest",
    `Your total monthly spend is $${totalSpend.toLocaleString()} with potential savings of $${totalSavings.toLocaleString()}/month.`
  );

  if (user.email && user.notifications[0]?.enabled) {
    await sendEmail(
      user.email,
      "Your Weekly AI Spend Digest",
      `<h2>Weekly AI Spend Digest</h2>
       <p>Current monthly spend: <strong>$${totalSpend.toLocaleString()}</strong></p>
       <p>Potential savings: <strong>$${totalSavings.toLocaleString()}/month</strong></p>
       <p><a href="${env.NEXT_PUBLIC_APP_URL}/dashboard">View Dashboard</a></p>`
    );
  }

  return notification;
}

export async function sendOverspendingAlert(userId: string, toolName: string, spend: number, threshold: number) {
  const [user, pref] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
    prisma.notification.findUnique({
      where: { userId_type: { userId, type: "OVERSPENDING_ALERT" } },
    }),
  ]);

  const notification = await createNotificationLog(
    userId,
    "OVERSPENDING_ALERT",
    `Overspending Alert: ${toolName}`,
    `${toolName} is spending $${spend.toLocaleString()}/month, exceeding your ${threshold} threshold.`
  );

  if (user?.email && pref?.enabled !== false) {
    await sendEmail(
      user.email,
      `Overspending Alert: ${toolName}`,
      `<h2>Overspending Alert</h2>
       <p><strong>${toolName}</strong> is spending <strong>$${spend.toLocaleString()}/month</strong></p>
       <p>This exceeds your threshold of $${threshold}.</p>
       <p><a href="${env.NEXT_PUBLIC_APP_URL}/dashboard/audits">Review Options</a></p>`
    );
  }

  return notification;
}

export async function sendOptimizationReminder(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      audits: { orderBy: { createdAt: "desc" }, take: 1 },
      notifications: { where: { type: "OPTIMIZATION_REMINDER" } },
    },
  });
  if (!user) return;

  const lastAudit = user.audits[0];
  const daysSince = lastAudit
    ? Math.floor((Date.now() - new Date(lastAudit.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  if (daysSince < 30) return;

  const notification = await createNotificationLog(
    userId,
    "OPTIMIZATION_REMINDER",
    "Optimization Reminder",
    lastAudit
      ? `It's been ${daysSince} days since your last audit. Run a new audit to find more savings.`
      : "Run your first AI spend audit to start saving money."
  );

  if (user.email && user.notifications[0]?.enabled !== false) {
    await sendEmail(
      user.email,
      "Time for an AI Spend Optimization Review",
      `<h2>Optimization Reminder</h2>
       <p>${lastAudit ? `It's been ${daysSince} days since your last audit.` : "Ready to optimize your AI spend?"}</p>
       <p><a href="${env.NEXT_PUBLIC_APP_URL}/#audit">Run New Audit</a></p>`
    );
  }

  return notification;
}

export async function saveNotificationPreference(
  userId: string,
  type: NotificationType,
  enabled: boolean
) {
  return prisma.notification.upsert({
    where: { userId_type: { userId, type } },
    create: { userId, type, enabled },
    update: { enabled },
  });
}

export async function getNotificationPreferences(userId: string) {
  return prisma.notification.findMany({
    where: { userId },
  });
}
