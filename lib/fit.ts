import { formatPay } from "./pay";
import type { Skill } from "./types";

export type SkillHit = { skill: string; line: string };

function linesOf(description: string): string[] {
  const chunks: string[] = [];
  for (const raw of description.split(/\n+/)) {
    const line = raw.replace(/^[-•*\d.)\s]+/, "").replace(/\s+/g, " ").trim();
    if (line.length < 8) continue;
    const sentences = line.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter((part) => part.length >= 8);
    chunks.push(...(sentences.length > 0 ? sentences : [line]));
  }
  return chunks;
}

function uniqueSkills(skills: Skill[]): Skill[] {
  const seen = new Set<string>();
  const out: Skill[] = [];
  for (const skill of skills) {
    const key = skill.name.trim().toLowerCase();
    if (key.length < 2 || seen.has(key)) continue;
    seen.add(key);
    out.push(skill);
  }
  return out;
}

export function skillHits(description: string, skills: Skill[]): SkillHit[] {
  const lines = linesOf(description);
  const hits: SkillHit[] = [];
  for (const skill of uniqueSkills(skills)) {
    const name = skill.name.trim();
    const pattern = new RegExp(`(?:^|[^a-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^a-z0-9]|$)`, "i");
    const line = lines.find((item) => pattern.test(item));
    if (!line) continue;
    hits.push({ skill: name, line: line.length > 220 ? `${line.slice(0, 217)}…` : line });
  }
  return hits;
}

export function skillMatchScore(description: string, skills: Skill[]): { score: number | null; matched: number; total: number } {
  const total = uniqueSkills(skills).length;
  if (total === 0) return { score: null, matched: 0, total: 0 };
  const matched = skillHits(description, skills).length;
  return { score: Math.round((matched / total) * 100), matched, total };
}

export function synopsis(input: {
  title: string;
  company: string;
  location: string;
  remote: boolean;
  payMin: number | null;
  payMax: number | null;
  currency: string;
  payUnknown: boolean;
  description: string;
}): string {
  const location = input.location.trim();
  const place = [location, input.remote && !/remote/i.test(location) ? "Remote" : ""].filter(Boolean).join(", ");
  const pay = input.payUnknown ? "" : formatPay(input.payMin, input.payMax, input.currency, false);
  const first = linesOf(input.description)[0] ?? "";
  const parts = [`${input.title} at ${input.company}.`];
  if (place && !first.toLowerCase().startsWith(place.toLowerCase())) parts.push(`${place}.`);
  if (pay && pay !== "Pay unknown") parts.push(`${pay}.`);
  if (first && !first.toLowerCase().startsWith(input.title.toLowerCase())) parts.push(first.endsWith(".") ? first : `${first}.`);
  return parts.join(" ");
}
