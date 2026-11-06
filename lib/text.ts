const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "-",
  mdash: "-",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  hellip: "...",
};

export function repairMojibake(text: string): string {
  let current = text;
  for (let pass = 0; pass < 2; pass += 1) {
    if (!current || !/[ÃÂâØÙ]|[\u0080-\u009f]/.test(current)) break;
    if ([...current].some((char) => char.charCodeAt(0) > 255)) break;
    const bytes = Uint8Array.from(current, (char) => char.charCodeAt(0));
    const decoded = new TextDecoder("utf-8").decode(bytes);
    if (!decoded || decoded.includes("\uFFFD") || decoded === current) break;
    current = decoded;
  }
  return current;
}

export function decodeEntities(input: string): string {
  let out = input;
  for (let pass = 0; pass < 2; pass += 1) {
    const next = out.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (full, body: string) => {
      if (body[0] === "#") {
        const hex = body[1] === "x" || body[1] === "X";
        const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : full;
      }
      return NAMED[body.toLowerCase()] ?? full;
    });
    if (next === out) break;
    out = next;
  }
  return out;
}

export function htmlToText(html: string): string {
  const decoded = repairMojibake(decodeEntities(html));
  return decoded
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h1|h2|h3|li|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function normKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+#]+/g, " ").trim();
}

export function looseKey(company: string, title: string, location: string): string {
  return `${normKey(company)}|${normKey(title)}|${normKey(location)}`;
}

export function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

const STOP = new Set([
  "the", "and", "for", "with", "you", "your", "our", "are", "will", "this", "that",
  "from", "have", "has", "was", "were", "been", "into", "about", "their", "they",
  "who", "what", "when", "where", "which", "can", "all", "not", "but", "per", "via",
  "job", "role", "team", "work", "working", "including", "across", "using", "use",
  "able", "such", "other", "than", "then", "also", "more", "most", "any", "own",
]);

export function tokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9+#]+/)) {
    if (raw.length < 3 || STOP.has(raw)) continue;
    out.add(raw);
  }
  return out;
}

export function significantNumbers(text: string): string[] {
  const found = text.match(/\$?\d[\d,]*(?:\.\d+)?%?/g) ?? [];
  return found
    .map((item) => item.replace(/[,$]/g, ""))
    .filter((item) => item.replace("%", "").replace(".", "").length >= 2);
}

/** A bullet may only keep figures the user already wrote down. */
export function grounded(text: string, corpus: string): boolean {
  const allowed = new Set(significantNumbers(corpus));
  return significantNumbers(text).every((item) => allowed.has(item));
}

export function clipWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= max) return words.join(" ");
  return words.slice(0, max).join(" ");
}
