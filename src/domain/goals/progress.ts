import type { GoalMilestone } from "@/content/schema";

export type GoalProgress = {
  kitsSold: number;
  /** Target of the last milestone. */
  finalTarget: number;
  /** 0..100, capped. */
  percent: number;
  milestones: Array<GoalMilestone & { reached: boolean; positionPercent: number }>;
  /** Next milestone not yet reached, or null when all are done. */
  next: (GoalMilestone & { remaining: number }) | null;
};

/**
 * Computes the goal plan state from the number of confirmed kits.
 * Only kits confirmed by the payment provider may be counted (spec RF-12).
 */
export function computeGoalProgress(kitsSold: number, milestones: GoalMilestone[]): GoalProgress {
  if (milestones.length === 0) throw new Error("Goal plan needs at least one milestone.");
  const sold = Math.max(0, Math.floor(kitsSold));
  const finalTarget = milestones[milestones.length - 1].kits;
  const percent = Math.min(100, (sold / finalTarget) * 100);
  const nextMilestone = milestones.find((m) => sold < m.kits) ?? null;

  return {
    kitsSold: sold,
    finalTarget,
    percent,
    milestones: milestones.map((m) => ({
      ...m,
      reached: sold >= m.kits,
      positionPercent: (m.kits / finalTarget) * 100,
    })),
    next: nextMilestone ? { ...nextMilestone, remaining: nextMilestone.kits - sold } : null,
  };
}
