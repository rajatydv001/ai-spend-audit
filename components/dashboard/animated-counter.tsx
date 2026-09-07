"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "framer-motion";

interface AnimatedCounterProps {
  from?: number;
  to: number;
  duration?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
  formatter?: (value: number) => string;
}

/**
 * Decides whether the counter still needs to animate toward `to`.
 *
 * We only treat a target as already reached once the animation has actually
 * COMPLETED (onComplete). Marking it as reached when the animation merely
 * *starts* breaks under React StrictMode, because the effect is mounted,
 * cleaned up (stopping the animation) and mounted again before the first
 * pass finishes. In that case the second pass would otherwise skip the
 * animation and leave the counter stuck at 0.
 */
export const shouldAnimate = (shownTarget: number, to: number): boolean => shownTarget !== to;

export default function AnimatedCounter({
  from = 0,
  to,
  duration = 1.5,
  suffix = "",
  prefix = "",
  className = "",
  formatter,
}: AnimatedCounterProps) {
  const [displayText, setDisplayText] = useState(() => formatter?.(from) ?? String(Math.round(from)));
  const shownTarget = useRef(from);

  useEffect(() => {
    if (!shouldAnimate(shownTarget.current, to)) return;

    setDisplayText(formatter?.(from) ?? String(Math.round(from)));

    const controls = animate(from, to, {
      duration,
      ease: "easeOut",
      onUpdate: (v) => {
        const rounded = Math.round(v);
        setDisplayText(formatter?.(rounded) ?? String(rounded));
      },
      onComplete: () => {
        shownTarget.current = to;
        setDisplayText(formatter?.(to) ?? String(Math.round(to)));
      },
    });

    return controls.stop;
  }, [to, duration, from, formatter]);

  return (
    <span className={className}>
      {prefix}{displayText}{suffix}
    </span>
  );
}
