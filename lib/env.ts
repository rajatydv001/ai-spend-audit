import { z } from "zod";

export const envSchema = z
  .object({
    DATABASE_URL: z.string().url(),
    SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
    OPENAI_API_KEY: z.string().optional(),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_PUBLISHABLE_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_PRO_PRICE_ID: z.string().optional(),
    STRIPE_ENTERPRISE_PRICE_ID: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    TRUST_PROXY: z.string().optional(),
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === "production" && data.NEXT_PUBLIC_APP_URL === "http://localhost:3000") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["NEXT_PUBLIC_APP_URL"],
        message:
          "NEXT_PUBLIC_APP_URL must be set to your production origin (the localhost default is a dev safety net).",
      });
    }
    if (data.NODE_ENV === "production") {
      const hasUpstashUrl = Boolean(data.UPSTASH_REDIS_REST_URL);
      const hasUpstashToken = Boolean(data.UPSTASH_REDIS_REST_TOKEN);
      if (!hasUpstashUrl || !hasUpstashToken) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["UPSTASH_REDIS_REST_URL"],
          message:
            "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must both be set in production. " +
            "Rate limiting fails closed without a distributed limiter; the in-process memory backend is dev/test only.",
        });
      }
    }
    if ((Boolean(data.UPSTASH_REDIS_REST_URL) as boolean) !== (Boolean(data.UPSTASH_REDIS_REST_TOKEN) as boolean)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["UPSTASH_REDIS_REST_URL"],
        message:
          "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set together. " +
          "A partial Upstash configuration is never silently ignored.",
      });
    }
  });

export function parseEnv(input: NodeJS.ProcessEnv) {
  return envSchema.parse(input);
}

export const env = parseEnv(process.env);