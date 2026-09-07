export interface SeedAdminDecision {
  allowed: boolean;
  reason?: string;
}

/**
 * Elevated seed account handling is environment-explicit:
 * - Development/test keeps a convenient default password, exactly as before —
 *   fixtures and local convenience are unchanged.
 * - In production (NODE_ENV=production) the elevated ADMIN seed is NOT created
 *   unless an operator explicitly opts in with ALLOW_ADMIN_SEED_IN_PRODUCTION=true
 *   AND supplies a SEED_ADMIN_PASSWORD (the fixed dev default is refused). This
 *   stops a freshly deployed production DB from silently gaining a known-admin.
 */
export function shouldSeedAdmin(
  processEnv: NodeJS.ProcessEnv
): SeedAdminDecision {
  if (processEnv.NODE_ENV === "production") {
    if (processEnv.ALLOW_ADMIN_SEED_IN_PRODUCTION !== "true") {
      return {
        allowed: false,
        reason:
          "Refusing to seed an elevated ADMIN account in production. Set ALLOW_ADMIN_SEED_IN_PRODUCTION=true to override.",
      };
    }
    if (!processEnv.SEED_ADMIN_PASSWORD) {
      return {
        allowed: false,
        reason: "SEED_ADMIN_PASSWORD is required to seed an admin account in production.",
      };
    }
  }
  return { allowed: true };
}