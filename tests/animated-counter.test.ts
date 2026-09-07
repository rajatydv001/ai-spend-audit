import { describe, it, expect } from "vitest";
import { shouldAnimate } from "@/components/dashboard/animated-counter";

describe("AnimatedCounter.shouldAnimate", () => {
  it("returns true when the target has not been reached yet", () => {
    expect(shouldAnimate(0, 1000)).toBe(true);
  });

  it("returns false when the target has already been shown", () => {
    // Regression: a counter whose animation already completed must NOT
    // re-animate (or get stuck restarting from 0) for the same target.
    expect(shouldAnimate(1000, 1000)).toBe(false);
  });

  it("returns true when the value changes to a new target", () => {
    expect(shouldAnimate(1000, 2000)).toBe(true);
  });

  it("returns true when the target regresses back to a previously shown value", () => {
    expect(shouldAnimate(1000, 500)).toBe(true);
  });
});
