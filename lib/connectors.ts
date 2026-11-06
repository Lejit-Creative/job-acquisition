import { BLOCKED_HOSTS } from "./defaults";
import { classifyField, isRemote } from "./fields";
import { getJson, getText } from "./http";
import { boardBrand } from "./logos";
import { parsePay, payDecision } from "./pay";
import { htmlToText } from "./text";
import type { Criteria, NormalizedJob, SourceRow } from "./types";

export type DraftJob = {
  title: string;
  company: string;
  location: string;
  remote: boolean | null;
  workplace: string | null;
  payMin: number | null;
  payMax: number | null;
  currency: string;
  source: string;
  url: string;
  externalId: string;
  description: string;
  postedAt: string | null;
  tags: string;
  logoUrl?: string;
  companyUrl?: string;
};

export function blockedHost(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const hit = BLOCKED_HOSTS.find((item) => host === item || host.endsWith(`.${item}`));
  return hit ?? null;
}

export function applyCriteria(draft: DraftJob, criteria: Criteria): NormalizedJob | "filtered" | null {
  const title = draft.title.trim();
  const company = draft.company.trim();
  if (!title || !company) return null;
  const remote = draft.remote ?? isRemote(draft.location, draft.workplace);
  if (criteria.remoteOnly && !remote) return "filtered";
  const field = classifyField(title, draft.tags, draft.description, criteria.fields, criteria.extraKeywords);
  if (!field) return "filtered";
  let payMin = draft.payMin;
  let payMax = draft.payMax;
  let currency = draft.currency || "USD";
  if (payMin == null && payMax == null && draft.description) {
    const parsed = parsePay(draft.description, currency);
    payMin = parsed.min;
    payMax = parsed.max;
    currency = parsed.currency;
  }
  const decision = payDecision(payMin, payMax, criteria.minPay, currency);
  if (!decision.keep) return "filtered";
  return {
    title,
    company,
    location: draft.location.trim(),
    remote,
    payMin,
    payMax,
    currency,
    source: draft.source,
    url: draft.url,
    externalId: draft.externalId,
    description: draft.description,
    postedAt: draft.postedAt,
    field,
  };
}

type GreenhouseJob = {
  id: number;
  title: string;
  absolute_url?: string;
  location?: { name?: string };
  company_name?: string;
  content?: string;
  first_published?: string;
  updated_at?: string;
  metadata?: { name?: string; value?: string }[] | null;
};

export async function fetchGreenhouse(source: SourceRow): Promise<DraftJob[]> {
  const [listed, brand] = await Promise.all([
    getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(source.token)}/jobs`) as Promise<{
      jobs?: GreenhouseJob[];
    }>,
    boardBrand("greenhouse", source.token).catch(() => ({ logoUrl: "", companyUrl: "" })),
  ]);
  return (listed.jobs ?? []).map((job) => ({
    title: job.title ?? "",
    company: job.company_name || source.label,
    location: job.location?.name ?? "",
    remote: null,
    workplace: null,
    payMin: null,
    payMax: null,
    currency: "USD",
    source: "greenhouse",
    url: job.absolute_url ?? "",
    externalId: String(job.id),
    description: "",
    postedAt: job.first_published ?? job.updated_at ?? null,
    tags: "",
    logoUrl: brand.logoUrl,
    companyUrl: brand.companyUrl,
  }));
}

export async function fetchGreenhouseDetail(token: string, id: string): Promise<Partial<DraftJob>> {
  const job = (await getJson(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs/${encodeURIComponent(id)}`,
  )) as GreenhouseJob;
  const meta = (job.metadata ?? [])
    .map((item) => `${item.name ?? ""} ${item.value ?? ""}`)
    .join("\n");
  const description = htmlToText(`${job.content ?? ""}\n${meta}`);
  const pay = parsePay(`${meta}\n${description}`);
  return {
    description,
    company: job.company_name,
    location: job.location?.name,
    payMin: pay.min,
    payMax: pay.max,
    url: job.absolute_url,
  };
}

type LeverJob = {
  id: string;
  text?: string;
  hostedUrl?: string;
  descriptionPlain?: string;
  descriptionBodyPlain?: string;
  workplaceType?: string;
  createdAt?: number;
  categories?: { location?: string; team?: string; department?: string };
};

