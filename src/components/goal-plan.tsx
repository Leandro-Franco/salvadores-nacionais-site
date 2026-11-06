import type { GoalProgress } from "@/domain/goals/progress";

export function GoalPlan({
  progress,
  intro,
  synthetic,
}: {
  progress: GoalProgress;
  intro: string;
  synthetic: boolean;
}) {
  const { kitsSold, finalTarget, percent, milestones, next } = progress;
  return (
    <div className="rounded-xl border-2 border-white p-6 sm:p-8">
      <p className="max-w-2xl text-lg text-white/85">{intro}</p>
      <div className="mt-8">
        <div className="font-script flex items-baseline justify-between gap-4 text-3xl">
          <span>{kitsSold} kits</span>
          <span className="text-white/70">meta final: {finalTarget}</span>
        </div>
        <div
          role="progressbar"
          aria-label="Progresso do plano de metas"
          aria-valuemin={0}
          aria-valuemax={finalTarget}
          aria-valuenow={Math.min(kitsSold, finalTarget)}
          aria-valuetext={`${kitsSold} de ${finalTarget} kits`}
          className="relative mt-3 h-6 border-2 border-white"
        >
          <div className="h-full bg-white" style={{ width: `${percent}%` }} />
          {milestones.map((m) => (
            <span
              key={m.kits}
              aria-hidden="true"
              className="absolute top-0 h-full w-[2px] bg-white/60 mix-blend-difference"
              style={{ left: `calc(${m.positionPercent}% - 2px)` }}
            />
          ))}
        </div>
        {synthetic && (
          <p className="mt-2 text-sm text-white/60">Número ilustrativo: as vendas ainda não começaram.</p>
        )}
      </div>
      <ol className="mt-8 grid gap-4 sm:grid-cols-3">
        {milestones.map((m) => (
          <li
            key={m.kits}
            className={`rounded-xl border-2 border-white p-4 ${m.reached ? "bg-white text-black" : ""}`}
          >
            <p className="font-menu text-sm font-semibold tracking-[0.12em] uppercase">
              {m.reached ? "✔ Destravada" : `🔒 ${m.kits} kits`}
            </p>
            <p className="mt-1 font-bold">{m.title}</p>
            <p className="mt-1 text-sm">{m.description}</p>
          </li>
        ))}
      </ol>
      {next && (
        <p className="mt-6 font-bold">
          Faltam {next.remaining} kits para destravar “{next.title}”.
        </p>
      )}
    </div>
  );
}
