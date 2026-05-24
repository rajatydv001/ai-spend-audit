"use client";

type BadgeVariant = "success" | "warning" | "error" | "info" | "neutral";

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  success: "border-green-500/30 bg-green-500/10 text-green-300",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  error: "border-red-500/30 bg-red-500/10 text-red-300",
  info: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  neutral: "border-white/10 bg-white/5 text-gray-300",
};

const dotStyles: Record<BadgeVariant, string> = {
  success: "bg-green-400",
  warning: "bg-amber-400",
  error: "bg-red-400",
  info: "bg-blue-400",
  neutral: "bg-gray-400",
};

export default function Badge({ variant, children, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${variantStyles[variant]} ${className}`}
    >
      <span className={`h-2 w-2 rounded-full ${dotStyles[variant]}`} />
      {children}
    </span>
  );
}
