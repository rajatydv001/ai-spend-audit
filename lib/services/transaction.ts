import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

function isSerializationError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
    return true;
  }
  if (error instanceof Error && "kind" in (error as object)) {
    const kind = (error as { kind?: unknown }).kind;
    if (kind === "TransactionWriteConflict") return true;
  }
  const cause = (error as { cause?: { originalCode?: string; kind?: string } } | null)?.cause;
  if (cause && (cause.originalCode === "40001" || cause.kind === "TransactionWriteConflict")) {
    return true;
  }
  return false;
}

/**
 * Runs `fn` in a Serializable-isolated transaction and retries it when the
 * database aborts it with a serialization conflict (P2034 / TransactionWriteConflict),
 * which happens when two concurrent transactions contend over the same
 * count+create window. Count-then-insert limits are therefore race-safe: a
 * concurrent requester can never observe a stale count and slip past the limit.
 */
export async function withSerializableTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  { retries = 4 }: { retries?: number } = {}
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      lastError = error;
      if (!isSerializationError(error)) throw error;
    }
  }
  throw lastError;
}