export async function fetchLever(source: SourceRow): Promise<DraftJob[]> {
  const [listed, brand] = await Promise.all([
    getJson(`https://api.lever.co/v0/postings/${encodeURIComponent(source.token)}?mode=json`) as Promise<LeverJob[]>,
    boardBrand("lever", source.token).catch(() => ({ logoUrl: "", companyUrl: "" })),
  ]);
  if (!Array.isArray(listed)) return [];
  return listed.map((job) => {
    const description = `${job.descriptionPlain ?? ""}\n${job.descriptionBodyPlain ?? ""}`.trim();
    const pay = parsePay(description);
    return {
      title: job.text ?? "",
      company: source.label,
      location: job.categories?.location ?? "",
      remote: null,
      workplace: job.workplaceType ?? null,
      payMin: pay.min,
      payMax: pay.max,
      currency: "USD",
      source: "lever",
      url: job.hostedUrl ?? "",
      externalId: job.id,
      description,
      postedAt: job.createdAt ? new Date(job.createdAt).toISOString() : null,
      tags: `${job.categories?.team ?? ""} ${job.categories?.department ?? ""}`,
      logoUrl: brand.logoUrl,
      companyUrl: brand.companyUrl,
    };
  });
}

type AshbyJob = {
  id: string;
  title?: string;
  location?: string;
  isRemote?: boolean;
  workplaceType?: string;
  jobUrl?: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
  publishedAt?: string;
  department?: string;
  team?: string;
  compensation?: {
    compensationTierSummary?: string;
    scrapeableCompensationSalarySummary?: string;
  } | null;
};

