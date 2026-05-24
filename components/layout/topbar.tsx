"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";

export default function Topbar() {
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const user = session?.user;

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-black/40 backdrop-blur-2xl">
      <div className="flex items-center justify-between px-6 py-4">
        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileNavOpen(!mobileNavOpen)}
          className="flex items-center justify-center rounded-xl border border-white/10 bg-white/5 p-2 md:hidden"
          aria-label="Toggle navigation"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-white">
            {mobileNavOpen ? (
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

        <div className="hidden md:block" />

        {/* User dropdown */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-gray-300 transition hover:bg-white/10"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500/20 text-xs font-bold text-blue-300">
              {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "U"}
            </div>
            <span className="hidden sm:block">{user?.name || user?.email}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={`transition ${menuOpen ? "rotate-180" : ""}`}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-2 w-48 overflow-hidden rounded-2xl border border-white/10 bg-black/80 backdrop-blur-2xl"
              >
                <div className="border-b border-white/10 px-4 py-3">
                  <p className="text-sm text-white">{user?.name || "User"}</p>
                  <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                </div>
                <button
                  onClick={() => signOut({ redirectTo: "/" })}
                  className="flex w-full items-center gap-2 px-4 py-3 text-sm text-red-400 transition hover:bg-white/5"
                >
                  Sign Out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Mobile nav dropdown */}
      <AnimatePresence>
        {mobileNavOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-white/10 bg-black/60 backdrop-blur-2xl md:hidden overflow-hidden"
          >
            <div className="flex flex-col gap-1 px-6 py-4">
              {[
                { href: "/dashboard", label: "Overview", icon: "📊" },
                { href: "/dashboard/audits", label: "Audits", icon: "🔍" },
                { href: "/dashboard/reports", label: "Reports", icon: "📄" },
                { href: "/dashboard/settings", label: "Settings", icon: "⚙️" },
              ].map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileNavOpen(false)}
                  className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-gray-300 transition hover:bg-white/5"
                >
                  <span className="text-lg">{item.icon}</span>
                  {item.label}
                </a>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
