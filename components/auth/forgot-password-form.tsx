"use client";

import { useActionState } from "react";
import { requestPasswordResetAction } from "@/lib/auth/reset-actions";

function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <div className="text-sm text-red-400">{children}</div>;
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, undefined);

  return (
    <div>
      <h1 className="text-2xl font-bold">Reset your password</h1>
      <p className="mt-2 text-sm text-gray-400">
        Enter your account email and we&apos;ll send you a password reset link.
      </p>

      <form action={action} className="mt-8 space-y-4">
        {state?.message && (
          <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
            {state.message}
          </div>
        )}

        <div>
          <label htmlFor="email" className="mb-2 block text-sm text-gray-300">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none transition hover:border-white/20 focus:border-white/30"
          />
          <FieldError>{state?.errors?.email?.[0]}</FieldError>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-2xl bg-white px-6 py-3 font-medium text-black transition hover:opacity-80 disabled:opacity-50"
        >
          {pending ? "Sending..." : "Send reset link"}
        </button>
      </form>
    </div>
  );
}