import { NextResponse } from "next/server";
import { createAudit, getAuditsByUser, createAuditSchema } from "@/lib/services/audit-service";
import { checkAuditLimit } from "@/lib/services/subscription-service";
import { createAuditLog } from "@/lib/services/audit-log";
import { rateLimit } from "@/lib/services/rate-limit";
import { DEFAULT_USER_ID } from "@/lib/defaults";

export async function GET() {
  const audits = await getAuditsByUser("");
  return NextResponse.json(audits);
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") || "anonymous";
  const rateCheck = rateLimit("audit:anonymous", 10, 60000);
  if (!rateCheck.ok) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const withinLimit = await checkAuditLimit(DEFAULT_USER_ID);
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

  const audit = await createAudit(DEFAULT_USER_ID, parsed.data);

  await createAuditLog({ userId: DEFAULT_USER_ID,
    action: "audit.created",
    entity: "audit",
    entityId: audit.id,
    ipAddress: ip,
  });

  return NextResponse.json(audit, { status: 201 });
}
