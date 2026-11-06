import { describe, expect, it } from "vitest";
import { computeGoalProgress } from "@/domain/goals/progress";

const milestones = [
  { kits: 50, title: "A", description: "a" },
  { kits: 150, title: "B", description: "b" },
  { kits: 300, title: "C", description: "c" },
];

describe("computeGoalProgress", () => {
  it("starts empty", () => {
    const p = computeGoalProgress(0, milestones);
    expect(p.percent).toBe(0);
    expect(p.milestones.every((m) => !m.reached)).toBe(true);
    expect(p.next).toMatchObject({ title: "A", remaining: 50 });
  });

  it("unlocks a milestone exactly at its target", () => {
    const p = computeGoalProgress(150, milestones);
    expect(p.milestones.map((m) => m.reached)).toEqual([true, true, false]);
    expect(p.next).toMatchObject({ title: "C", remaining: 150 });
    expect(p.percent).toBe(50);
  });

  it("caps at 100% and has no next milestone after the final one", () => {
    const p = computeGoalProgress(999, milestones);
    expect(p.percent).toBe(100);
    expect(p.next).toBeNull();
  });

  it("ignores negative and fractional input", () => {
    expect(computeGoalProgress(-5, milestones).kitsSold).toBe(0);
    expect(computeGoalProgress(10.9, milestones).kitsSold).toBe(10);
  });
});
