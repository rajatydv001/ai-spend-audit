import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAudit, getAuditsByUser, createAuditSchema } from "@/lib/services/audit-service";
import { checkAuditLimit } from "@/lib/services/subscription-service";
import { createAuditLog } from "@/lib/services/audit-log";
import { rateLimit } from "@/lib/services/rate-limit";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const audits = await getAuditsByUser(session.user.id);
  return NextResponse.json(audits);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = request.headers.get("x-forwarded-for") || "anonymous";
  const rateCheck = rateLimit(`audit:${session.user.id}`, 10, 60000);
  if (!rateCheck.ok) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const withinLimit = await checkAuditLimit(session.user.id);
  if (!withinLimit) {
    return NextResponse.json(
      { error: "Audit limit reached. Upgrade your plan for more audits." },
      { status: 403 }
    );
  }

  const body = await request.json();
  const parsed = createAuditSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const audit = await createAudit(session.user.id, parsed.data);

  await createAuditLog({
    userId: session.user.id,
    action: "audit.created",
    entity: "audit",
    entityId: audit.id,
    ipAddress: ip,
  });

  return NextResponse.json(audit, { status: 201 });
}
