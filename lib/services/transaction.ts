import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

/** How long to wait for a pooled connection before giving up (Prisma default: 2s). */
const TRANSACTION_MAX_WAIT_MS = 10_000;

/** How long the transaction body may run before it is aborted. */
const TRANSACTION_TIMEOUT_MS = 10_000;

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
 *
 * Timeouts are set explicitly rather than left at Prisma's defaults. The
 * database is a pooled serverless Postgres, where acquiring a connection for a
 * fresh interactive transaction can take a few seconds while the pool warms up.
 * Prisma's default `maxWait` of 2s is below that, and exceeding it fails with
 * "Unable to start a transaction in the given time" — turning a cold connection
 * into a spurious user-facing error. Both waits are bounded well inside the
 * serverless function budget so a genuinely stuck transaction still aborts
 * rather than hanging.
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
        maxWait: TRANSACTION_MAX_WAIT_MS,
        timeout: TRANSACTION_TIMEOUT_MS,
      });
    } catch (error) {
      lastError = error;
      if (!isSerializationError(error)) throw error;
    }
  }
  throw lastError;
}