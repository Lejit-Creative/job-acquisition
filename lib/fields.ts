import type { FieldRule } from "./types";

export const DEFAULT_FIELDS: FieldRule[] = [
  {
    id: "graphic-design",
    label: "Graphic design",
    enabled: true,
    keywords: [
      "graphic designer",
      "graphic design",
      "visual designer",
      "visual design",
      "brand designer",
      "brand design",
      "art director",
      "illustrator",
      "communication designer",
      "communication design",
    ],
  },
  {
    id: "ux",
    label: "UX",
    enabled: true,
    keywords: [
      "ux designer",
      "ux design",
      "product designer",
      "product design",
      "user experience",
      "ui/ux",
      "ui designer",
      "interaction designer",
      "ux researcher",
      "user researcher",
    ],
  },
  {
    id: "business",
    label: "Business",
    enabled: true,
    keywords: [
      "business operations",
      "business analyst",
      "business analysis",
      "bizops",
      "chief of staff",
      "strategy manager",
      "corporate strategy",
      "operations manager",
      "partnerships manager",
      "business development",
      "revenue operations",
      "revops",
    ],
  },
  {
    id: "finance",
    label: "Finance",
    enabled: true,
    keywords: [
      "financial analyst",
      "finance analyst",
      "finance manager",
      "head of finance",
      "finance director",
      "fp&a",
      "accountant",
      "accounting",
      "controller",
      "treasury",
      "bookkeeper",
      "financial planning",
      "accounts payable",
      "accounts receivable",
    ],
  },
];

export function matchKeywords(text: string, keywords: string[]): boolean {
  const hay = ` ${text.toLowerCase().replace(/\s+/g, " ")} `;
  return keywords.some((keyword) => {
    const needle = keyword.toLowerCase().trim();
    if (needle.length < 2) return false;
    return hay.includes(needle);
  });
}

export function classifyField(
  title: string,
  tags: string,
  _description: string,
  fields: FieldRule[],
  extraKeywords: string,
): string | null {
  const enabled = fields.filter((field) => field.enabled);
  const finance = enabled.find((field) => field.id === "finance");
  if (
    finance &&
    (/\bfinance\b[\w\s,&-]{0,20}\b(analyst|manager|director|controller|accountant|partner|head)\b/i.test(title) ||
      /\b(analyst|manager|director|controller|accountant|partner|head)\b[\w\s,&-]{0,20}\bfinance\b/i.test(title) ||
      /\b(head of finance|finance lead|vp of finance|chief financial|cfo)\b/i.test(title))
  ) {
    return finance.id;
  }
  const fromTitle = enabled.find((field) => matchKeywords(title, field.keywords));
  if (fromTitle) return fromTitle.id;
  // Department labels are short. Remote-board tag clouds are not.
  const tagCount = tags.split(/[,|]/).filter((item) => item.trim()).length;
  if (tagCount > 0 && tagCount <= 3) {
    const fromTags = enabled.find((field) => matchKeywords(tags, field.keywords));
    if (fromTags) return fromTags.id;
  }
  const extras = extraKeywords
    .split(/[,|\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (extras.length && matchKeywords(title, extras)) return "custom";
  return null;
}

export function isRemote(location: string, workplace: string | null): boolean {
  const place = (workplace ?? "").toLowerCase();
  if (place === "remote") return true;
  if (place === "hybrid" || place === "onsite" || place === "on-site") return false;
  return /\b(remote|anywhere|distributed|work from home|telecommute)\b/i.test(location);
}

export function fieldLabel(fields: FieldRule[], id: string): string {
  return fields.find((field) => field.id === id)?.label ?? (id === "custom" ? "Keyword" : id);
}
