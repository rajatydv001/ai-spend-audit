"use client";

import { useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";

export default function Navbar() {
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);

  const scrollToAudit = useCallback(() => {
    document.getElementById("audit")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/40 backdrop-blur-2xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 rounded-full bg-green-400" />
          <h1 className="text-xl font-bold tracking-tight text-white">
            AI Spend Audit
          </h1>
        </div>

        <nav className="hidden items-center gap-8 md:flex">
          <a href="#features" className="text-sm text-gray-300 transition hover:text-white">Features</a>
          <a href="#dashboard" className="text-sm text-gray-300 transition hover:text-white">Dashboard</a>
          <a href="#audit" className="text-sm text-gray-300 transition hover:text-white">Audit</a>
        </nav>

        <div className="flex items-center gap-3">
          {session ? (
            <>
              <Link
                href="/dashboard"
                className="rounded-2xl bg-white px-5 py-2 text-sm font-medium text-black transition hover:opacity-80"
              >
                Dashboard
              </Link>
              <button
                onClick={() => signOut({ redirectTo: "/" })}
                className="rounded-2xl border border-white/10 px-5 py-2 text-sm font-medium text-gray-300 transition hover:bg-white/5 sm:block"
              >
                Sign Out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="rounded-2xl border border-white/10 px-5 py-2 text-sm font-medium text-gray-300 transition hover:bg-white/5 sm:block"
              >
                Sign In
              </Link>
              <button
                onClick={scrollToAudit}
                className="hidden rounded-2xl bg-white px-5 py-2 text-sm font-medium text-black transition hover:opacity-80 sm:block"
              >
                Audit Now
              </button>
            </>
          )}

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="flex items-center justify-center rounded-xl border border-white/10 bg-white/5 p-2 md:hidden"
            aria-label="Toggle navigation"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-white">
              {mobileOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile nav dropdown */}
      {mobileOpen && (
        <div className="border-t border-white/10 bg-black/60 backdrop-blur-2xl md:hidden">
          <div className="flex flex-col gap-1 px-6 py-4">
            <a
              href="#features"
              onClick={() => setMobileOpen(false)}
              className="rounded-xl px-4 py-3 text-sm text-gray-300 transition hover:bg-white/5 hover:text-white"
            >
              Features
            </a>
            <a
              href="#dashboard"
              onClick={() => setMobileOpen(false)}
              className="rounded-xl px-4 py-3 text-sm text-gray-300 transition hover:bg-white/5 hover:text-white"
            >
              Dashboard
            </a>
            <a
              href="#audit"
              onClick={() => setMobileOpen(false)}
              className="rounded-xl px-4 py-3 text-sm text-gray-300 transition hover:bg-white/5 hover:text-white"
            >
              Audit
            </a>
            {session ? (
              <>
                <Link
                  href="/dashboard"
                  onClick={() => setMobileOpen(false)}
                  className="mt-2 rounded-2xl bg-white px-5 py-2.5 text-center text-sm font-medium text-black transition hover:opacity-80"
                >
                  Dashboard
                </Link>
                <button
                  onClick={() => { setMobileOpen(false); signOut({ redirectTo: "/" }); }}
                  className="mt-2 rounded-2xl border border-white/10 px-5 py-2.5 text-center text-sm font-medium text-gray-300 transition hover:bg-white/5"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/sign-in"
                  onClick={() => setMobileOpen(false)}
                  className="mt-2 rounded-2xl border border-white/10 px-5 py-2.5 text-center text-sm font-medium text-gray-300 transition hover:bg-white/5"
                >
                  Sign In
                </Link>
                <button
                  onClick={() => { scrollToAudit(); setMobileOpen(false); }}
                  className="mt-2 rounded-2xl bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:opacity-80 sm:hidden"
                >
                  Audit Now
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
