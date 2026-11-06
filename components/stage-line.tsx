"use client";

import { STAGES, timeInStage, type StageName } from "@/lib/stages";
import type { StageEvent } from "@/lib/types";

export function StageLine({
  current,
  events,
  onPick,
}: {
  current: string;
  events: StageEvent[];
  onPick: (stage: StageName) => void;
}) {
  const visited = new Set<string>(events.map((event) => event.stage));
  visited.add(current);
  return (
    <div className="stage-line" data-testid="stage-line">
      {STAGES.map((stage) => {
        const event = [...events].reverse().find((item) => item.stage === stage.id);
        const isCurrent = current === stage.id;
        const className = isCurrent ? "stage current" : visited.has(stage.id) ? "stage visited" : "stage";
        return (
          <button
            key={stage.id}
            type="button"
            className={className}
            data-testid={`stage-${stage.id}`}
            onClick={() => onPick(stage.id)}
          >
            <div className="dot" />
            <b>{stage.label}</b>
            <small>{timeInStage(event) ?? "—"}</small>
          </button>
        );
      })}
    </div>
  );
}
