import type { Bullet, ClarifyQuestion, MappedTerm, Term } from "./types";
import { tokens } from "./text";

const TOOLS = [
  "figma", "sketch", "photoshop", "illustrator", "indesign", "after effects", "framer",
  "webflow", "html", "css", "sql", "excel", "tableau", "power bi", "quickbooks",
  "netsuite", "sap", "gaap", "salesforce", "hubspot", "notion", "jira", "prototyping",
  "design systems", "user research", "wireframes", "typography", "branding", "okrs",
  "forecasting", "budgeting", "storytelling",
];

const TRAITS = [
  "collaborative", "communication", "ownership", "autonomous", "curious",
  "detail-oriented", "strategic", "analytical", "cross-functional", "ambiguity",
  "empathy", "stakeholder",
];

const OUTCOME = /\b(increase|decrease|reduce|grow|revenue|conversion|retention|ship|launch|deliver|improve|margin|forecast|cycle time|cost)\b/i;

function cleanPhrase(value: string): string {
  return value
    .replace(/[.;:].*$/, "")
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function extractTerms(description: string): Term[] {
  const text = description.slice(0, 12000);
  const lower = text.toLowerCase();
  const terms: Term[] = [];
  const seen = new Set<string>();
  const push = (term: string, kind: Term["kind"], weight: number) => {
    const cleaned = cleanPhrase(term);
    const key = cleaned.toLowerCase();
    if (cleaned.length < 3 || seen.has(key)) return;
    seen.add(key);
    terms.push({ term: cleaned, kind, weight });
  };

  const skillLead =
    /(?:experience with|experience in|proficient in|knowledge of|familiarity with|background in|expertise in|skilled in)\s+([^.\n]{3,80})/gi;
  for (const match of text.matchAll(skillLead)) push(match[1], "skill", 5);

  for (const tool of TOOLS) {
    if (lower.includes(tool)) push(tool, "skill", 4);
  }

  const lines = text.split(/\n+/);
  for (const line of lines) {
    const trimmed = line.replace(/^[-•*\d.)\s]+/, "").trim();
    if (trimmed.length < 12 || trimmed.length > 160) continue;
    if (OUTCOME.test(trimmed)) push(trimmed.split(/\s+/).slice(0, 12).join(" "), "outcome", 3);
  }

  for (const trait of TRAITS) {
    if (lower.includes(trait)) push(trait, "trait", 2);
  }

  return terms.sort((a, b) => b.weight - a.weight).slice(0, 24);
}

export function mapTerms(terms: Term[], bullets: Bullet[]): MappedTerm[] {
  return terms.map((term) => {
    const want = tokens(term.term);
    let best: Bullet | null = null;
    let bestScore = 0;
    for (const bullet of bullets) {
      const have = tokens(`${bullet.body} ${bullet.context}`);
      let shared = 0;
      for (const token of want) if (have.has(token)) shared += 1;
      const score = shared / Math.max(1, Math.min(want.size, 4));
      if (score > bestScore) {
        bestScore = score;
        best = bullet;
      }
    }
    const gap = !best || bestScore < 0.34;
    return {
      ...term,
      bulletId: gap ? null : best!.id,
      bullet: gap ? null : best!.body,
      gap,
    };
  });
}

export function questionsFor(mapped: MappedTerm[]): ClarifyQuestion[] {
  const questions: ClarifyQuestion[] = [];
  for (const item of mapped) {
    if (questions.length >= 5) break;
    if (item.gap && (item.kind === "skill" || item.kind === "outcome") && item.weight >= 3) {
      questions.push({
        id: `gap-${questions.length}`,
        term: item.term,
        prompt: `For “${item.term}”: what did you do, how, and what changed? Only what actually happened.`,
        answer: "",
      });
      continue;
    }
    if (item.kind === "outcome" && item.bullet && !/\d/.test(item.bullet)) {
      questions.push({
        id: `metric-${questions.length}`,
        term: item.term,
        prompt: `Your note for “${item.term}” has no figure. What number can you stand behind?`,
        answer: "",
      });
    }
  }
  return questions;
}
