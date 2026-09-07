"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/layout/sidebar";
import Topbar from "@/components/layout/topbar";

export default function DashboardShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user?: {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
    role: string;
    isPlatformAdmin?: boolean;
  } | null;
}) {
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (isSidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isSidebarOpen]);

  return (
    <div className="flex min-h-screen bg-black">
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setSidebarOpen(false)}
        user={user ?? undefined}
      />
      <div className="flex flex-1 flex-col">
        <Topbar onToggleSidebar={() => setSidebarOpen((v) => !v)} user={user ?? undefined} />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
