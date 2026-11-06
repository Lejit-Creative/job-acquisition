"use server";

import fs from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { applyCriteria, fetchPastedUrl } from "@/lib/connectors";
import {
  addBullet,
  addPortfolio,
  addSavedSearch,
  addSkill,
  addSource,
  clearGmail,
  confirmSuggestion,
  addFile,
  createApplication,
  deleteBullet,
  deleteJob,
  deletePortfolio,
  deleteSavedSearch,
  deleteSkill,
  deleteSource,
  dismissJob,
  dismissSuggestion,
  filesDir,
  getApplication,
  getCriteria,
  getJob,
  getProfile,
  getTailor,
  markMailSeen,
  listBullets,
  listPortfolio,
  listSkills,
  saveApplicationMaterials,
  refilterStoredJobs,
  saveCriteria,
  saveProfile,
  saveTailor,
  setFit,
  setStage,
  toggleSource,
  touchSavedSearch,
  updateBullet,
  updatePortfolio,
  updateSkill,
  upsertJob,
} from "@/lib/db";
import { FACT_RULES, completeJson, llmEnabled } from "@/lib/llm";
import { materialsForJob } from "@/lib/materials";
import { parsePay, payDecision } from "@/lib/pay";
import { assemblePositioning, polishPositioning } from "@/lib/positioning";
import { buildResume } from "@/lib/resume";
import { runSearch } from "@/lib/search";
import { searchLock } from "@/lib/scheduler";
import { syncGmail } from "@/lib/gmail";
import type { StageName } from "@/lib/stages";
import { hiringPass, rewriteWithModel, scoreWithModel } from "@/lib/tailor";
import type { Criteria, FieldRule, Profile } from "@/lib/types";
import { grounded } from "@/lib/text";
import { getPositioning, savePositioning, winningBullets } from "@/lib/db";

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

function refresh() {
  revalidatePath("/", "layout");
}

