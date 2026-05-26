"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ROUTES } from "@/lib/constants";

const mainNav = [
  { href: ROUTES.DASHBOARD, label: "Dashboard", icon: "📊" },
  { href: ROUTES.AUDITS, label: "Audits", icon: "🔍" },
  { href: ROUTES.REPORTS, label: "Reports", icon: "📄" },
];

const analyticsNav = [
  { href: "/dashboard/analytics", label: "Analytics", icon: "📈" },
  { href: "/dashboard/pricing", label: "Pricing Intel", icon: "💰" },
];

const miscNav = [
  { href: "/dashboard/billing", label: "Billing", icon: "💳" },
  { href: "/dashboard/notifications", label: "Notifications", icon: "🔔" },
];

const bottomNav = [
  { href: "/dashboard/admin", label: "Admin", icon: "🛡️" },
  { href: ROUTES.SETTINGS, label: "Settings", icon: "⚙️" },
];

const actions = [
  { href: "/dashboard?new-audit=1", label: "New Audit", icon: "✨" },
];

function NavSection({ items, onClick }: { items: readonly { readonly href: string; readonly label: string; readonly icon: string }[]; onClick?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      {items.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClick}
            className={`relative flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
              isActive ? "text-white" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {isActive && (
              <motion.span
                layoutId="sidebar-indicator"
                className="absolute inset-0 rounded-xl bg-white/[0.08]"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-3">
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </span>
          </Link>
        );
      })}
    </>
  );
}

function SidebarContent({ onNavClick }: { onNavClick?: () => void }) {
  return (
    <>
      <div className="flex items-center gap-3 border-b border-white/10 px-6 py-5">
        <div className="h-3 w-3 rounded-full bg-green-400" />
        <span className="text-lg font-bold text-white">AI Spend Audit</span>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-6">
        <div>
          <p className="px-4 pb-1 text-xs font-medium uppercase tracking-wider text-gray-600">Main</p>
          <NavSection items={mainNav} onClick={onNavClick} />
        </div>

        <div>
          <p className="px-4 pb-1 text-xs font-medium uppercase tracking-wider text-gray-600">Insights</p>
          <NavSection items={analyticsNav} onClick={onNavClick} />
        </div>

        <div>
          <p className="px-4 pb-1 text-xs font-medium uppercase tracking-wider text-gray-600">Account</p>
          <NavSection items={miscNav} onClick={onNavClick} />
        </div>

        <div>
          <p className="px-4 pb-1 text-xs font-medium uppercase tracking-wider text-gray-600">Actions</p>
          <NavSection items={actions} onClick={onNavClick} />
        </div>

        <div className="pt-2">
          <NavSection items={bottomNav} onClick={onNavClick} />
        </div>
      </nav>

      <div className="border-t border-white/10 px-6 py-4">
        <p className="text-xs text-gray-500">AI Spend Audit &copy; 2026</p>
      </div>
    </>
  );
}

export default function Sidebar({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 md:hidden"
          >
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 400, damping: 35 }}
              className="fixed inset-y-0 left-0 z-10 flex w-64 flex-col border-r border-white/10 bg-black/40 backdrop-blur-2xl"
            >
              <SidebarContent onNavClick={onClose} />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop sidebar */}
      <aside className="hidden w-64 flex-shrink-0 border-r border-white/10 bg-black/40 backdrop-blur-2xl md:flex md:flex-col">
        <SidebarContent />
      </aside>
    </>
  );
}
