import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ALL_DEFAULT_SOURCES } from "./defaults";
import { DEFAULT_FIELDS } from "./fields";
import { classifyField, isRemote } from "./fields";
import { payDecision } from "./pay";
import { looseKey, repairMojibake } from "./text";
import type {
  AppFile,
  Bullet,
  Criteria,
  FieldRule,
  JobView,
  MailMatch,
  PortfolioPiece,
  Profile,
  Skill,
  SourceRow,
  StageEvent,
  SavedSearch,
  StageName,
} from "./types";

type Sql = DatabaseSync;

const globalDb = globalThis as unknown as { jobDb?: Sql };

export function nowIso(): string {
  return new Date().toISOString();
}

function dataDir(): string {
  const dir = path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function filesDir(applicationId: number): string {
  const dir = path.join(dataDir(), "files", String(applicationId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function migrate(db: Sql) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      display_name TEXT NOT NULL,
      headline TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      links TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS criteria (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      remote_only INTEGER NOT NULL DEFAULT 1,
      min_pay INTEGER NOT NULL DEFAULT 50000,
      fields_json TEXT NOT NULL,
      extra_keywords TEXT NOT NULL DEFAULT '',
      interval_hours INTEGER NOT NULL DEFAULT 6
    );

    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY,
      kind TEXT NOT NULL,
      token TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      UNIQUE(kind, token)
    );

    CREATE TABLE IF NOT EXISTS saved_searches (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      keywords TEXT NOT NULL DEFAULT '',
      last_run_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY,
      dedupe_key TEXT NOT NULL UNIQUE,
      loose_key TEXT NOT NULL,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT '',
      remote INTEGER NOT NULL DEFAULT 0,
      pay_min INTEGER,
      pay_max INTEGER,
      pay_currency TEXT NOT NULL DEFAULT 'USD',
      pay_unknown INTEGER NOT NULL DEFAULT 1,
      source TEXT NOT NULL,
      source_url TEXT NOT NULL DEFAULT '',
      external_id TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      posted_at TEXT,
      field TEXT NOT NULL DEFAULT '',
      fit_score INTEGER,
      fit_reason TEXT,
      fit_scored_at TEXT,
      list_status TEXT NOT NULL DEFAULT 'new',
      matches_criteria INTEGER NOT NULL DEFAULT 1,
      logo_url TEXT NOT NULL DEFAULT '',
      company_url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS skills (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bullets (
      id INTEGER PRIMARY KEY,
      body TEXT NOT NULL,
      context TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bullet_skills (
      bullet_id INTEGER NOT NULL REFERENCES bullets(id) ON DELETE CASCADE,
      skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
      PRIMARY KEY (bullet_id, skill_id)
    );

    CREATE TABLE IF NOT EXISTS portfolio (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      url TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY,
      job_id INTEGER NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
      stage TEXT NOT NULL DEFAULT 'saved',
      theme_id TEXT NOT NULL DEFAULT 'paper',
      cover_letter TEXT NOT NULL DEFAULT '',
      resume_json TEXT NOT NULL DEFAULT '',
      score_json TEXT NOT NULL DEFAULT '',
      hiring_json TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stage_events (
      id INTEGER PRIMARY KEY,
      application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
      stage TEXT NOT NULL,
      entered_at TEXT NOT NULL,
      exited_at TEXT
    );

    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY,
      application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      filename TEXT NOT NULL,
      path TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tailor_runs (
      job_id INTEGER PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      extract_json TEXT NOT NULL DEFAULT '',
      mapping_json TEXT NOT NULL DEFAULT '',
      questions_json TEXT NOT NULL DEFAULT '',
      rewrite_json TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gmail_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      refresh_token TEXT,
      email TEXT NOT NULL DEFAULT '',
      last_sync_at TEXT
    );

    CREATE TABLE IF NOT EXISTS mail_matches (
      id INTEGER PRIMARY KEY,
      application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE,
      gmail_id TEXT NOT NULL UNIQUE,
      thread_id TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',
      snippet TEXT NOT NULL DEFAULT '',
      from_addr TEXT NOT NULL DEFAULT '',
      received_at TEXT,
      suggests_stage TEXT,
      suggestion_reason TEXT NOT NULL DEFAULT '',
      confirmed INTEGER NOT NULL DEFAULT 0,
      dismissed INTEGER NOT NULL DEFAULT 0,
      seen INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS positioning (
      field_id TEXT PRIMARY KEY,
      draft TEXT NOT NULL DEFAULT '',
      polished TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS search_runs (
      id INTEGER PRIMARY KEY,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      added INTEGER NOT NULL DEFAULT 0,
      updated INTEGER NOT NULL DEFAULT 0,
      filtered INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT ''
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_loose ON jobs(loose_key);
    CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_stage_app ON stage_events(application_id);
    CREATE INDEX IF NOT EXISTS idx_mail_app ON mail_matches(application_id);

    CREATE TABLE IF NOT EXISTS logo_cache (
      cache_key TEXT PRIMARY KEY,
      logo_url TEXT NOT NULL DEFAULT '',
      company_url TEXT NOT NULL DEFAULT '',
      checked_at TEXT NOT NULL
    );
  `);
  const jobColumns = db.prepare("PRAGMA table_info(jobs)").all() as { name: string }[];
  if (jobColumns.length && !jobColumns.some((column) => column.name === "logo_url")) {
    db.exec("ALTER TABLE jobs ADD COLUMN logo_url TEXT NOT NULL DEFAULT ''");
  }
  if (jobColumns.length && !jobColumns.some((column) => column.name === "company_url")) {
    db.exec("ALTER TABLE jobs ADD COLUMN company_url TEXT NOT NULL DEFAULT ''");
  }

  const profile = db.prepare("SELECT id FROM profile WHERE id = 1").get();
  if (!profile) {
    db.prepare("INSERT INTO profile (id, display_name) VALUES (1, ?)").run("Joshua");
  }
  const criteria = db.prepare("SELECT id FROM criteria WHERE id = 1").get();
  if (!criteria) {
    db.prepare(
      "INSERT INTO criteria (id, remote_only, min_pay, fields_json, extra_keywords, interval_hours) VALUES (1, 1, 50000, ?, '', 6)",
    ).run(JSON.stringify(DEFAULT_FIELDS));
  }
  const sourceCount = db.prepare("SELECT COUNT(*) AS n FROM sources").get() as { n: number };
  if (sourceCount.n === 0) {
    const insert = db.prepare(
      "INSERT INTO sources (kind, token, label, enabled) VALUES (?, ?, ?, 1)",
    );
    for (const source of ALL_DEFAULT_SOURCES) insert.run(source.kind, source.token, source.label);
  }
  const gmail = db.prepare("SELECT id FROM gmail_state WHERE id = 1").get();
  if (!gmail) db.prepare("INSERT INTO gmail_state (id, email) VALUES (1, '')").run();
  upgradeDefaultFields(db);
  refilterStoredJobs(db);
}

function upgradeDefaultFields(db: Sql) {
  const row = db.prepare("SELECT fields_json FROM criteria WHERE id = 1").get() as { fields_json: string };
  const fields = parseFields(row.fields_json);
  const stale = fields.some(
    (field) => field.keywords.includes("program manager") || field.keywords.includes("finance") || field.keywords.includes("business partner"),
  );
  if (!stale) return;
  const next = fields.map((field) => {
    const fresh = DEFAULT_FIELDS.find((item) => item.id === field.id);
    return fresh ? { ...fresh, enabled: field.enabled } : field;
  });
  for (const fresh of DEFAULT_FIELDS) {
    if (!next.some((field) => field.id === fresh.id)) next.push(fresh);
  }
  db.prepare("UPDATE criteria SET fields_json = ? WHERE id = 1").run(JSON.stringify(next));
}

export function refilterStoredJobs(db = getDb()) {
  const criteria = (() => {
    const row = db.prepare("SELECT * FROM criteria WHERE id = 1").get() as {
      remote_only: number;
      min_pay: number;
      fields_json: string;
      extra_keywords: string;
    };
    return {
      remoteOnly: row.remote_only === 1,
      minPay: row.min_pay,
      fields: parseFields(row.fields_json),
      extraKeywords: row.extra_keywords,
    };
  })();
  const rows = db
    .prepare("SELECT id, title, location, remote, pay_min, pay_max, pay_currency, field, source FROM jobs")
    .all() as {
    id: number;
    title: string;
    location: string;
    remote: number;
    pay_min: number | null;
    pay_max: number | null;
    pay_currency: string;
    field: string;
    source: string;
  }[];
  const update = db.prepare("UPDATE jobs SET field = ?, matches_criteria = ?, title = ?, company = ?, location = ?, description = ? WHERE id = ?");
  const full = db.prepare("SELECT company, description FROM jobs WHERE id = ?");
  for (const row of rows) {
    const text = full.get(row.id) as { company: string; description: string };
    const title = repairMojibake(row.title);
    const company = repairMojibake(text.company);
    const location = repairMojibake(row.location);
    const description = repairMojibake(text.description);
    const field = classifyField(title, "", description, criteria.fields, criteria.extraKeywords);
    const remote = row.remote === 1 || isRemote(location, null);
    const decision = payDecision(row.pay_min, row.pay_max, criteria.minPay, row.pay_currency);
    const matches = Boolean(field) && (!criteria.remoteOnly || remote) && decision.keep;
    update.run(field ?? row.field, matches ? 1 : 0, title, company, location, description, row.id);
  }
}

export function getDb(): Sql {
  if (!globalDb.jobDb) {
    const db = new DatabaseSync(path.join(dataDir(), "jobs.sqlite"));
    migrate(db);
    globalDb.jobDb = db;
  }
  return globalDb.jobDb;
}

function parseFields(raw: string): FieldRule[] {
  try {
    const parsed = JSON.parse(raw) as FieldRule[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_FIELDS;
    return parsed.map((field) => ({
      id: String(field.id),
      label: String(field.label),
      enabled: Boolean(field.enabled),
      keywords: Array.isArray(field.keywords) ? field.keywords.map(String) : [],
    }));
  } catch {
    return DEFAULT_FIELDS;
  }
}

export function getProfile(): Profile {
  const row = getDb().prepare("SELECT * FROM profile WHERE id = 1").get() as {
    display_name: string;
    headline: string;
    email: string;
    phone: string;
    location: string;
    summary: string;
    links: string;
  };
  return {
    displayName: row.display_name,
    headline: row.headline,
    email: row.email,
    phone: row.phone,
    location: row.location,
    summary: row.summary,
    links: row.links,
  };
}

export function saveProfile(profile: Profile) {
  getDb()
    .prepare(
      `UPDATE profile SET display_name = ?, headline = ?, email = ?, phone = ?, location = ?, summary = ?, links = ? WHERE id = 1`,
    )
    .run(
      profile.displayName.trim() || "Joshua",
      profile.headline.trim(),
      profile.email.trim(),
      profile.phone.trim(),
      profile.location.trim(),
      profile.summary.trim(),
      profile.links.trim(),
    );
}

export function getCriteria(): Criteria {
  const row = getDb().prepare("SELECT * FROM criteria WHERE id = 1").get() as {
    remote_only: number;
    min_pay: number;
    fields_json: string;
    extra_keywords: string;
    interval_hours: number;
  };
  return {
    remoteOnly: row.remote_only === 1,
    minPay: row.min_pay,
    fields: parseFields(row.fields_json),
    extraKeywords: row.extra_keywords,
    intervalHours: row.interval_hours || 6,
  };
}

export function saveCriteria(criteria: Criteria) {
  getDb()
    .prepare(
      `UPDATE criteria SET remote_only = ?, min_pay = ?, fields_json = ?, extra_keywords = ?, interval_hours = ? WHERE id = 1`,
    )
    .run(
      criteria.remoteOnly ? 1 : 0,
      Math.max(0, Math.round(criteria.minPay)),
      JSON.stringify(criteria.fields),
      criteria.extraKeywords.trim(),
      Math.max(1, Math.round(criteria.intervalHours || 6)),
    );
}

export function listSources(): SourceRow[] {
  const rows = getDb().prepare("SELECT * FROM sources ORDER BY kind, label").all() as {
    id: number;
    kind: SourceRow["kind"];
    token: string;
    label: string;
    enabled: number;
  }[];
  return rows.map((row) => ({ ...row, enabled: row.enabled === 1 }));
}

export function addSource(kind: SourceRow["kind"], token: string, label: string) {
  const clean = token.trim().toLowerCase().replace(/^\/+|\/+$/g, "");
  if (!clean) throw new Error("Add a board token.");
  getDb()
    .prepare(
      `INSERT INTO sources (kind, token, label, enabled) VALUES (?, ?, ?, 1)
       ON CONFLICT(kind, token) DO UPDATE SET label = excluded.label, enabled = 1`,
    )
    .run(kind, clean, label.trim() || clean);
}

export function toggleSource(id: number, enabled: boolean) {
  getDb().prepare("UPDATE sources SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id);
}

export function deleteSource(id: number) {
  getDb().prepare("DELETE FROM sources WHERE id = ?").run(id);
}

export function listSavedSearches(): SavedSearch[] {
  const rows = getDb()
    .prepare("SELECT * FROM saved_searches ORDER BY created_at DESC")
    .all() as { id: number; name: string; keywords: string; last_run_at: string | null }[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    keywords: row.keywords,
    lastRunAt: row.last_run_at,
  }));
}

export function addSavedSearch(name: string, keywords: string) {
  getDb()
    .prepare("INSERT INTO saved_searches (name, keywords, created_at) VALUES (?, ?, ?)")
    .run(name.trim() || "Saved search", keywords.trim(), nowIso());
}

export function touchSavedSearch(id: number) {
  getDb().prepare("UPDATE saved_searches SET last_run_at = ? WHERE id = ?").run(nowIso(), id);
}

export function deleteSavedSearch(id: number) {
  getDb().prepare("DELETE FROM saved_searches WHERE id = ?").run(id);
}

type JobSql = {
  id: number;
  title: string;
  company: string;
  location: string;
  remote: number;
  pay_min: number | null;
  pay_max: number | null;
  pay_currency: string;
  pay_unknown: number;
  source: string;
  source_url: string;
  description: string;
  field: string;
  fit_score: number | null;
  fit_reason: string | null;
  list_status: string;
  logo_url: string;
  company_url: string;
  matches_criteria: number;
  created_at: string;
  application_id: number | null;
  stage: string | null;
};

function mapJob(row: JobSql): JobView {
  return {
    id: row.id,
    title: repairMojibake(row.title),
    company: repairMojibake(row.company),
    location: repairMojibake(row.location),
    remote: row.remote === 1,
    payMin: row.pay_min,
    payMax: row.pay_max,
    currency: row.pay_currency,
    payUnknown: row.pay_unknown === 1,
    source: row.source,
    url: row.source_url,
    description: repairMojibake(row.description),
    field: row.field,
    fitScore: row.fit_score,
    fitReason: row.fit_reason,
    logoUrl: row.logo_url ?? "",
    companyUrl: row.company_url ?? "",
    listStatus: row.list_status,
    matchesCriteria: row.matches_criteria === 1,
    createdAt: row.created_at,
    applicationId: row.application_id,
    stage: row.stage,
  };
}

const JOB_SELECT = `
  SELECT j.*, a.id AS application_id, a.stage AS stage
  FROM jobs j
  LEFT JOIN applications a ON a.job_id = j.id
`;

export function listJobs(query: string, includeOutside: boolean): JobView[] {
  const q = query.trim().toLowerCase();
  const rows = getDb()
    .prepare(
      `${JOB_SELECT}
       WHERE j.list_status != 'dismissed'
         AND (? = 1 OR j.matches_criteria = 1)
         AND (? = '' OR lower(j.title || ' ' || j.company || ' ' || j.location || ' ' || j.source || ' ' || j.field) LIKE ?)
       ORDER BY j.created_at DESC
       LIMIT 400`,
    )
    .all(includeOutside ? 1 : 0, q, q ? `%${q}%` : "") as JobSql[];
  return rows.map(mapJob);
}

export function getJob(id: number): JobView | null {
  const row = getDb().prepare(`${JOB_SELECT} WHERE j.id = ?`).get(id) as JobSql | undefined;
  return row ? mapJob(row) : null;
}

export function outsideCount(): number {
  const row = getDb()
    .prepare(
      "SELECT COUNT(*) AS n FROM jobs WHERE matches_criteria = 0 AND list_status != 'dismissed'",
    )
    .get() as { n: number };
  return row.n;
}

export type HomeCounts = {
  fresh: number;
  ready: number;
  applied: number;
  interviews: number;
};

export function homeCounts(): HomeCounts {
  const db = getDb();
  const one = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  return {
    fresh: one(
      `SELECT COUNT(*) AS n FROM jobs j
       LEFT JOIN applications a ON a.job_id = j.id
       WHERE a.id IS NULL AND j.list_status = 'new' AND j.matches_criteria = 1`,
    ),
    ready: one(`SELECT COUNT(*) AS n FROM applications WHERE stage = 'saved'`),
    applied: one(`SELECT COUNT(*) AS n FROM applications WHERE stage IN ('applied', 'in_review')`),
    interviews: one(`SELECT COUNT(*) AS n FROM applications WHERE stage = 'interview'`),
  };
}

export type IngestInput = {
  title: string;
  company: string;
  location: string;
  remote: boolean;
  payMin: number | null;
  payMax: number | null;
  currency: string;
  payUnknown: boolean;
  source: string;
  url: string;
  externalId: string;
  description: string;
  postedAt: string | null;
  field: string;
  matchesCriteria: boolean;
  force: boolean;
  logoUrl?: string;
  companyUrl?: string;
};

export function jobKnown(
  source: string,
  externalId: string,
  company: string,
  title: string,
  location: string,
): boolean {
  const key = `${source}:${externalId || looseKey(company, title, location)}`;
  const loose = looseKey(company, title, location);
  const row = getDb()
    .prepare("SELECT id FROM jobs WHERE dedupe_key = ? OR loose_key = ?")
    .get(key, loose);
  return Boolean(row);
}

export function upsertJob(raw: IngestInput): "added" | "updated" | "filtered" {
  const input = {
    ...raw,
    title: repairMojibake(raw.title),
    company: repairMojibake(raw.company),
    location: repairMojibake(raw.location),
    description: repairMojibake(raw.description),
  };
  if (!input.matchesCriteria && !input.force) return "filtered";
  const db = getDb();
  const key = `${input.source}:${input.externalId || input.url || looseKey(input.company, input.title, input.location)}`;
  const loose = looseKey(input.company, input.title, input.location);
  const existing = db
    .prepare("SELECT id, description, source_url FROM jobs WHERE dedupe_key = ? OR loose_key = ?")
    .get(key, loose) as { id: number; description: string; source_url: string } | undefined;
  const stamp = nowIso();
  const description = input.description.slice(0, 20000);
  if (existing) {
    db.prepare(
      `UPDATE jobs SET
         title = ?, company = ?, location = ?, remote = ?, pay_min = ?, pay_max = ?,
         pay_currency = ?, pay_unknown = ?, source_url = ?, description = ?,
         posted_at = COALESCE(?, posted_at), field = ?, matches_criteria = ?, updated_at = ?,
         logo_url = CASE WHEN logo_url = '' AND ? <> '' THEN ? ELSE logo_url END,
         company_url = CASE WHEN company_url = '' AND ? <> '' THEN ? ELSE company_url END
       WHERE id = ?`,
    ).run(
      input.title,
      input.company,
      input.location,
      input.remote ? 1 : 0,
      input.payMin,
      input.payMax,
      input.currency || "USD",
      input.payUnknown ? 1 : 0,
      input.url || existing.source_url,
      description.length >= existing.description.length ? description : existing.description,
      input.postedAt,
      input.field,
      input.matchesCriteria ? 1 : 0,
      stamp,
      input.logoUrl ?? "",
      input.logoUrl ?? "",
      input.companyUrl ?? "",
      input.companyUrl ?? "",
      existing.id,
    );
    return "updated";
  }
  db.prepare(
    `INSERT INTO jobs (
      dedupe_key, loose_key, title, company, location, remote, pay_min, pay_max, pay_currency,
      pay_unknown, source, source_url, external_id, description, posted_at, field, list_status,
      matches_criteria, logo_url, company_url, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?)`,
  ).run(
    key,
    loose,
    input.title,
    input.company,
    input.location,
    input.remote ? 1 : 0,
    input.payMin,
    input.payMax,
    input.currency || "USD",
    input.payUnknown ? 1 : 0,
    input.source,
    input.url,
    input.externalId,
    description,
    input.postedAt,
    input.field,
    input.matchesCriteria ? 1 : 0,
    input.logoUrl ?? "",
    input.companyUrl ?? "",
    stamp,
    stamp,
  );
  return "added";
}

export function setListStatus(id: number, status: string) {
  getDb().prepare("UPDATE jobs SET list_status = ?, updated_at = ? WHERE id = ?").run(status, nowIso(), id);
}

export function dismissJob(id: number) {
  setListStatus(id, "dismissed");
}

export function deleteJob(id: number) {
  getDb().prepare("DELETE FROM jobs WHERE id = ?").run(id);
}

export function setFit(id: number, score: number, reason: string) {
  getDb()
    .prepare("UPDATE jobs SET fit_score = ?, fit_reason = ?, fit_scored_at = ? WHERE id = ?")
    .run(Math.max(0, Math.min(100, Math.round(score))), reason.slice(0, 400), nowIso(), id);
}

export function listSkills(): Skill[] {
  const rows = getDb()
    .prepare("SELECT id, name, category, notes FROM skills ORDER BY name COLLATE NOCASE")
    .all() as Skill[];
  // node:sqlite rows have a null prototype. Client components only accept plain objects.
  return rows.map((row) => ({ id: row.id, name: row.name, category: row.category, notes: row.notes }));
}

export function addSkill(name: string, category: string, notes: string): number {
  const result = getDb()
    .prepare("INSERT INTO skills (name, category, notes, created_at) VALUES (?, ?, ?, ?)")
    .run(name.trim(), category.trim(), notes.trim(), nowIso());
  return Number(result.lastInsertRowid);
}

export function updateSkill(id: number, name: string, category: string, notes: string) {
  getDb()
    .prepare("UPDATE skills SET name = ?, category = ?, notes = ? WHERE id = ?")
    .run(name.trim(), category.trim(), notes.trim(), id);
}

export function deleteSkill(id: number) {
  getDb().prepare("DELETE FROM skills WHERE id = ?").run(id);
}

export function listBullets(): Bullet[] {
  const db = getDb();
  const rows = db.prepare("SELECT id, body, context FROM bullets ORDER BY created_at DESC").all() as {
    id: number;
    body: string;
    context: string;
  }[];
  const links = db.prepare("SELECT bullet_id, skill_id FROM bullet_skills").all() as {
    bullet_id: number;
    skill_id: number;
  }[];
  return rows.map((row) => ({
    ...row,
    skillIds: links.filter((link) => link.bullet_id === row.id).map((link) => link.skill_id),
  }));
}

export function addBullet(body: string, context: string, skillIds: number[]): number {
  const db = getDb();
  const result = db
    .prepare("INSERT INTO bullets (body, context, created_at) VALUES (?, ?, ?)")
    .run(body.trim(), context.trim(), nowIso());
  const id = Number(result.lastInsertRowid);
  const link = db.prepare("INSERT INTO bullet_skills (bullet_id, skill_id) VALUES (?, ?)");
  for (const skillId of skillIds) link.run(id, skillId);
  return id;
}

export function updateBullet(id: number, body: string, context: string, skillIds: number[]) {
  const db = getDb();
  db.prepare("UPDATE bullets SET body = ?, context = ? WHERE id = ?").run(body.trim(), context.trim(), id);
  db.prepare("DELETE FROM bullet_skills WHERE bullet_id = ?").run(id);
  const link = db.prepare("INSERT INTO bullet_skills (bullet_id, skill_id) VALUES (?, ?)");
  for (const skillId of skillIds) link.run(id, skillId);
}

export function deleteBullet(id: number) {
  getDb().prepare("DELETE FROM bullets WHERE id = ?").run(id);
}

export function listPortfolio(): PortfolioPiece[] {
  const rows = getDb()
    .prepare("SELECT id, title, url, summary FROM portfolio ORDER BY created_at DESC")
    .all() as PortfolioPiece[];
  return rows.map((row) => ({ id: row.id, title: row.title, url: row.url, summary: row.summary }));
}

export function addPortfolio(title: string, url: string, summary: string) {
  getDb()
    .prepare("INSERT INTO portfolio (title, url, summary, created_at) VALUES (?, ?, ?, ?)")
    .run(title.trim(), url.trim(), summary.trim(), nowIso());
}

export function updatePortfolio(id: number, title: string, url: string, summary: string) {
  getDb()
    .prepare("UPDATE portfolio SET title = ?, url = ?, summary = ? WHERE id = ?")
    .run(title.trim(), url.trim(), summary.trim(), id);
}

export function deletePortfolio(id: number) {
  getDb().prepare("DELETE FROM portfolio WHERE id = ?").run(id);
}

export function libraryCounts() {
  const db = getDb();
  const n = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  const resumes = db.prepare("SELECT resume_json FROM applications").all() as { resume_json: string }[];
  let used = 0;
  const seen = new Set<string>();
  for (const row of resumes) {
    if (!row.resume_json) continue;
    try {
      const parsed = JSON.parse(row.resume_json) as { bullets?: { before?: string; after?: string }[] };
      for (const bullet of parsed.bullets ?? []) {
        const key = (bullet.after || bullet.before || "").trim();
        if (key && !seen.has(key)) {
          seen.add(key);
          used += 1;
        }
      }
    } catch {
      /* skip bad snapshots */
    }
  }
  return { skills: n("SELECT COUNT(*) AS n FROM skills"), bullets: n("SELECT COUNT(*) AS n FROM bullets"), portfolio: n("SELECT COUNT(*) AS n FROM portfolio"), used };
}

export function createApplication(jobId: number): number {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM applications WHERE job_id = ?").get(jobId) as
    | { id: number }
    | undefined;
  if (existing) return existing.id;
  const stamp = nowIso();
  const result = db
    .prepare(
      `INSERT INTO applications (job_id, stage, theme_id, created_at, updated_at) VALUES (?, 'saved', 'paper', ?, ?)`,
    )
    .run(jobId, stamp, stamp);
  const id = Number(result.lastInsertRowid);
  db.prepare(
    "INSERT INTO stage_events (application_id, stage, entered_at) VALUES (?, 'saved', ?)",
  ).run(id, stamp);
  db.prepare("UPDATE jobs SET list_status = 'ready', updated_at = ? WHERE id = ?").run(stamp, jobId);
  return id;
}

export function getApplication(id: number) {
  const row = getDb()
    .prepare(
      `SELECT a.*, j.title, j.company, j.location, j.description, j.source, j.source_url, j.field,
              j.pay_min, j.pay_max, j.pay_currency, j.pay_unknown
       FROM applications a JOIN jobs j ON j.id = a.job_id WHERE a.id = ?`,
    )
    .get(id) as
    | {
        id: number;
        job_id: number;
        stage: StageName;
        theme_id: string;
        cover_letter: string;
        resume_json: string;
        score_json: string;
        hiring_json: string;
        created_at: string;
        updated_at: string;
        title: string;
        company: string;
        location: string;
        description: string;
        source: string;
        source_url: string;
        field: string;
        pay_min: number | null;
        pay_max: number | null;
        pay_currency: string;
        pay_unknown: number;
      }
    | undefined;
  return row ?? null;
}

export function listApplications() {
  const rows = getDb()
    .prepare(
      `SELECT a.id, a.stage, a.updated_at, j.title, j.company, j.field,
              (SELECT COUNT(*) FROM mail_matches m WHERE m.application_id = a.id AND m.seen = 0) AS unread,
              (SELECT entered_at FROM stage_events e WHERE e.application_id = a.id AND e.stage = a.stage ORDER BY e.id DESC LIMIT 1) AS stage_entered
       FROM applications a JOIN jobs j ON j.id = a.job_id
       ORDER BY a.updated_at DESC`,
    )
    .all() as {
    id: number;
    stage: StageName;
    updated_at: string;
    title: string;
    company: string;
    field: string;
    unread: number;
    stage_entered: string | null;
  }[];
  return rows.map((row) => ({
    id: row.id,
    stage: row.stage,
    updatedAt: row.updated_at,
    title: row.title,
    company: row.company,
    field: row.field,
    unread: row.unread,
    stageEntered: row.stage_entered,
  }));
}

export function stageCounts() {
  const db = getDb();
  const count = (stage: string) =>
    (db.prepare("SELECT COUNT(*) AS n FROM applications WHERE stage = ?").get(stage) as { n: number }).n;
  return {
    saved: count("saved"),
    applied: count("applied"),
    inReview: count("in_review"),
    interviews: count("interview"),
    offer: count("offer"),
    closed: count("closed"),
  };
}

export function listStageEvents(applicationId: number): StageEvent[] {
  const rows = getDb()
    .prepare(
      "SELECT stage, entered_at, exited_at FROM stage_events WHERE application_id = ? ORDER BY id",
    )
    .all(applicationId) as { stage: StageName; entered_at: string; exited_at: string | null }[];
  return rows.map((row) => ({ stage: row.stage, enteredAt: row.entered_at, exitedAt: row.exited_at }));
}

export function setStage(applicationId: number, stage: StageName) {
  const db = getDb();
  const current = db.prepare("SELECT stage FROM applications WHERE id = ?").get(applicationId) as
    | { stage: string }
    | undefined;
  if (!current || current.stage === stage) return;
  const stamp = nowIso();
  db.prepare(
    "UPDATE stage_events SET exited_at = ? WHERE application_id = ? AND exited_at IS NULL",
  ).run(stamp, applicationId);
  db.prepare(
    "INSERT INTO stage_events (application_id, stage, entered_at) VALUES (?, ?, ?)",
  ).run(applicationId, stage, stamp);
  db.prepare("UPDATE applications SET stage = ?, updated_at = ? WHERE id = ?").run(stage, stamp, applicationId);
}

export function saveApplicationMaterials(
  id: number,
  patch: { themeId?: string; coverLetter?: string; resumeJson?: string; scoreJson?: string; hiringJson?: string },
) {
  const db = getDb();
  const current = getApplication(id);
  if (!current) return;
  db.prepare(
    `UPDATE applications SET theme_id = ?, cover_letter = ?, resume_json = ?, score_json = ?, hiring_json = ?, updated_at = ? WHERE id = ?`,
  ).run(
    patch.themeId ?? current.theme_id,
    patch.coverLetter ?? current.cover_letter,
    patch.resumeJson ?? current.resume_json,
    patch.scoreJson ?? current.score_json,
    patch.hiringJson ?? current.hiring_json,
    nowIso(),
    id,
  );
}

export function addFile(applicationId: number, kind: string, filename: string, storedPath: string) {
  getDb()
    .prepare(
      "INSERT INTO files (application_id, kind, filename, path, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(applicationId, kind, filename, storedPath, nowIso());
}

export function listFiles(applicationId: number): AppFile[] {
  const rows = getDb()
    .prepare(
      "SELECT id, kind, filename, created_at FROM files WHERE application_id = ? ORDER BY id DESC",
    )
    .all(applicationId) as { id: number; kind: string; filename: string; created_at: string }[];
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    filename: row.filename,
    createdAt: row.created_at,
  }));
}

export function getFile(id: number): { path: string; filename: string } | null {
  const row = getDb().prepare("SELECT path, filename FROM files WHERE id = ?").get(id) as
    | { path: string; filename: string }
    | undefined;
  return row ?? null;
}

export type TailorRow = {
  extractJson: string;
  mappingJson: string;
  questionsJson: string;
  rewriteJson: string;
};

export function getTailor(jobId: number): TailorRow | null {
  const row = getDb().prepare("SELECT * FROM tailor_runs WHERE job_id = ?").get(jobId) as
    | {
        extract_json: string;
        mapping_json: string;
        questions_json: string;
        rewrite_json: string;
      }
    | undefined;
  if (!row) return null;
  return {
    extractJson: row.extract_json,
    mappingJson: row.mapping_json,
    questionsJson: row.questions_json,
    rewriteJson: row.rewrite_json,
  };
}

export function saveTailor(jobId: number, patch: Partial<TailorRow>) {
  const db = getDb();
  const current = getTailor(jobId);
  const next = {
    extractJson: patch.extractJson ?? current?.extractJson ?? "",
    mappingJson: patch.mappingJson ?? current?.mappingJson ?? "",
    questionsJson: patch.questionsJson ?? current?.questionsJson ?? "",
    rewriteJson: patch.rewriteJson ?? current?.rewriteJson ?? "",
  };
  db.prepare(
    `INSERT INTO tailor_runs (job_id, extract_json, mapping_json, questions_json, rewrite_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(job_id) DO UPDATE SET
       extract_json = excluded.extract_json,
       mapping_json = excluded.mapping_json,
       questions_json = excluded.questions_json,
       rewrite_json = excluded.rewrite_json,
       updated_at = excluded.updated_at`,
  ).run(jobId, next.extractJson, next.mappingJson, next.questionsJson, next.rewriteJson, nowIso());
}

export function gmailStatus(): { connected: boolean; email: string; lastSyncAt: string | null } {
  const row = getDb().prepare("SELECT refresh_token, email, last_sync_at FROM gmail_state WHERE id = 1").get() as {
    refresh_token: string | null;
    email: string;
    last_sync_at: string | null;
  };
  return {
    connected: Boolean(row.refresh_token),
    email: row.email,
    lastSyncAt: row.last_sync_at,
  };
}

export function saveGmail(refreshToken: string, email: string) {
  getDb()
    .prepare("UPDATE gmail_state SET refresh_token = ?, email = ? WHERE id = 1")
    .run(refreshToken, email);
}

export function clearGmail() {
  getDb().prepare("UPDATE gmail_state SET refresh_token = NULL, email = '', last_sync_at = NULL WHERE id = 1").run();
}

export function markGmailSynced() {
  getDb().prepare("UPDATE gmail_state SET last_sync_at = ? WHERE id = 1").run(nowIso());
}

export function gmailRefreshToken(): string | null {
  const row = getDb().prepare("SELECT refresh_token FROM gmail_state WHERE id = 1").get() as {
    refresh_token: string | null;
  };
  return row.refresh_token;
}

export function upsertMail(input: {
  applicationId: number;
  gmailId: string;
  threadId: string;
  subject: string;
  snippet: string;
  fromAddr: string;
  receivedAt: string | null;
  suggestsStage: string | null;
  suggestionReason: string;
}) {
  getDb()
    .prepare(
      `INSERT INTO mail_matches (
         application_id, gmail_id, thread_id, subject, snippet, from_addr, received_at, suggests_stage, suggestion_reason
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(gmail_id) DO UPDATE SET
         subject = excluded.subject,
         snippet = excluded.snippet,
         suggests_stage = COALESCE(mail_matches.suggests_stage, excluded.suggests_stage),
         suggestion_reason = CASE WHEN mail_matches.suggests_stage IS NULL THEN excluded.suggestion_reason ELSE mail_matches.suggestion_reason END`,
    )
    .run(
      input.applicationId,
      input.gmailId,
      input.threadId,
      input.subject,
      input.snippet,
      input.fromAddr,
      input.receivedAt,
      input.suggestsStage,
      input.suggestionReason,
    );
}

export function listMail(applicationId: number): MailMatch[] {
  const rows = getDb()
    .prepare(
      `SELECT id, subject, snippet, from_addr, received_at, suggests_stage, suggestion_reason, confirmed, dismissed, seen
       FROM mail_matches WHERE application_id = ? ORDER BY received_at DESC`,
    )
    .all(applicationId) as {
    id: number;
    subject: string;
    snippet: string;
    from_addr: string;
    received_at: string | null;
    suggests_stage: StageName | null;
    suggestion_reason: string;
    confirmed: number;
    dismissed: number;
    seen: number;
  }[];
  return rows.map((row) => ({
    id: row.id,
    subject: row.subject,
    snippet: row.snippet,
    fromAddr: row.from_addr,
    receivedAt: row.received_at,
    suggestsStage: row.suggests_stage,
    suggestionReason: row.suggestion_reason,
    confirmed: row.confirmed === 1,
    dismissed: row.dismissed === 1,
    seen: row.seen === 1,
  }));
}

export function markMailSeen(applicationId: number) {
  getDb().prepare("UPDATE mail_matches SET seen = 1 WHERE application_id = ?").run(applicationId);
}

export function dismissSuggestion(id: number) {
  getDb().prepare("UPDATE mail_matches SET dismissed = 1, seen = 1 WHERE id = ?").run(id);
}

export function confirmSuggestion(id: number) {
  getDb().prepare("UPDATE mail_matches SET confirmed = 1, seen = 1, dismissed = 0 WHERE id = ?").run(id);
}

export function getPositioning() {
  return getDb().prepare("SELECT field_id, draft, polished, updated_at FROM positioning").all() as {
    field_id: string;
    draft: string;
    polished: string;
    updated_at: string;
  }[];
}

export function savePositioning(fieldId: string, draft: string, polished: string) {
  getDb()
    .prepare(
      `INSERT INTO positioning (field_id, draft, polished, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(field_id) DO UPDATE SET draft = excluded.draft, polished = excluded.polished, updated_at = excluded.updated_at`,
    )
    .run(fieldId, draft, polished, nowIso());
}

export function recordSearch(report: { added: number; updated: number; filtered: number; notes: string }) {
  const stamp = nowIso();
  getDb()
    .prepare(
      `INSERT INTO search_runs (started_at, finished_at, added, updated, filtered, notes) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(stamp, stamp, report.added, report.updated, report.filtered, report.notes);
}

export function lastSearch(): { finishedAt: string; added: number; notes: string } | null {
  const row = getDb()
    .prepare(
      "SELECT finished_at, added, notes FROM search_runs WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT 1",
    )
    .get() as { finished_at: string; added: number; notes: string } | undefined;
  if (!row) return null;
  return { finishedAt: row.finished_at, added: row.added, notes: row.notes };
}

export function winningBullets(): string[] {
  const rows = getDb().prepare("SELECT resume_json, stage FROM applications").all() as {
    resume_json: string;
    stage: string;
  }[];
  const out: string[] = [];
  for (const row of rows) {
    if (!row.resume_json) continue;
    if (!["applied", "in_review", "interview", "offer"].includes(row.stage)) continue;
    try {
      const parsed = JSON.parse(row.resume_json) as { bullets?: { after?: string; before?: string }[] };
      for (const bullet of parsed.bullets ?? []) {
        const text = (bullet.after || bullet.before || "").trim();
        if (text) out.push(text);
      }
    } catch {
      /* ignore */
    }
  }
  return out;
}

export function jobsWithoutLogos(): {
  id: number;
  source: string;
  company: string;
  url: string;
  externalId: string;
  companyUrl: string;
}[] {
  const rows = getDb()
    .prepare(
      "SELECT id, source, company, source_url, external_id, company_url FROM jobs WHERE logo_url = ''",
    )
    .all() as {
    id: number;
    source: string;
    company: string;
    source_url: string;
    external_id: string;
    company_url: string;
  }[];
  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    company: row.company,
    url: row.source_url,
    externalId: row.external_id,
    companyUrl: row.company_url,
  }));
}

export function setJobBrand(id: number, logoUrl: string, companyUrl: string) {
  getDb()
    .prepare(
      `UPDATE jobs SET
         logo_url = CASE WHEN logo_url = '' AND ? <> '' THEN ? ELSE logo_url END,
         company_url = CASE WHEN company_url = '' AND ? <> '' THEN ? ELSE company_url END
       WHERE id = ?`,
    )
    .run(logoUrl, logoUrl, companyUrl, companyUrl, id);
}

export function readLogoCache(key: string): { logoUrl: string; companyUrl: string } | null {
  const row = getDb()
    .prepare("SELECT logo_url, company_url, checked_at FROM logo_cache WHERE cache_key = ?")
    .get(key) as { logo_url: string; company_url: string; checked_at: string } | undefined;
  if (!row) return null;
  const age = Date.now() - Date.parse(row.checked_at);
  if (!Number.isFinite(age) || age > 7 * 24 * 60 * 60 * 1000) return null;
  return { logoUrl: row.logo_url, companyUrl: row.company_url };
}

export function writeLogoCache(key: string, logoUrl: string, companyUrl: string) {
  getDb()
    .prepare(
      `INSERT INTO logo_cache (cache_key, logo_url, company_url, checked_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET logo_url = excluded.logo_url, company_url = excluded.company_url, checked_at = excluded.checked_at`,
    )
    .run(key, logoUrl, companyUrl, nowIso());
}