function fail(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

export async function saveProfileAction(formData: FormData): Promise<ActionResult> {
  const profile: Profile = {
    displayName: String(formData.get("displayName") ?? ""),
    headline: String(formData.get("headline") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    location: String(formData.get("location") ?? ""),
    summary: String(formData.get("summary") ?? ""),
    links: String(formData.get("links") ?? ""),
  };
  saveProfile(profile);
  refresh();
  return { ok: true };
}

export async function saveCriteriaAction(formData: FormData): Promise<ActionResult> {
  const current = getCriteria();
  const removed = new Set(formData.getAll("removeField").map(String));
  const fields: FieldRule[] = current.fields
    .filter((field) => !removed.has(field.id))
    .map((field) => ({
      ...field,
      enabled: formData.get(`enabled-${field.id}`) === "on",
      keywords: String(formData.get(`keywords-${field.id}`) ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    }));
  const customLabel = String(formData.get("customLabel") ?? "").trim();
  const customKeywords = String(formData.get("customKeywords") ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (customLabel && customKeywords.length) {
    const id = customLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `field-${fields.length}`;
    if (!fields.some((field) => field.id === id)) {
      fields.push({ id, label: customLabel, enabled: true, keywords: customKeywords });
    }
  }
  const next: Criteria = {
    remoteOnly: formData.get("remoteOnly") === "on",
    minPay: Number(formData.get("minPay") ?? 50000) || 0,
    fields,
    extraKeywords: String(formData.get("extraKeywords") ?? ""),
    intervalHours: Number(formData.get("intervalHours") ?? 6) || 6,
  };
  saveCriteria(next);
  refilterStoredJobs();
  refresh();
  return { ok: true };
}

export async function addSourceAction(formData: FormData): Promise<ActionResult> {
  try {
    const kind = String(formData.get("kind") ?? "greenhouse") as "greenhouse" | "lever" | "ashby";
    if (!["greenhouse", "lever", "ashby"].includes(kind)) return { ok: false, error: "Pick Greenhouse, Lever, or Ashby." };
    addSource(kind, String(formData.get("token") ?? ""), String(formData.get("label") ?? ""));
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function toggleSourceAction(id: number, enabled: boolean): Promise<ActionResult> {
  toggleSource(id, enabled);
  refresh();
  return { ok: true };
}

export async function deleteSourceAction(id: number): Promise<ActionResult> {
  deleteSource(id);
  refresh();
  return { ok: true };
}

export async function addSavedSearchAction(formData: FormData): Promise<ActionResult> {
  addSavedSearch(String(formData.get("name") ?? ""), String(formData.get("keywords") ?? ""));
  refresh();
  return { ok: true };
}

export async function deleteSavedSearchAction(id: number): Promise<ActionResult> {
  deleteSavedSearch(id);
  refresh();
  return { ok: true };
}

export async function runSearchAction(extraKeywords = "", savedId?: number): Promise<ActionResult> {
  const lock = searchLock();
  if (lock.running) return { ok: false, error: "A search is already running." };
  lock.start();
  try {
    const report = await runSearch(extraKeywords);
    if (savedId) touchSavedSearch(savedId);
    refresh();
    const message = `Added ${report.added}, updated ${report.updated}, held back ${report.filtered} that missed the filters.`;
    return { ok: true, message: [message, ...report.notes].join(" "), data: undefined };
  } catch (error) {
    return fail(error);
  } finally {
    lock.end();
  }
}

export async function addJobAction(formData: FormData): Promise<ActionResult> {
  const title = String(formData.get("title") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim();
  if (!title || !company) return { ok: false, error: "Title and company are required." };
  const criteria = getCriteria();
  const remote = formData.get("remote") === "on";
  const pay = parsePay(
    [formData.get("payMin"), formData.get("payMax")].filter(Boolean).join(" - ") ||
      String(formData.get("pay") ?? ""),
  );
  const payMin = formData.get("payMin") ? Number(formData.get("payMin")) || pay.min : pay.min;
  const payMax = formData.get("payMax") ? Number(formData.get("payMax")) || pay.max : pay.max;
  const field = String(formData.get("field") ?? "");
  const description = String(formData.get("description") ?? "");
  const decision = payDecision(payMin, payMax, criteria.minPay, "USD");
  const fieldOn = criteria.fields.find((item) => item.id === field)?.enabled !== false && Boolean(field);
  const matches = fieldOn && (!criteria.remoteOnly || remote) && decision.keep;
  upsertJob({
    title,
    company,
    location: String(formData.get("location") ?? ""),
    remote,
    payMin,
    payMax,
    currency: "USD",
    payUnknown: decision.unknown,
    source: "manual",
    url: String(formData.get("url") ?? ""),
    externalId: `manual:${Date.now()}`,
    description,
    postedAt: new Date().toISOString(),
    field: field || "custom",
    matchesCriteria: matches,
    force: true,
  });
  refresh();
  return {
    ok: true,
    message: matches
      ? "Role added."
      : "Role added outside the current filters. Turn on “Outside filters” to see it.",
  };
}

export async function pasteUrlAction(formData: FormData): Promise<ActionResult> {
  try {
    const draft = await fetchPastedUrl(String(formData.get("url") ?? ""));
    const criteria = getCriteria();
    const judged = applyCriteria(draft, criteria);
    const normalized = judged && judged !== "filtered" ? judged : null;
    const fallbackField = criteria.fields.find((field) => field.enabled)?.id ?? "custom";
    upsertJob({
      title: normalized?.title ?? draft.title,
      company: normalized?.company ?? draft.company,
      location: normalized?.location ?? draft.location,
      remote: normalized?.remote ?? Boolean(draft.remote),
      payMin: normalized?.payMin ?? draft.payMin,
      payMax: normalized?.payMax ?? draft.payMax,
      currency: normalized?.currency ?? draft.currency,
      payUnknown: (normalized?.payMin ?? draft.payMin) == null && (normalized?.payMax ?? draft.payMax) == null,
      source: draft.source,
      url: draft.url,
      externalId: draft.externalId || draft.url,
      description: draft.description,
      postedAt: draft.postedAt,
      field: normalized?.field ?? fallbackField,
      matchesCriteria: Boolean(normalized),
      force: true,
      logoUrl: draft.logoUrl,
      companyUrl: draft.companyUrl,
    });
    refresh();
    return {
      ok: true,
      message: normalized ? "Role added from the public posting." : "Role added outside the current filters.",
    };
  } catch (error) {
    return fail(error);
  }
}

export async function dismissJobAction(id: number): Promise<ActionResult> {
  dismissJob(id);
  refresh();
  return { ok: true };
}

export async function deleteJobAction(id: number): Promise<ActionResult> {
  deleteJob(id);
  refresh();
  return { ok: true };
}

export async function saveApplicationAction(jobId: number): Promise<ActionResult<{ id: number }>> {
  const id = createApplication(jobId);
  refresh();
  return { ok: true, data: { id } };
}

export async function scoreFitAction(jobId: number): Promise<ActionResult> {
  if (!llmEnabled()) return { ok: false, error: "Fit scoring stays off until an API key is set." };
  const job = getJob(jobId);
  if (!job) return { ok: false, error: "Job not found." };
  try {
    const skills = listSkills();
    const bullets = listBullets();
    const portfolio = listPortfolio();
    const profile = getProfile();
    const corpus = [
      profile.summary,
      profile.headline,
      ...skills.map((skill) => `${skill.name} ${skill.notes}`),
      ...bullets.map((bullet) => bullet.body),
      ...portfolio.map((piece) => `${piece.title} ${piece.summary}`),
    ].join("\n");
    const result = (await completeJson(
      `${FACT_RULES}
Score how well the supplied facts fit the role, from 0 to 100.
If the library is empty, score 0 and say so.
JSON: {"score":0,"reason":""}
reason is one sentence and only mentions supplied facts.`,
      JSON.stringify({
        title: job.title,
        company: job.company,
        description: job.description.slice(0, 5000),
        profile,
        skills,
        bullets,
        portfolio,
      }),
    )) as { score?: number; reason?: string };
    const reason = String(result.reason ?? "").slice(0, 400);
    if (reason && !grounded(reason, corpus || reason)) {
      return { ok: false, error: "The score reason was held back because it added facts." };
    }
    setFit(jobId, Number(result.score ?? 0), reason || "Scored from the skills library.");
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function addSkillAction(formData: FormData): Promise<ActionResult> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Name the skill." };
  addSkill(name, String(formData.get("category") ?? ""), String(formData.get("notes") ?? ""));
  refresh();
  return { ok: true };
}

export async function updateSkillAction(formData: FormData): Promise<ActionResult> {
  updateSkill(
    Number(formData.get("id")),
    String(formData.get("name") ?? ""),
    String(formData.get("category") ?? ""),
    String(formData.get("notes") ?? ""),
  );
  refresh();
  return { ok: true };
}

export async function deleteSkillAction(id: number): Promise<ActionResult> {
  deleteSkill(id);
  refresh();
  return { ok: true };
}

function skillIds(formData: FormData): number[] {
  return formData
    .getAll("skill")
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

export async function addBulletAction(formData: FormData): Promise<ActionResult> {
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { ok: false, error: "Write the bullet." };
  addBullet(body, String(formData.get("context") ?? ""), skillIds(formData));
  refresh();
  return { ok: true };
}

export async function updateBulletAction(formData: FormData): Promise<ActionResult> {
  updateBullet(
    Number(formData.get("id")),
    String(formData.get("body") ?? ""),
    String(formData.get("context") ?? ""),
    skillIds(formData),
  );
  refresh();
  return { ok: true };
}

export async function deleteBulletAction(id: number): Promise<ActionResult> {
  deleteBullet(id);
  refresh();
  return { ok: true };
}

export async function addPortfolioAction(formData: FormData): Promise<ActionResult> {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false, error: "Name the piece." };
  addPortfolio(title, String(formData.get("url") ?? ""), String(formData.get("summary") ?? ""));
  refresh();
  return { ok: true };
}

export async function updatePortfolioAction(formData: FormData): Promise<ActionResult> {
  updatePortfolio(
    Number(formData.get("id")),
    String(formData.get("title") ?? ""),
    String(formData.get("url") ?? ""),
    String(formData.get("summary") ?? ""),
  );
  refresh();
  return { ok: true };
}

export async function deletePortfolioAction(id: number): Promise<ActionResult> {
  deletePortfolio(id);
  refresh();
  return { ok: true };
}

export async function saveAnswersAction(jobId: number, formData: FormData): Promise<ActionResult> {
  const row = getTailor(jobId);
  if (!row) return { ok: false, error: "Open Prepare application again so the questions can load." };
  const questions = JSON.parse(row.questionsJson || "[]") as { id: string; term: string; prompt: string; answer: string }[];
  const next = questions.map((question) => ({
    ...question,
    answer: String(formData.get(`answer-${question.id}`) ?? question.answer ?? ""),
  }));
  saveTailor(jobId, { questionsJson: JSON.stringify(next) });
  refresh();
  return { ok: true };
}

export async function rewriteAction(jobId: number): Promise<ActionResult> {
  try {
    await rewriteWithModel(jobId);
    refresh();
    return { ok: true, message: "Rewrite used only the facts you supplied. Anything else was held back." };
  } catch (error) {
    return fail(error);
  }
}

export async function scoreTailorAction(jobId: number): Promise<ActionResult> {
  try {
    await scoreWithModel(jobId);
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function hiringAction(jobId: number): Promise<ActionResult> {
  try {
    await hiringPass(jobId);
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function saveMaterialsAction(jobId: number, themeId: string): Promise<ActionResult<{ id: number }>> {
  const packed = materialsForJob(jobId, themeId);
  if (!packed) return { ok: false, error: "Job not found." };
  const id = createApplication(jobId);
  const built = buildResume({
    themeId,
    profile: packed.profile,
    title: packed.content.targetTitle,
    company: packed.content.targetCompany,
    summary: packed.content.summary,
    bullets: packed.content.bullets,
    skills: packed.content.skillNames.map((name) => ({ id: 0, name, category: "", notes: "" })),
    portfolio: packed.content.portfolio.map((piece) => ({ id: 0, ...piece })),
    coverLetter: packed.content.coverLetter,
  });
  saveApplicationMaterials(id, {
    themeId,
    coverLetter: built.coverLetter,
    resumeJson: JSON.stringify(built),
  });
  refresh();
  return { ok: true, data: { id } };
}

export async function setThemeAction(applicationId: number, themeId: string): Promise<ActionResult> {
  const application = getApplication(applicationId);
  if (!application) return { ok: false, error: "Application not found." };
  let resumeJson = application.resume_json;
  if (resumeJson) {
    try {
      const parsed = JSON.parse(resumeJson) as { themeId?: string };
      parsed.themeId = themeId;
      resumeJson = JSON.stringify(parsed);
    } catch {
      resumeJson = application.resume_json;
    }
  }
  saveApplicationMaterials(applicationId, { themeId, resumeJson });
  refresh();
  return { ok: true };
}

export async function moveStageAction(applicationId: number, stage: StageName): Promise<ActionResult> {
  setStage(applicationId, stage);
  refresh();
  return { ok: true };
}

export async function confirmMailAction(mailId: number, applicationId: number, stage: StageName): Promise<ActionResult> {
  setStage(applicationId, stage);
  confirmSuggestion(mailId);
  refresh();
  return { ok: true, message: "Stage updated from the message you confirmed." };
}

export async function dismissMailAction(mailId: number): Promise<ActionResult> {
  dismissSuggestion(mailId);
  refresh();
  return { ok: true };
}

export async function syncGmailAction(): Promise<ActionResult> {
  try {
    const result = await syncGmail();
    refresh();
    return { ok: true, message: `Checked mail. ${result.matched} messages matched an application.` };
  } catch (error) {
    return fail(error);
  }
}

export async function disconnectGmailAction(): Promise<ActionResult> {
  clearGmail();
  refresh();
  return { ok: true };
}

export async function uploadFileAction(applicationId: number, formData: FormData): Promise<ActionResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file." };
  if (file.size > 15 * 1024 * 1024) return { ok: false, error: "Files stay under 15 MB." };
  const filename = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "file";
  const dir = filesDir(applicationId);
  const stored = path.join(dir, `${Date.now()}-${filename}`);
  const bytes = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(stored, bytes);
  addFile(applicationId, "other", filename, stored);
  refresh();
  return { ok: true };
}

export async function refreshPositioningAction(): Promise<ActionResult> {
  const criteria = getCriteria();
  const skills = listSkills();
  const bullets = listBullets();
  const profile = getProfile();
  const winning = winningBullets();
  const existing = new Map(getPositioning().map((row) => [row.field_id, row.polished]));
  for (const field of criteria.fields.filter((item) => item.enabled)) {
    const draft = assemblePositioning({ field, profile, skills, bullets, winning });
    savePositioning(field.id, draft, existing.get(field.id) ?? "");
  }
  refresh();
  return { ok: true };
}

export async function polishPositioningAction(fieldId: string): Promise<ActionResult> {
  try {
    const criteria = getCriteria();
    const field = criteria.fields.find((item) => item.id === fieldId);
    if (!field) return { ok: false, error: "Field not found." };
    const draft = assemblePositioning({
      field,
      profile: getProfile(),
      skills: listSkills(),
      bullets: listBullets(),
      winning: winningBullets(),
    });
    const corpus = draft;
    const polished = await polishPositioning(draft, corpus);
    savePositioning(fieldId, draft, polished);
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function markSeenAction(applicationId: number): Promise<ActionResult> {
  markMailSeen(applicationId);
  return { ok: true };
}
