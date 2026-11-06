import { getJob, getTailor, listBullets, saveTailor } from "./db";
import { extractTerms, mapTerms, questionsFor } from "./extract";
import { FACT_RULES, completeJson, llmEnabled } from "./llm";
import { grounded, wordCount } from "./text";
import type { ClarifyQuestion, HiringPass, MappedTerm, RewrittenBullet, TailorScore, Term } from "./types";

export type RewriteFile = {
  summary: string;
  bullets: RewrittenBullet[];
  coverLetter: string;
  held: string[];
  score: TailorScore | null;
  hiring: HiringPass | null;
};

function readJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function syncTailor(jobId: number) {
  const job = getJob(jobId);
  if (!job) return null;
  const bullets = listBullets();
  const terms = extractTerms(job.description);
  const mapped = mapTerms(terms, bullets);
  const previous = getTailor(jobId);
  const oldQuestions = readJson<ClarifyQuestion[]>(previous?.questionsJson, []);
  const questions = questionsFor(mapped).map((question) => {
    const prior = oldQuestions.find((item) => item.term === question.term && item.prompt === question.prompt);
    return prior ? { ...question, answer: prior.answer } : question;
  });
  saveTailor(jobId, {
    extractJson: JSON.stringify(terms),
    mappingJson: JSON.stringify(mapped),
    questionsJson: JSON.stringify(questions),
  });
  const rewrite = readJson<RewriteFile | null>(getTailor(jobId)?.rewriteJson, null);
  return { job, terms, mapped, questions, rewrite };
}

export function corpusFor(jobId: number): string {
  const view = syncTailor(jobId);
  if (!view) return "";
  const answers = view.questions.map((question) => question.answer).join("\n");
  const bullets = view.mapped.map((item) => item.bullet ?? "").join("\n");
  return `${answers}\n${bullets}`;
}

function asRewrite(value: unknown, corpus: string): { file: RewriteFile; held: string[] } {
  const record = (value ?? {}) as {
    summary?: string;
    bullets?: { before?: string; after?: string; context?: string }[];
    coverLetter?: string;
  };
  const held: string[] = [];
  const summary = (record.summary ?? "").trim();
  const safeSummary = summary && wordCount(summary) <= 80 && grounded(summary, corpus) ? summary : "";
  if (summary && !safeSummary) held.push("Summary was held back because it added facts or ran long.");
  const bullets: RewrittenBullet[] = [];
  for (const bullet of record.bullets ?? []) {
    const after = (bullet.after ?? "").trim();
    const before = (bullet.before ?? "").trim();
    if (!after) continue;
    if (wordCount(after) > 20 || !grounded(after, corpus)) {
      held.push(after);
      continue;
    }
    bullets.push({ before, after, context: (bullet.context ?? "").trim() });
  }
  const cover = (record.coverLetter ?? "").trim();
  const safeCover = cover && grounded(cover, corpus) && wordCount(cover) <= 220 ? cover : "";
  if (cover && !safeCover) held.push("Cover letter was held back because it added facts or ran long.");
  return {
    held,
    file: { summary: safeSummary, bullets, coverLetter: safeCover, held, score: null, hiring: null },
  };
}

export async function rewriteWithModel(jobId: number): Promise<RewriteFile> {
  if (!llmEnabled()) throw new Error("Resume rewrite stays off until an API key is set.");
  const view = syncTailor(jobId);
  if (!view) throw new Error("Job not found.");
  const profileFacts = view.questions
    .filter((question) => question.answer.trim())
    .map((question) => `${question.term}: ${question.answer.trim()}`);
  const known = view.mapped
    .filter((item) => item.bullet)
    .map((item) => `${item.term} → ${item.bullet}`);
  const corpus = [...profileFacts, ...known, ...view.questions.map((question) => question.answer)].join("\n");
  const result = await completeJson(
    `${FACT_RULES}
Each bullet is under 20 words, plain text, and metric-driven only when the user supplied the metric.
Write a short summary and a cover letter from those same facts.
JSON shape: {"summary":"","bullets":[{"before":"","after":"","context":""}],"coverLetter":""}`,
    JSON.stringify({
      jobTitle: view.job.title,
      company: view.job.company,
      language: view.terms,
      knownBullets: known,
      answers: profileFacts,
    }),
  );
  const { file, held } = asRewrite(result, corpus);
  file.held = held;
  const previous = readJson<RewriteFile | null>(getTailor(jobId)?.rewriteJson, null);
  file.score = previous?.score ?? null;
  file.hiring = previous?.hiring ?? null;
  saveTailor(jobId, { rewriteJson: JSON.stringify(file) });
  return file;
}

export async function scoreWithModel(jobId: number): Promise<TailorScore> {
  if (!llmEnabled()) throw new Error("Scoring stays off until an API key is set.");
  const view = syncTailor(jobId);
  if (!view) throw new Error("Job not found.");
  const rewrite = view.rewrite;
  const result = (await completeJson(
    `${FACT_RULES}
Score the materials already supplied. Do not assume missing experience.
JSON: {"keyword":0,"skills":0,"outcomes":0,"roleFit":0,"overall":0,"missing":[""],"weakBullets":[""],"toReach80":""}
Scores are integers from 0 to 100.
toReach80 says exactly what supplied-fact change would push overall to 80 or above. If the facts cannot get there, say so.`,
    JSON.stringify({
      job: view.job.description.slice(0, 6000),
      terms: view.terms,
      mapping: view.mapped,
      answers: view.questions,
      rewrite,
    }),
  )) as Partial<TailorScore>;
  const score: TailorScore = {
    keyword: clamp(result.keyword),
    skills: clamp(result.skills),
    outcomes: clamp(result.outcomes),
    roleFit: clamp(result.roleFit),
    overall: clamp(result.overall),
    missing: arrayOf(result.missing),
    weakBullets: arrayOf(result.weakBullets),
    toReach80: String(result.toReach80 ?? "").slice(0, 500),
  };
  const file = rewrite ?? { summary: "", bullets: [], coverLetter: "", held: [], score: null, hiring: null };
  file.score = score;
  saveTailor(jobId, { rewriteJson: JSON.stringify(file) });
  return score;
}

export async function hiringPass(jobId: number): Promise<HiringPass> {
  if (!llmEnabled()) throw new Error("The hiring-manager pass stays off until an API key is set.");
  const view = syncTailor(jobId);
  if (!view) throw new Error("Job not found.");
  const result = (await completeJson(
    `${FACT_RULES}
Decide whether you would interview this person for the role using only the supplied facts.
If the library is thin, say not yet.
JSON: {"interview":false,"why":""}
why is under 60 words and names the deciding facts.`,
    JSON.stringify({
      title: view.job.title,
      company: view.job.company,
      terms: view.terms,
      bullets: view.mapped,
      answers: view.questions,
      rewrite: view.rewrite,
    }),
  )) as { interview?: boolean; why?: string };
  const pass: HiringPass = {
    interview: Boolean(result.interview),
    why: String(result.why ?? "").slice(0, 500),
  };
  const file: RewriteFile = view.rewrite ?? {
    summary: "",
    bullets: [],
    coverLetter: "",
    held: [],
    score: null,
    hiring: null,
  };
  file.hiring = pass;
  saveTailor(jobId, { rewriteJson: JSON.stringify(file) });
  return pass;
}

function clamp(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function arrayOf(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).slice(0, 8) : [];
}

export type TailorView = {
  terms: Term[];
  mapped: MappedTerm[];
  questions: ClarifyQuestion[];
  rewrite: RewriteFile | null;
};
