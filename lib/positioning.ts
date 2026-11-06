import { matchKeywords } from "./fields";
import { FACT_RULES, completeJson, llmEnabled } from "./llm";
import { grounded } from "./text";
import type { Bullet, FieldRule, Profile, Skill } from "./types";

export function assemblePositioning(input: {
  field: FieldRule;
  profile: Profile;
  skills: Skill[];
  bullets: Bullet[];
  winning: string[];
}): string {
  const skills = input.skills.filter(
    (skill) =>
      matchKeywords(`${skill.name} ${skill.category} ${skill.notes}`, input.field.keywords) ||
      skill.category.toLowerCase() === input.field.label.toLowerCase(),
  );
  const bullets = input.bullets.filter((bullet) =>
    matchKeywords(`${bullet.body} ${bullet.context}`, [...input.field.keywords, ...skills.map((skill) => skill.name)]),
  );
  const winning = input.winning.filter((bullet) =>
    matchKeywords(bullet, [...input.field.keywords, ...skills.map((skill) => skill.name)]),
  );
  const lines: string[] = [];
  if (input.profile.headline.trim()) lines.push(input.profile.headline.trim());
  if (input.profile.summary.trim()) lines.push(input.profile.summary.trim());
  const chosen = (winning.length ? winning : bullets.map((bullet) => bullet.body)).slice(0, 4);
  for (const bullet of chosen) lines.push(bullet.trim());
  if (skills.length) lines.push(`Skills: ${skills.map((skill) => skill.name).join(", ")}.`);
  return lines.filter(Boolean).join("\n\n");
}

export async function polishPositioning(draft: string, corpus: string): Promise<string> {
  if (!llmEnabled()) throw new Error("Positioning polish stays off until an API key is set.");
  if (!draft.trim()) throw new Error("Add skills or bullets for this field first.");
  const result = (await completeJson(
    `${FACT_RULES} Rewrite the draft so it is how this person describes themselves. Keep every claim inside the draft. No new metrics. Under 120 words. JSON: {"text":"..."}`,
    draft,
  )) as { text?: string };
  const text = (result.text ?? "").trim();
  if (!text || !grounded(text, corpus)) {
    throw new Error("The polish added facts that are not in the library, so it was held back.");
  }
  return text;
}
