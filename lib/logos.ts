import { BLOCKED_HOSTS, USER_AGENT } from "./defaults";
import { jobsWithoutLogos, listSources, readLogoCache, setJobBrand, writeLogoCache } from "./db";
import { getJson, pool } from "./http";

export type Brand = { logoUrl: string; companyUrl: string };

const BOARD = /(^|\.)((greenhouse|lever|ashbyhq|remoteok|adzuna|usajobs)\.(io|co|com|gov))$/i;

function decode(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/\\\//g, "/").trim();
}

function absolute(base: string, href: string): string {
  try {
    return new URL(decode(href), base).href;
  } catch {
    return "";
  }
}

function hostBlocked(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return BLOCKED_HOSTS.some((item) => host === item || host.endsWith(`.${item}`));
  } catch {
    return true;
  }
}

function boardHost(url: string): boolean {
  try {
    return BOARD.test(new URL(url).hostname.replace(/^www\./, ""));
  } catch {
    return true;
  }
}

function usableLogo(url: string): boolean {
  if (!url.startsWith("http") || hostBlocked(url)) return false;
  const host = new URL(url).hostname;
  if (host.includes("ashbyprd.com") && /favicon|apple-touch/i.test(url)) return false;
  if (host.includes("greenhouse.io") && !/\/logos\//i.test(url)) return false;
  return true;
}

function pickIcon(html: string, base: string): string {
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((match) => match[0]);
  const icons = links
    .map((tag) => ({
      rel: (tag.match(/\brel="([^"]+)"/i)?.[1] ?? "").toLowerCase(),
      href: tag.match(/\bhref="([^"]+)"/i)?.[1] ?? "",
    }))
    .filter((item) => item.href && item.rel.includes("icon"));
  const chosen =
    icons.find((item) => item.rel.includes("apple")) ??
    icons.find((item) => /\.png|\.svg|png|svg/i.test(item.href)) ??
    icons.find((item) => !item.href.endsWith(".ico"));
  return chosen ? absolute(base, chosen.href) : "";
}

export function brandFromHtml(html: string, finalUrl: string): Brand {
  const logos: string[] = [];
  const wordmark =
    html.match(/"logoWordmarkImageUrl"\s*:\s*"([^"]+)"/) ??
    html.match(/"logoSquareImageUrl"\s*:\s*"([^"]+)"/) ??
    html.match(/"logoImageUrl"\s*:\s*"([^"]+)"/);
  if (wordmark) logos.push(absolute(finalUrl, wordmark[1]));

  for (const tag of html.matchAll(/<img\b[^>]*>/gi)) {
    const piece = tag[0];
    if (!/logo/i.test(piece)) continue;
    const src = piece.match(/\bsrc="([^"]+)"/i)?.[1];
    if (src) logos.push(absolute(finalUrl, src));
  }

  const og = html.match(/property="og:image"\s+content="([^"]+)"/i)?.[1];
  if (og && /logo/i.test(og)) logos.push(absolute(finalUrl, og));

  let companyUrl = html.match(/"publicWebsite"\s*:\s*"(https?:[^"]+)"/)?.[1] ?? "";
  companyUrl = companyUrl ? absolute(finalUrl, companyUrl) : "";
  if (!companyUrl && !boardHost(finalUrl)) {
    const final = new URL(finalUrl);
    companyUrl = `${final.protocol}//${final.host}/`;
  }
  if (companyUrl && hostBlocked(companyUrl)) companyUrl = "";

  if (logos.length === 0 && !boardHost(finalUrl)) {
    const icon = pickIcon(html, finalUrl);
    if (icon) logos.push(icon);
  }

  const logoUrl = logos.find((url) => usableLogo(url)) ?? "";
  return { logoUrl, companyUrl };
}

async function readPage(url: string): Promise<{ html: string; finalUrl: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT, accept: "text/html" },
    });
    if (!response.ok) return null;
    if (hostBlocked(response.url)) return null;
    const html = (await response.text()).slice(0, 180000);
    return { html, finalUrl: response.url };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function logoFromCompanyUrl(companyUrl: string): Promise<string> {
  if (!companyUrl || hostBlocked(companyUrl) || boardHost(companyUrl)) return "";
  const page = await readPage(companyUrl);
  if (!page) return "";
  const icon = pickIcon(page.html, page.finalUrl);
  return usableLogo(icon) ? icon : "";
}

