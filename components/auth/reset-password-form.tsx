"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { resetPasswordAction } from "@/lib/auth/reset-actions";

function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <div className="text-sm text-red-400">{children}</div>;
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(resetPasswordAction, undefined);
  const token = useSearchParams().get("token") ?? "";

  return (
    <div>
      <h1 className="text-2xl font-bold">Choose a new password</h1>
      <p className="mt-2 text-sm text-gray-400">
        This link is single-use and expires in 15 minutes.
      </p>

      <form action={action} className="mt-8 space-y-4">
        <input type="hidden" name="token" value={token} />
        {state?.errors?._form && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {state.errors._form[0]}
            {!token && (
              <span className="mt-2 block">
                Use the link from your reset email, or{" "}
                <Link href="/forgot-password" className="underline">
                  request a new one
                </Link>
                .
              </span>
            )}
          </div>
        )}

        <div>
          <label htmlFor="password" className="mb-2 block text-sm text-gray-300">
            New password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none transition hover:border-white/20 focus:border-white/30"
          />
          <FieldError>{state?.errors?.password?.[0]}</FieldError>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-2xl bg-white px-6 py-3 font-medium text-black transition hover:opacity-80 disabled:opacity-50"
        >
          {pending ? "Resetting..." : "Reset password"}
        </button>
      </form>
    </div>
  );
}