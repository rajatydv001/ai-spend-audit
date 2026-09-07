import { describe, it, expect, vi } from "vitest";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import {
  ApiError,
  badRequest,
  notFound,
  conflict,
  unauthorized,
  forbidden,
  internalError,
  parseBody,
  toApiResponse,
  withErrorHandling,
} from "@/lib/errors";
import { z } from "zod";

describe("ApiError helpers", () => {
  it("creates errors with the correct status codes", () => {
    expect(badRequest().statusCode).toBe(400);
    expect(notFound().statusCode).toBe(404);
    expect(conflict().statusCode).toBe(409);
    expect(unauthorized().statusCode).toBe(401);
    expect(forbidden().statusCode).toBe(403);
    expect(internalError().statusCode).toBe(500);
  });

  it("carries custom details", () => {
    const err = new ApiError("Validation failed", 400, { field: ["x"] });
    expect(err.details).toEqual({ field: ["x"] });
    expect(err.message).toBe("Validation failed");
  });
});

describe("toApiResponse", () => {
  it("maps ApiError status and message", async () => {
    const res = toApiResponse(new ApiError("Nope", 404));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Nope" });
  });

  it("includes details when present", async () => {
    const res = toApiResponse(new ApiError("Bad", 400, { a: [1] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Bad", details: { a: [1] } });
  });

  it("maps a ZodError to 400 with flattened details", async () => {
    const schema = z.object({ name: z.string() });
    const res = toApiResponse(schema.safeParse({}).error!);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details).toBeDefined();
  });

  it("maps Prisma P2002 to 409", async () => {
    const err = new Prisma.PrismaClientKnownRequestError("dup", {
      code: "P2002",
      clientVersion: "1",
    });
    const res = toApiResponse(err);
    expect(res.status).toBe(409);
  });

  it("maps Prisma P2025 to 404", async () => {
    const err = new Prisma.PrismaClientKnownRequestError("missing", {
      code: "P2025",
      clientVersion: "1",
    });
    const res = toApiResponse(err);
    expect(res.status).toBe(404);
  });

  it("maps Prisma P2034 (serialization conflict) to a retryable 409", async () => {
    const err = new Prisma.PrismaClientKnownRequestError("conflict", {
      code: "P2034",
      clientVersion: "1",
    });
    const res = toApiResponse(err);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/retry/i);
  });

  it("masks unknown errors as generic 500 without leaking internals", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = toApiResponse(new Error("super secret db password: hunter2"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "Internal server error" });
    expect(JSON.stringify(body)).not.toContain("hunter2");
    consoleSpy.mockRestore();
  });
});

describe("parseBody", () => {
  const schema = z.object({ name: z.string().min(1) });

  it("parses valid JSON against the schema", async () => {
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ name: "ok" }),
    });
    await expect(parseBody(req, schema)).resolves.toEqual({ name: "ok" });
  });

  it("throws 400 ApiError on malformed JSON", async () => {
    const req = new Request("http://x", { method: "POST", body: "{not json" });
    const err = await parseBody(req, schema).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe("Invalid JSON body");
  });

  it("throws 400 Validation failed on schema mismatch", async () => {
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ name: "" }),
    });
    const err = await parseBody(req, schema).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe("Validation failed");
  });

  it("rejects an oversized content-length header with 413 before parsing", async () => {
    const req = new Request("http://x", {
      method: "POST",
      headers: { "content-length": String(1024 * 1024) },
      body: JSON.stringify({ name: "ok" }),
    });
    const err = await parseBody(req, schema).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(413);
  });

  it("rejects an oversized streamed body with 413 mid-read", async () => {
    const big = JSON.stringify({ name: "x".repeat(300 * 1024) });
    const req = new Request("http://x", { method: "POST", body: big });
    const err = await parseBody(req, schema).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(413);
  });
});

describe("withErrorHandling", () => {
  const req = new Request("http://x");
  const ctx = { params: Promise.resolve({}) };

  it("passes through a returned NextResponse", async () => {
    const handler = withErrorHandling(async () => NextResponse.json({ ok: 1 }, { status: 202 }));
    const res = (await handler(req, ctx)) as NextResponse;
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: 1 });
  });

  it("converts a thrown ApiError to its response", async () => {
    const handler = withErrorHandling(async () => {
      throw forbidden("Denied");
    });
    const res = await handler(req, ctx);
    expect(res.status).toBe(403);
    expect(await (res as Response).json()).toEqual({ error: "Denied" });
  });

  it("converts a thrown validation ApiError including details", async () => {
    const handler = withErrorHandling(async () => {
      throw badRequest("Validation failed");
    });
    const res = await handler(req, ctx);
    expect(res.status).toBe(400);
  });

  it("returns a success JSON body for raw object returns", async () => {
    const handler = withErrorHandling(async () => ({ hello: "world" }));
    const res = await handler(req, ctx);
    expect(res.status).toBe(200);
    expect(await (res as Response).json()).toEqual({ hello: "world" });
  });

  it("never fakes success when a handler returns nothing (undefined -> 500)", async () => {
    const handler = withErrorHandling(async () => undefined);
    const res = await handler(req, ctx);
    expect(res.status).toBe(500);
    expect((await (res as Response).json()).error).toBe("Internal server error");
  });
});