async function fetchBrand(kind: "greenhouse" | "lever" | "ashby", token: string): Promise<Brand> {
  const clean = token.trim().replace(/^\/+|\/+$/g, "");
  const urls =
    kind === "greenhouse"
      ? [`https://boards.greenhouse.io/${encodeURIComponent(clean)}`, `https://job-boards.greenhouse.io/${encodeURIComponent(clean)}`]
      : kind === "lever"
        ? [`https://jobs.lever.co/${encodeURIComponent(clean)}`]
        : [`https://jobs.ashbyhq.com/${encodeURIComponent(clean)}`];
  for (const url of urls) {
    const page = await readPage(url);
    if (!page) continue;
    let brand = brandFromHtml(page.html, page.finalUrl);
    if (!brand.logoUrl && brand.companyUrl) {
      brand = { ...brand, logoUrl: await logoFromCompanyUrl(brand.companyUrl) };
    }
    if (brand.logoUrl || brand.companyUrl) return brand;
  }
  return { logoUrl: "", companyUrl: "" };
}

export async function boardBrand(kind: "greenhouse" | "lever" | "ashby", token: string): Promise<Brand> {
  const key = `${kind}:${token.trim().toLowerCase()}`;
  const cached = readLogoCache(key);
  if (cached) return { logoUrl: cached.logoUrl, companyUrl: cached.companyUrl };
  const brand = await fetchBrand(kind, token);
  writeLogoCache(key, brand.logoUrl, brand.companyUrl);
  return brand;
}

function tokenFromUrl(source: string, url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const part = parsed.pathname.split("/").filter(Boolean)[0];
    if (!part) return null;
    if (source === "greenhouse" && host.endsWith("greenhouse.io")) return part;
    if (source === "lever" && host.endsWith("lever.co")) return part;
    if (source === "ashby" && host.endsWith("ashbyhq.com")) return part;
  } catch {
    return null;
  }
  return null;
}

export async function fillMissingLogos() {
  const rows = jobsWithoutLogos();
  if (rows.length === 0) return;
  const sources = listSources();
  const groups = new Map<string, { kind: "greenhouse" | "lever" | "ashby"; token: string; ids: number[] }>();
  const remote: { id: number; externalId: string }[] = [];
  const byCompanyUrl = new Map<string, number[]>();
  for (const row of rows) {
    if (row.source === "remoteok") {
      remote.push({ id: row.id, externalId: row.externalId });
      continue;
    }
    const named = sources.find(
      (source) => source.kind === row.source && source.label.toLowerCase() === row.company.toLowerCase(),
    );
    const token = tokenFromUrl(row.source, row.url) || named?.token || null;
    if (token && (row.source === "greenhouse" || row.source === "lever" || row.source === "ashby")) {
      const key = `${row.source}:${token.toLowerCase()}`;
      const group = groups.get(key) ?? { kind: row.source, token, ids: [] };
      group.ids.push(row.id);
      groups.set(key, group);
      continue;
    }
    if (row.companyUrl) {
      const list = byCompanyUrl.get(row.companyUrl) ?? [];
      list.push(row.id);
      byCompanyUrl.set(row.companyUrl, list);
    }
  }

  await pool([...groups.values()], 4, async (group) => {
    const brand = await boardBrand(group.kind, group.token);
    for (const id of group.ids) setJobBrand(id, brand.logoUrl, brand.companyUrl);
  });

  await pool([...byCompanyUrl.entries()], 4, async ([companyUrl, ids]) => {
    const logoUrl = await logoFromCompanyUrl(companyUrl);
    for (const id of ids) setJobBrand(id, logoUrl, companyUrl);
  });

  if (remote.length === 0) return;
  try {
    const listed = (await getJson("https://remoteok.com/api")) as { id?: string | number; logo?: string; company_logo?: string }[];
    if (!Array.isArray(listed)) return;
    const logos = new Map<string, string>();
    for (const job of listed) {
      const logo = [job.company_logo, job.logo].find((item) => item && item.startsWith("http") && !hostBlocked(item)) ?? "";
      if (logo && job.id != null) logos.set(String(job.id), logo);
    }
    for (const row of remote) {
      const logo = logos.get(row.externalId);
      if (logo) setJobBrand(row.id, logo, "");
    }
  } catch {
    /* Remote OK logos stay blank for this pass */
  }
}
