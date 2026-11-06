import type { StageEvent, StageName } from "./types";

export type { StageName };

export const STAGES: { id: StageName; label: string }[] = [
  { id: "saved", label: "Saved" },
  { id: "applied", label: "Applied" },
  { id: "in_review", label: "In review" },
  { id: "interview", label: "Interview" },
  { id: "offer", label: "Offer" },
  { id: "closed", label: "Closed" },
];

export function stageLabel(stage: string | null): string {
  return STAGES.find((item) => item.id === stage)?.label ?? "Saved";
}

export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function timeInStage(event: StageEvent | undefined, now = Date.now()): string | null {
  if (!event) return null;
  const start = Date.parse(event.enteredAt);
  const end = event.exitedAt ? Date.parse(event.exitedAt) : now;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return formatDuration(end - start);
}

const INTERVIEW =
  /\b(interview|phone screen|on-?site|schedule a (call|time|chat)|hiring manager|take-home|assessment)\b/i;
const REVIEW = /\b(application received|under review|reviewing your|in review|we received your)\b/i;
const CLOSED =
  /\b(unfortunately|not moving forward|other candidates|position has been filled|we will not be|regret to inform)\b/i;
const OFFER = /\b(offer letter|pleased to offer|extend an offer|compensation package)\b/i;

/** Suggest a stage from mail. Never applies the move. Offer is only suggested on explicit offer language. */
export function suggestStage(text: string): { stage: StageName; reason: string } | null {
  if (OFFER.test(text)) return { stage: "offer", reason: "The message uses offer language." };
  if (CLOSED.test(text)) return { stage: "closed", reason: "The message reads like a close-out." };
  if (INTERVIEW.test(text)) return { stage: "interview", reason: "The message uses interview language." };
  if (REVIEW.test(text)) return { stage: "in_review", reason: "The message says the application is in review." };
  return null;
}
