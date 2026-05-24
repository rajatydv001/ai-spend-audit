"use client";

import { motion, type Variants } from "framer-motion";

type SkeletonVariant = "card" | "chart" | "metric" | "text" | "badge";

interface LoadingSkeletonProps {
  variant: SkeletonVariant;
  count?: number;
}

const shimmerVariants: Variants = {
  hidden: { backgroundPosition: "200% 0" },
  visible: {
    backgroundPosition: "-200% 0",
    transition: { repeat: Infinity, duration: 1.5, ease: "linear" },
  },
};

function ShimmerBlock({ className }: { className: string }) {
  return (
    <motion.div
      variants={shimmerVariants}
      initial="hidden"
      animate="visible"
      className={`rounded-xl bg-gradient-to-r from-white/[0.04] via-white/[0.10] to-white/[0.04] bg-[length:200%_100%] ${className}`}
    />
  );
}

function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl">
      <div className="flex items-center justify-between mb-4">
        <ShimmerBlock className="h-3 w-24" />
        <ShimmerBlock className="h-6 w-6 rounded-full" />
      </div>
      <ShimmerBlock className="h-8 w-32 mt-2" />
      <ShimmerBlock className="h-2 w-full mt-4" />
      <ShimmerBlock className="h-2 w-3/4 mt-2" />
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl">
      <ShimmerBlock className="h-5 w-40 mb-6" />
      <ShimmerBlock className="h-64 w-full rounded-xl" />
    </div>
  );
}

function MetricSkeleton() {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-center">
      <ShimmerBlock className="h-3 w-20 mx-auto mb-2" />
      <ShimmerBlock className="h-6 w-24 mx-auto" />
    </div>
  );
}

function TextSkeleton() {
  return (
    <div className="space-y-3">
      <ShimmerBlock className="h-4 w-full" />
      <ShimmerBlock className="h-4 w-5/6" />
      <ShimmerBlock className="h-4 w-4/6" />
    </div>
  );
}

function BadgeSkeleton() {
  return <ShimmerBlock className="h-6 w-20 rounded-full" />;
}

const skeletons: Record<SkeletonVariant, React.ElementType> = {
  card: CardSkeleton,
  chart: ChartSkeleton,
  metric: MetricSkeleton,
  text: TextSkeleton,
  badge: BadgeSkeleton,
};

export default function LoadingSkeleton({ variant, count = 1 }: LoadingSkeletonProps) {
  const Component = skeletons[variant];
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <Component key={i} />
      ))}
    </>
  );
}
