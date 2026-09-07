import { NextResponse } from "next/server";
import { ZodError, type ZodType, type infer as zInfer } from "zod";
import { Prisma } from "@prisma/client";

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function badRequest(message = "Invalid request") {
  return new ApiError(message, 400);
}

/**
 * Reject oversized request bodies up front (before JSON.parse). Guards all
 * routes parsed through `parseBody` against unbounded memory use.
 */
export const MAX_BODY_BYTES = 256 * 1024;

export async function parseBody<TSchema extends ZodType>(
  request: Request,
  schema: TSchema
): Promise<zInfer<TSchema>> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const length = Number(contentLength);
    if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
      throw new ApiError("Request body too large", 413);
    }
  }
  return parseBodyBuffer(request, schema);
}

async function readBodyWithLimit(request: Request): Promise<string> {
  if (!request.body) {
    return await request.text();
  }
  const parts: Uint8Array[] = [];
  let size = 0;
  const reader = request.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        size += value.byteLength;
        if (size > MAX_BODY_BYTES) {
          await reader.cancel();
          throw new ApiError("Request body too large", 413);
        }
        parts.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(parts).toString("utf8");
}

async function parseBodyBuffer<TSchema extends ZodType>(
  request: Request,
  schema: TSchema
): Promise<zInfer<TSchema>> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readBodyWithLimit(request));
  } catch (error) {
    // A 413 from the size guard must not be treated as malformed JSON.
    if (error instanceof ApiError) throw error;
    throw badRequest("Invalid JSON body");
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const details = result.error.flatten();
    throw new ApiError("Validation failed", 400, details);
  }
  return result.data;
}

export function notFound(message = "Not found") {
  return new ApiError(message, 404);
}

export function conflict(message = "Resource already exists") {
  return new ApiError(message, 409);
}

export function unauthorized(message = "Unauthorized") {
  return new ApiError(message, 401);
}

export function forbidden(message = "Forbidden") {
  return new ApiError(message, 403);
}

export function internalError(message = "Internal server error") {
  return new ApiError(message, 500);
}

/**
 * Centralized error -> HTTP response conversion.
 * Map the error to an ApiError-shaped response. Also accepts our ApiError directly.
 */
export function toApiResponse(error: unknown): NextResponse {
  const { statusCode, message, details } = normalizeError(error);
  return NextResponse.json(
    details !== undefined ? { error: message, details } : { error: message },
    { status: statusCode }
  );
}

function normalizeError(error: unknown): {
  statusCode: number;
  message: string;
  details?: unknown;
} {
  if (error instanceof ApiError) {
    return { statusCode: error.statusCode, message: error.message, details: error.details };
  }

  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      message: "Validation failed",
      details: error.flatten(),
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return { statusCode: 409, message: "A resource with this value already exists" };
    }
    if (error.code === "P2025") {
      return { statusCode: 404, message: "The requested resource was not found" };
    }
    if (error.code === "P2034") {
      return { statusCode: 409, message: "Concurrent request conflict — please retry." };
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return { statusCode: 400, message: "Invalid request" };
  }

  // Driver adapters surface serialization conflicts (originalCode 40001 /
  // kind "TransactionWriteConflict") as an opaque engine error; treat it as a
  // retryable 409 rather than a 500.
  const cause = (error as { cause?: { originalCode?: string; kind?: string } } | null)?.cause;
  if (cause && (cause.originalCode === "40001" || cause.kind === "TransactionWriteConflict")) {
    return { statusCode: 409, message: "Concurrent request conflict — please retry." };
  }

  // Never expose internals to the client.
  console.error("[api-error]", error);
  return { statusCode: 500, message: "Internal server error" };
}

type HandlerResult = NextResponse | Response | void | unknown;

type RouteContext = { params: Promise<Record<string, string>> };

/**
 * Wraps a route handler so any thrown error is converted to a consistent JSON response.
 * Authentication/RBAC functions throw ApiError subclasses which map to 401/403/404.
 * Validation errors (Zod), Prisma conflicts, and unexpected errors are handled centrally.
 */
export function withErrorHandling<
  TArgs extends unknown[],
  TContext extends RouteContext | undefined = RouteContext
>(
  handler: (
    request: Request,
    context: TContext,
    ...rest: TArgs
  ) => Promise<HandlerResult>
) {
  return async (
    request: Request,
    context: TContext,
    ...rest: TArgs
  ): Promise<NextResponse | Response> => {
    try {
      const result = await handler(request, context, ...rest);
      if (result instanceof NextResponse || result instanceof Response) {
        return result;
      }
      // Fallback for handlers that return raw objects. A handler that returns
      // NOTHING is a bug — never fake a success response for it.
      if (result === undefined) {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
      }
      return NextResponse.json(result === null ? { success: true } : result);
    } catch (error) {
      return toApiResponse(error);
    }
  };
}
