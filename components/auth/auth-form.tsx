"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { loginAction, signupAction } from "@/lib/auth/actions";

function ErrorList({ messages }: { messages?: string[] }) {
  if (!messages || messages.length === 0) return null;
  return (
    <ul className="mt-1 space-y-1 text-sm text-red-400">
      {messages.map((m) => (
        <li key={m}>{m}</li>
      ))}
    </ul>
  );
}

function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <div className="text-sm text-red-400">{children}</div>;
}

// `next` (e.g. "/invite/{token}") is carried through the form so the auth
// action redirects the user back to where they were going instead of dropping
// them on the dashboard.
function NextInput({ value }: { value: string }) {
  if (!value) return null;
  return <input type="hidden" name="next" value={value} />;
}

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, undefined);
  const next = useSearchParams().get("next") ?? "";

  return (
    <div>
      <h1 className="text-2xl font-bold">Welcome back</h1>
      <p className="mt-2 text-sm text-gray-400">
        Sign in to access your dashboard and reports.
      </p>

      <form action={action} className="mt-8 space-y-4">
        <NextInput value={next} />
        {state?.errors?._form && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {state.errors._form[0]}
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
          <FieldError>
            <ErrorList messages={state?.errors?.email} />
          </FieldError>
        </div>

        <div>
          <label htmlFor="password" className="mb-2 block text-sm text-gray-300">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none transition hover:border-white/20 focus:border-white/30"
          />
          <FieldError>
            <ErrorList messages={state?.errors?.password} />
          </FieldError>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-2xl bg-white px-6 py-3 font-medium text-black transition hover:opacity-80 disabled:opacity-50"
        >
          {pending ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Don&apos;t have an account?{" "}
        <Link
          href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="text-gray-300 hover:text-white"
        >
          Sign up
        </Link>
      </p>
    </div>
  );
}

export function SignupForm() {
  const [state, action, pending] = useActionState(signupAction, undefined);
  const next = useSearchParams().get("next") ?? "";

  return (
    <div>
      <h1 className="text-2xl font-bold">Create your account</h1>
      <p className="mt-2 text-sm text-gray-400">
        Start auditing your AI spend in minutes.
      </p>

      <form action={action} className="mt-8 space-y-4">
        <NextInput value={next} />
        {state?.errors?._form && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {state.errors._form[0]}
          </div>
        )}

        <div>
          <label htmlFor="name" className="mb-2 block text-sm text-gray-300">
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            required
            className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none transition hover:border-white/20 focus:border-white/30"
          />
          <FieldError>
            <ErrorList messages={state?.errors?.name} />
          </FieldError>
        </div>

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
          <FieldError>
            <ErrorList messages={state?.errors?.email} />
          </FieldError>
        </div>

        <div>
          <label htmlFor="password" className="mb-2 block text-sm text-gray-300">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none transition hover:border-white/20 focus:border-white/30"
          />
          <FieldError>
            <ErrorList messages={state?.errors?.password} />
          </FieldError>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-2xl bg-white px-6 py-3 font-medium text-black transition hover:opacity-80 disabled:opacity-50"
        >
          {pending ? "Creating account..." : "Create Account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Already have an account?{" "}
        <Link
          href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="text-gray-300 hover:text-white"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
