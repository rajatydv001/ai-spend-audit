import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: { auditLog: { create: mocks.create } },
}));

import { createAuditLog } from "@/lib/services/audit-log";

const { create } = mocks;

beforeEach(() => {
  create.mockReset();
});

describe("createAuditLog", () => {
  it("persists the event with the given metadata", async () => {
    create.mockResolvedValue({ id: "log-1" });
    await createAuditLog({
      userId: "u1",
      action: "audit.created",
      entity: "audit",
      entityId: "a1",
      metadata: "{}",
      ipAddress: "127.0.0.1",
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        action: "audit.created",
        entity: "audit",
        entityId: "a1",
        metadata: "{}",
        ipAddress: "127.0.0.1",
      },
    });
  });

  it("never throws when the write fails (audit logging is best-effort)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    create.mockRejectedValue(new Error("db down"));

    await expect(
      createAuditLog({ action: "user.login", entity: "auth" })
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});