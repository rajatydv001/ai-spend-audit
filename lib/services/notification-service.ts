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

export async function getNotifications(userId: string) {
  return prisma.notificationLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
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
