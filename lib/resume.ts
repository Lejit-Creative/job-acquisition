import type { Bullet, PortfolioPiece, Profile, ResumeContent, RewrittenBullet, Skill } from "./types";
import { grounded, wordCount } from "./text";

export const THEMES = [
  {
    id: "paper",
    name: "Paper",
    for: "Graphic design",
    ink: "#1C1917",
    paper: "#FBF7F1",
    accent: "#C4622D",
    rule: "#E4D3C4",
    font: "Times",
  },
  {
    id: "signal",
    name: "Signal",
    for: "UX",
    ink: "#1A2332",
    paper: "#F4F7FB",
    accent: "#2F5D8C",
    rule: "#D5E0EC",
    font: "Helvetica",
  },
  {
    id: "ledger",
    name: "Ledger",
    for: "Finance",
    ink: "#14202E",
    paper: "#F7F6F2",
    accent: "#1F6B4A",
    rule: "#C4A35A",
    font: "Times",
  },
  {
    id: "field",
    name: "Field",
    for: "Business",
    ink: "#2A2420",
    paper: "#F8F4EE",
    accent: "#8C4A3A",
    rule: "#E6D5CC",
    font: "Times",
  },
] as const;

export type Theme = (typeof THEMES)[number];

export function themeById(id: string): Theme {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}

export function eligibleBullets(bullets: Bullet[]): Bullet[] {
  return bullets.filter((bullet) => wordCount(bullet.body) > 0 && wordCount(bullet.body) <= 20);
}

export function assembleCover(input: {
  profile: Profile;
  title: string;
  company: string;
  summary: string;
  bullets: string[];
}): string {
  const lines: string[] = [];
  const contact = [input.profile.email, input.profile.phone, input.profile.location]
    .map((item) => item.trim())
    .filter(Boolean)
    .join(" · ");
  if (input.profile.displayName) lines.push(input.profile.displayName);
  if (contact) lines.push(contact);
  lines.push("");
  lines.push(`${input.company} — ${input.title}`);
  lines.push("");
  if (input.summary.trim()) {
    lines.push(input.summary.trim());
    lines.push("");
  }
  for (const bullet of input.bullets.slice(0, 3)) {
    if (wordCount(bullet) <= 20) lines.push(bullet.trim());
  }
  return lines.join("\n").trim();
}

export function buildResume(input: {
  themeId: string;
  profile: Profile;
  title: string;
  company: string;
  summary: string;
  bullets: RewrittenBullet[];
  skills: Skill[];
  portfolio: PortfolioPiece[];
  coverLetter?: string;
}): ResumeContent {
  const corpus = [
    input.profile.summary,
    input.profile.headline,
    ...input.bullets.flatMap((bullet) => [bullet.before, bullet.after]),
    ...input.skills.flatMap((skill) => [skill.name, skill.notes]),
    ...input.portfolio.flatMap((piece) => [piece.title, piece.summary]),
  ].join("\n");
  const bullets = input.bullets.filter((bullet) => {
    const text = (bullet.after || bullet.before).trim();
    return wordCount(text) > 0 && wordCount(text) <= 20 && grounded(text, corpus || text);
  });
  const summary = input.summary.trim();
  const safeSummary = summary && grounded(summary, corpus || summary) ? summary : input.profile.summary.trim();
  const cover =
    input.coverLetter?.trim() && grounded(input.coverLetter, corpus || input.coverLetter)
      ? input.coverLetter.trim()
      : assembleCover({
          profile: input.profile,
          title: input.title,
          company: input.company,
          summary: safeSummary,
          bullets: bullets.map((bullet) => bullet.after || bullet.before),
        });
  return {
    themeId: input.themeId,
    summary: safeSummary,
    bullets,
    skillNames: input.skills.map((skill) => skill.name).filter(Boolean),
    portfolio: input.portfolio
      .filter((piece) => piece.title.trim())
      .map((piece) => ({ title: piece.title, url: piece.url, summary: piece.summary })),
    coverLetter: cover,
    targetTitle: input.title,
    targetCompany: input.company,
  };
}
