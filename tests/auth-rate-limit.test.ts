import { describe, it, expect, beforeEach, vi } from "vitest";

const ipState = { value: "203.0.113.200" };

vi.mock("next/headers", () => ({
  headers: () => new Headers({ "x-forwarded-for": ipState.value }),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/auth/session", () => ({
  createSession: vi.fn(),
  deleteSession: vi.fn(),
}));

import { signupAction, loginAction } from "@/lib/auth/actions";
import { clearRateLimits } from "@/lib/services/rate-limit";

const emptyForm = () => new FormData();

describe("auth action rate limiting", () => {
  beforeEach(() => {
    clearRateLimits();
    ipState.value = "203.0.113.200";
    vi.clearAllMocks();
  });

  it("signup is allowed below the limit (5 attempts)", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await signupAction(undefined, emptyForm());
      expect(res?.errors?._form).toBeUndefined();
    }
  });

  it("signup returns a rate-limit form error on the 6th attempt from the same IP", async () => {
    for (let i = 0; i < 5; i++) {
      await signupAction(undefined, emptyForm());
    }
    const blocked = await signupAction(undefined, emptyForm());
    expect(blocked?.errors?._form?.[0]).toMatch(/Too many signup/);
  });

  it("signup is isolated per IP", async () => {
    for (let i = 0; i < 5; i++) {
      await signupAction(undefined, emptyForm());
    }
    const blocked = await signupAction(undefined, emptyForm());
    expect(blocked?.errors?._form?.[0]).toMatch(/Too many signup/);

    ipState.value = "198.51.100.77";
    const other = await signupAction(undefined, emptyForm());
    expect(other?.errors?._form).toBeUndefined();
  });

  it("signup recovers after the window expires", async () => {
    vi.useFakeTimers();
    try {
      for (let i = 0; i < 5; i++) {
        await signupAction(undefined, emptyForm());
      }
      expect(
        (await signupAction(undefined, emptyForm()))?.errors?._form?.[0]
      ).toMatch(/Too many signup/);

      vi.setSystemTime(Date.now() + 15 * 60 * 1000 + 1);
      const res = await signupAction(undefined, emptyForm());
      expect(res?.errors?._form).toBeUndefined();
    } finally {
      vi.useRealTimers();
      clearRateLimits();
    }
  });

  it("login is allowed below the limit (10 attempts)", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await loginAction(undefined, emptyForm());
      expect(res?.errors?._form).toBeUndefined();
    }
  });

  it("login returns a rate-limit form error on the 11th attempt from the same IP", async () => {
    for (let i = 0; i < 10; i++) {
      await loginAction(undefined, emptyForm());
    }
    const blocked = await loginAction(undefined, emptyForm());
    expect(blocked?.errors?._form?.[0]).toMatch(/Too many login/);
  });

  it("does not leak internal rate-limit details", async () => {
    for (let i = 0; i < 10; i++) {
      await loginAction(undefined, emptyForm());
    }
    const blocked = await loginAction(undefined, emptyForm());
    expect(blocked?.errors?._form?.[0]).toMatch(/Too many login/);
    expect(JSON.stringify(blocked)).not.toMatch(/count|resetAt|remaining|limit/);
  });
});
