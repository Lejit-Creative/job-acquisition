export type FieldRule = {
  id: string;
  label: string;
  enabled: boolean;
  keywords: string[];
};

export type Criteria = {
  remoteOnly: boolean;
  minPay: number;
  fields: FieldRule[];
  extraKeywords: string;
  intervalHours: number;
};

export type SourceRow = {
  id: number;
  kind: "greenhouse" | "lever" | "ashby";
  token: string;
  label: string;
  enabled: boolean;
};

export type NormalizedJob = {
  title: string;
  company: string;
  location: string;
  remote: boolean;
  payMin: number | null;
  payMax: number | null;
  currency: string;
  source: string;
  url: string;
  externalId: string;
  description: string;
  postedAt: string | null;
  field: string;
};

export type JobView = {
  id: number;
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
  description: string;
  field: string;
  fitScore: number | null;
  fitReason: string | null;
  logoUrl: string;
  companyUrl: string;
  listStatus: string;
  matchesCriteria: boolean;
  createdAt: string;
  applicationId: number | null;
  stage: string | null;
};

export type Profile = {
  displayName: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  summary: string;
  links: string;
};

export type Skill = {
  id: number;
  name: string;
  category: string;
  notes: string;
};

export type Bullet = {
  id: number;
  body: string;
  context: string;
  skillIds: number[];
};

export type PortfolioPiece = {
  id: number;
  title: string;
  url: string;
  summary: string;
};

export type StageName =
  | "saved"
  | "applied"
  | "in_review"
  | "interview"
  | "offer"
  | "closed";

export type StageEvent = {
  stage: StageName;
  enteredAt: string;
  exitedAt: string | null;
};

export type MailMatch = {
  id: number;
  subject: string;
  snippet: string;
  fromAddr: string;
  receivedAt: string | null;
  suggestsStage: StageName | null;
  suggestionReason: string;
  confirmed: boolean;
  dismissed: boolean;
  seen: boolean;
};

export type AppFile = {
  id: number;
  kind: string;
  filename: string;
  createdAt: string;
};

export type Term = {
  term: string;
  kind: "skill" | "outcome" | "trait";
  weight: number;
};

export type MappedTerm = Term & {
  bulletId: number | null;
  bullet: string | null;
  gap: boolean;
};

export type ClarifyQuestion = {
  id: string;
  term: string;
  prompt: string;
  answer: string;
};

export type RewrittenBullet = {
  before: string;
  after: string;
  context: string;
};

export type TailorScore = {
  keyword: number;
  skills: number;
  outcomes: number;
  roleFit: number;
  overall: number;
  missing: string[];
  weakBullets: string[];
  toReach80: string;
};

export type HiringPass = {
  interview: boolean;
  why: string;
};

export type ResumeContent = {
  themeId: string;
  summary: string;
  bullets: RewrittenBullet[];
  skillNames: string[];
  portfolio: { title: string; url: string; summary: string }[];
  coverLetter: string;
  targetTitle: string;
  targetCompany: string;
};

export type SavedSearch = {
  id: number;
  name: string;
  keywords: string;
  lastRunAt: string | null;
};

export type SearchReport = {
  added: number;
  updated: number;
  filtered: number;
  held: number;
  notes: string[];
  errors: { source: string; message: string }[];
};