export async function fetchAshby(source: SourceRow): Promise<DraftJob[]> {
  const [listed, brand] = await Promise.all([
    getJson(
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(source.token)}?includeCompensation=true`,
    ) as Promise<{ jobs?: AshbyJob[] }>,
    boardBrand("ashby", source.token).catch(() => ({ logoUrl: "", companyUrl: "" })),
  ]);
  return (listed.jobs ?? []).map((job) => {
    const description = job.descriptionPlain || htmlToText(job.descriptionHtml ?? "");
    const comp = `${job.compensation?.compensationTierSummary ?? ""} ${job.compensation?.scrapeableCompensationSalarySummary ?? ""}`;
    const pay = parsePay(`${comp}\n${description}`);
    return {
      title: job.title ?? "",
      company: source.label,
      location: job.location ?? "",
      remote: job.isRemote === true ? true : job.isRemote === false ? false : null,
      workplace: (job.workplaceType ?? "").toLowerCase() || null,
      payMin: pay.min,
      payMax: pay.max,
      currency: "USD",
      source: "ashby",
      url: job.jobUrl ?? "",
      externalId: job.id,
      description,
      postedAt: job.publishedAt ?? null,
      tags: `${job.department ?? ""} ${job.team ?? ""}`,
      logoUrl: brand.logoUrl,
      companyUrl: brand.companyUrl,
    };
  });
}

type RemoteOkJob = {
  id?: string | number;
  position?: string;
  company?: string;
  location?: string;
  salary_min?: number;
  salary_max?: number;
  description?: string;
  url?: string;
  date?: string;
  tags?: string[];
  logo?: string;
  company_logo?: string;
};

export async function fetchRemoteOk(): Promise<DraftJob[]> {
  const listed = (await getJson("https://remoteok.com/api")) as RemoteOkJob[];
  if (!Array.isArray(listed)) return [];
  return listed
    .filter((job) => job.position && job.company)
    .map((job) => ({
      title: job.position ?? "",
      company: job.company ?? "",
      location: job.location || "Remote",
      remote: true,
      workplace: "remote",
      payMin: job.salary_min || null,
      payMax: job.salary_max || null,
      currency: "USD",
      source: "remoteok",
      url: job.url ?? "",
      externalId: String(job.id ?? job.url ?? ""),
      description: htmlToText(job.description ?? ""),
      postedAt: job.date ?? null,
      tags: (job.tags ?? []).join(", "),
      logoUrl: [job.company_logo, job.logo].find((item) => item && item.startsWith("http")) ?? "",
    }));
}

type AdzunaJob = {
  id?: string | number;
  title?: string;
  description?: string;
  redirect_url?: string;
  created?: string;
  salary_min?: number;
  salary_max?: number;
  company?: { display_name?: string };
  location?: { display_name?: string };
  category?: { label?: string };
};

export async function fetchAdzuna(criteria: Criteria): Promise<DraftJob[]> {
  const id = process.env.ADZUNA_APP_ID;
  const key = process.env.ADZUNA_APP_KEY;
  if (!id || !key) return [];
  const queries = criteria.fields.filter((field) => field.enabled).map((field) => field.label);
  const extras = criteria.extraKeywords
    .split(/[,|\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const drafts: DraftJob[] = [];
  for (const what of [...queries, ...extras].slice(0, 6)) {
    const url = new URL("https://api.adzuna.com/v1/api/jobs/us/search/1");
    url.searchParams.set("app_id", id);
    url.searchParams.set("app_key", key);
    url.searchParams.set("results_per_page", "50");
    url.searchParams.set("what", what);
    url.searchParams.set("where", "remote");
    url.searchParams.set("salary_min", String(criteria.minPay));
    url.searchParams.set("content-type", "application/json");
    const data = (await getJson(url.toString())) as { results?: AdzunaJob[] };
    for (const job of data.results ?? []) {
      drafts.push({
        title: job.title ?? "",
        company: job.company?.display_name || "Company",
        location: job.location?.display_name || "Remote",
        remote: null,
        workplace: null,
        payMin: job.salary_min || null,
        payMax: job.salary_max || null,
        currency: "USD",
        source: "adzuna",
        url: job.redirect_url ?? "",
        externalId: String(job.id ?? ""),
        description: htmlToText(job.description ?? ""),
        postedAt: job.created ?? null,
        tags: job.category?.label ?? "",
      });
    }
  }
  return drafts;
}

type UsaJob = {
  MatchedObjectId?: string;
  MatchedObjectDescriptor?: {
    PositionTitle?: string;
    PositionURI?: string;
    OrganizationName?: string;
    PositionLocationDisplay?: string;
    QualificationSummary?: string;
    UserArea?: { Details?: { JobSummary?: string; RemoteIndicator?: boolean } };
    PositionRemuneration?: { MinimumRange?: string; MaximumRange?: string; RateIntervalCode?: string }[];
    PublicationStartDate?: string;
  };
};

export async function fetchUsaJobs(criteria: Criteria): Promise<DraftJob[]> {
  const key = process.env.USAJOBS_API_KEY;
  const agent = process.env.USAJOBS_USER_AGENT;
  if (!key || !agent) return [];
  const queries = criteria.fields.filter((field) => field.enabled).map((field) => field.label);
  const drafts: DraftJob[] = [];
  for (const keyword of queries) {
    const url = new URL("https://data.usajobs.gov/api/search");
    url.searchParams.set("Keyword", keyword);
    url.searchParams.set("RemoteIndicator", "True");
    url.searchParams.set("ResultsPerPage", "50");
    const data = (await getJson(url.toString(), {
      "Authorization-Key": key,
      "User-Agent": agent,
    })) as { SearchResult?: { SearchResultItems?: UsaJob[] } };
    for (const item of data.SearchResult?.SearchResultItems ?? []) {
      const job = item.MatchedObjectDescriptor;
      if (!job) continue;
      const pay = job.PositionRemuneration?.[0];
      const hourly = (pay?.RateIntervalCode ?? "").toLowerCase().includes("hour");
      const scale = (value: string | undefined) => {
        const amount = Number(value);
        if (!Number.isFinite(amount) || amount <= 0) return null;
        return Math.round(hourly ? amount * 2080 : amount);
      };
      const remoteFlag = job.UserArea?.Details?.RemoteIndicator;
      drafts.push({
        title: job.PositionTitle ?? "",
        company: job.OrganizationName || "USAJobs",
        location: job.PositionLocationDisplay || "Remote",
        remote: remoteFlag === true ? true : remoteFlag === false ? false : null,
        workplace: remoteFlag ? "remote" : null,
        payMin: scale(pay?.MinimumRange),
        payMax: scale(pay?.MaximumRange),
        currency: "USD",
        source: "usajobs",
        url: job.PositionURI ?? "",
        externalId: item.MatchedObjectId ?? job.PositionURI ?? "",
        description: htmlToText(
          `${job.UserArea?.Details?.JobSummary ?? ""}\n${job.QualificationSummary ?? ""}`,
        ),
        postedAt: job.PublicationStartDate ?? null,
        tags: "",
      });
    }
  }
  return drafts;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function jobPostingFromJsonLd(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = jobPostingFromJsonLd(item);
      if (found) return found;
    }
    return null;
  }
  const record = asRecord(data);
  if (!record) return null;
  const type = record["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.includes("JobPosting")) return record;
  if (record["@graph"]) return jobPostingFromJsonLd(record["@graph"]);
  return null;
}

export function draftFromJobPosting(posting: Record<string, unknown>, url: string): DraftJob | null {
  const title = String(posting.title ?? "");
  const org = asRecord(posting.hiringOrganization);
  const company = String(org?.name ?? "");
  const locationNode = Array.isArray(posting.jobLocation) ? posting.jobLocation[0] : posting.jobLocation;
  const address = asRecord(asRecord(locationNode)?.address);
  const location = [address?.addressLocality, address?.addressRegion, address?.addressCountry]
    .filter(Boolean)
    .join(", ");
  const remoteType = String(posting.jobLocationType ?? "");
  const description = htmlToText(String(posting.description ?? ""));
  const salary = asRecord(posting.baseSalary);
  const value = asRecord(salary?.value);
  const unit = String(value?.unitText ?? "YEAR");
  const scale = (raw: unknown) => {
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return /hour/i.test(unit) ? Math.round(amount * 2080) : Math.round(amount);
  };
  return {
    title,
    company,
    location: location || (remoteType === "TELECOMMUTE" ? "Remote" : ""),
    remote: remoteType === "TELECOMMUTE" ? true : null,
    workplace: remoteType === "TELECOMMUTE" ? "remote" : null,
    payMin: scale(value?.minValue ?? value?.value),
    payMax: scale(value?.maxValue ?? value?.value),
    currency: String(salary?.currency ?? "USD"),
    source: "url",
    url,
    externalId: url,
    description,
    postedAt: typeof posting.datePosted === "string" ? posting.datePosted : null,
    tags: "",
  };
}

export async function fetchPastedUrl(raw: string): Promise<DraftJob> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("That is not a URL.");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Use an http or https link.");
  const blocked = blockedHost(url);
  if (blocked) {
    throw new Error(
      `${blocked} does not allow this kind of reading. Paste the role into Add job instead.`,
    );
  }

  const greenhouse = url.hostname.includes("greenhouse.io")
    ? url.pathname.match(/\/([^/]+)\/jobs\/(\d+)/)
    : null;
  if (greenhouse) {
    const [detail, brand] = await Promise.all([
      fetchGreenhouseDetail(greenhouse[1], greenhouse[2]),
      boardBrand("greenhouse", greenhouse[1]).catch(() => ({ logoUrl: "", companyUrl: "" })),
    ]);
    const listed = (await getJson(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(greenhouse[1])}/jobs/${greenhouse[2]}`,
    )) as GreenhouseJob;
    return {
      title: listed.title ?? "",
      company: detail.company || greenhouse[1],
      location: detail.location || listed.location?.name || "",
      remote: null,
      workplace: null,
      payMin: detail.payMin ?? null,
      payMax: detail.payMax ?? null,
      currency: "USD",
      source: "greenhouse",
      url: detail.url || raw,
      externalId: greenhouse[2],
      description: detail.description ?? "",
      postedAt: listed.first_published ?? null,
      tags: "",
      logoUrl: brand.logoUrl,
      companyUrl: brand.companyUrl,
    };
  }

  const lever = url.hostname.includes("lever.co") ? url.pathname.match(/\/([^/]+)\/([^/]+)/) : null;
  if (lever) {
    const [job, brand] = await Promise.all([
      getJson(
        `https://api.lever.co/v0/postings/${encodeURIComponent(lever[1])}/${encodeURIComponent(lever[2])}`,
      ) as Promise<LeverJob>,
      boardBrand("lever", lever[1]).catch(() => ({ logoUrl: "", companyUrl: "" })),
    ]);
    const description = `${job.descriptionPlain ?? ""}\n${job.descriptionBodyPlain ?? ""}`.trim();
    const pay = parsePay(description);
    return {
      title: job.text ?? "",
      company: lever[1],
      location: job.categories?.location ?? "",
      remote: null,
      workplace: job.workplaceType ?? null,
      payMin: pay.min,
      payMax: pay.max,
      currency: "USD",
      source: "lever",
      url: job.hostedUrl || raw,
      externalId: job.id || lever[2],
      description,
      postedAt: job.createdAt ? new Date(job.createdAt).toISOString() : null,
      tags: "",
      logoUrl: brand.logoUrl,
      companyUrl: brand.companyUrl,
    };
  }

  const ashby = url.hostname.includes("ashbyhq.com") ? url.pathname.match(/\/([^/]+)\/([^/]+)/) : null;
  if (ashby) {
    const board = await fetchAshby({ id: 0, kind: "ashby", token: ashby[1], label: ashby[1], enabled: true });
    const match = board.find((job) => job.externalId === ashby[2] || job.url.includes(ashby[2]));
    if (!match) throw new Error("That Ashby role is not on the public board.");
    return match;
  }

  const html = await getText(raw);
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const block of blocks) {
    try {
      const posting = jobPostingFromJsonLd(JSON.parse(block[1]));
      if (posting) {
        const draft = draftFromJobPosting(posting, raw);
        if (draft?.title && draft.company) return draft;
      }
    } catch {
      /* try the next block */
    }
  }
  throw new Error("No public job posting was found at that URL. Add the role by hand.");
}
