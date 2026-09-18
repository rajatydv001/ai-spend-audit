"use client";

import { useState } from "react";
import Link from "next/link";
import { getAuthNav, type NavUser, isAuthenticated } from "@/lib/nav";

const anchorLinks = [
  { href: "#features", label: "Features" },
  { href: "#dashboard", label: "Dashboard" },
  { href: "#audit", label: "Audit" },
];

export default function Navbar({ user }: { user?: NavUser }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const authItems = getAuthNav(user ?? null);
  const signedIn = isAuthenticated(user ?? null);

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
          {anchorLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-gray-300 transition hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-3" data-testid="auth-nav">
            {authItems.map((item) =>
              item.kind === "cta" ? (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-2xl bg-white px-4 py-2 text-sm font-medium text-black transition hover:opacity-80"
                >
                  {item.label}
                </Link>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
                >
                  {item.label}
                </Link>
              )
            )}
          </div>

          {signedIn && user && (
            <div
              className="hidden h-8 w-8 items-center justify-center rounded-full bg-white/10 text-sm font-medium text-white sm:flex"
            >
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.image} alt={user.name ?? "User"} className="h-8 w-8 rounded-full object-cover" />
              ) : (
                (user.name?.[0] ?? user.email[0] ?? "?").toUpperCase()
              )}
            </div>
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
            {anchorLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-xl px-4 py-3 text-sm text-gray-300 transition hover:bg-white/5 hover:text-white"
              >
                {link.label}
              </a>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-white/10 pt-4" data-testid="auth-nav-mobile">
              {authItems.map((item) =>
                item.kind === "cta" ? (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className="rounded-xl bg-white px-4 py-3 text-center text-sm font-medium text-black transition hover:opacity-80"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-medium text-white transition hover:bg-white/10"
                  >
                    {item.label}
                  </Link>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}