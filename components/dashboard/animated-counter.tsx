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
  const prevTo = useRef(from);

  useEffect(() => {
    if (to === prevTo.current) return;
    prevTo.current = to;

    const controls = animate(from, to, {
      duration,
      ease: "easeOut",
      onUpdate: (v) => {
        const rounded = Math.round(v);
        setDisplayText(formatter?.(rounded) ?? String(rounded));
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
