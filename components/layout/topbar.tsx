"use client";

export default function Topbar({
  onToggleSidebar,
}: {
  onToggleSidebar: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-black/40 backdrop-blur-2xl">
      <div className="flex items-center justify-between px-6 py-4">
        {/* Mobile hamburger */}
        <button
          onClick={onToggleSidebar}
          className="flex items-center justify-center rounded-xl border border-white/10 bg-white/5 p-2 md:hidden"
          aria-label="Toggle sidebar navigation"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-white">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <div className="hidden md:block" />
      </div>
    </header>
  );
}
