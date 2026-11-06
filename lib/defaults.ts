export const USER_AGENT = "JobAcquisition/1.0 (personal local job search)";

export const BLOCKED_HOSTS = [
  "linkedin.com",
  "indeed.com",
  "glassdoor.com",
  "ziprecruiter.com",
  "monster.com",
  "simplyhired.com",
  "licdn.com",
];

type Seed = { kind: "greenhouse" | "lever" | "ashby"; token: string; label: string };

export const DEFAULT_SOURCES: Seed[] = [
  ["airbnb", "Airbnb"],
  ["stripe", "Stripe"],
  ["figma", "Figma"],
  ["discord", "Discord"],
  ["coinbase", "Coinbase"],
  ["robinhood", "Robinhood"],
  ["dropbox", "Dropbox"],
  ["affirm", "Affirm"],
  ["brex", "Brex"],
  ["duolingo", "Duolingo"],
  ["gitlab", "GitLab"],
  ["cloudflare", "Cloudflare"],
  ["instacart", "Instacart"],
  ["asana", "Asana"],
  ["chime", "Chime"],
  ["gusto", "Gusto"],
  ["databricks", "Databricks"],
  ["intercom", "Intercom"],
  ["block", "Block"],
  ["sofi", "SoFi"],
].map(([token, label]) => ({ kind: "greenhouse" as const, token, label }));

export const DEFAULT_LEVER: Seed[] = [
  ["spotify", "Spotify"],
  ["palantir", "Palantir"],
  ["wealthfront", "Wealthfront"],
  ["binance", "Binance"],
].map(([token, label]) => ({ kind: "lever" as const, token, label }));

export const DEFAULT_ASHBY: Seed[] = [
  ["linear", "Linear"],
  ["ramp", "Ramp"],
  ["openai", "OpenAI"],
  ["notion", "Notion"],
  ["cursor", "Cursor"],
  ["ashby", "Ashby"],
  ["posthog", "PostHog"],
  ["supabase", "Supabase"],
  ["resend", "Resend"],
  ["modal", "Modal"],
  ["perplexity", "Perplexity"],
  ["cohere", "Cohere"],
].map(([token, label]) => ({ kind: "ashby" as const, token, label }));

export const ALL_DEFAULT_SOURCES: Seed[] = [
  ...DEFAULT_SOURCES,
  ...DEFAULT_LEVER,
  ...DEFAULT_ASHBY,
];
