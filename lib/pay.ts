export type Pay = { min: number | null; max: number | null; currency: string };

function annual(value: number, hourly: boolean, kilo: boolean): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  let amount = value;
  if (kilo && amount < 1000) amount *= 1000;
  if (hourly) amount = Math.round(amount * 2080);
  if (amount < 1000) return null;
  return Math.round(amount);
}

function readToken(raw: string): { value: number; kilo: boolean } | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  const kilo = /k$/i.test(cleaned);
  const value = Number(cleaned.replace(/k$/i, ""));
  if (!Number.isFinite(value)) return null;
  return { value, kilo };
}

export function parsePay(text: string, currency = "USD"): Pay {
  const empty: Pay = { min: null, max: null, currency };
  if (!text) return empty;
  const sample = text.slice(0, 8000);
  const hourly = /\/\s*hr|per\s+hour|an\s+hour|hourly/i.test(sample);

  const range = sample.match(
    /\$?\s*(\d{2,3}(?:,\d{3})+|\d{2,3}(?:\.\d+)?k|\d{4,6})\s*(?:-|–|—|to)\s*\$?\s*(\d{2,3}(?:,\d{3})+|\d{2,3}(?:\.\d+)?k|\d{4,6})/i,
  );
  if (range) {
    const a = readToken(range[1]);
    const b = readToken(range[2]);
    if (a && b) {
      const kilo = a.kilo || b.kilo;
      const min = annual(a.value, hourly, a.kilo || kilo);
      const max = annual(b.value, hourly, b.kilo || kilo);
      if (min || max) {
        return {
          min: min && max ? Math.min(min, max) : min,
          max: min && max ? Math.max(min, max) : max,
          currency,
        };
      }
    }
  }

  const hourlySingle = sample.match(/\$?\s*(\d{2,3}(?:\.\d+)?)\s*(?:\/\s*h(?:ou)?r|per\s+hour|an\s+hour|hourly)/i);
  if (hourlySingle) {
    const amount = annual(Number(hourlySingle[1]), true, false);
    if (amount) return { min: amount, max: amount, currency };
  }

  const single = sample.match(/\$\s*(\d{2,3}(?:,\d{3})+|\d{2,3}(?:\.\d+)?k|\d{4,6})/i);
  if (single) {
    const token = readToken(single[1]);
    if (token) {
      const amount = annual(token.value, hourly, token.kilo);
      if (amount) return { min: amount, max: amount, currency };
    }
  }

  return empty;
}

export function payDecision(
  min: number | null,
  max: number | null,
  floor: number,
  currency: string,
): { keep: boolean; unknown: boolean } {
  if (min == null && max == null) return { keep: true, unknown: true };
  if (currency && currency.toUpperCase() !== "USD") return { keep: true, unknown: false };
  const ceiling = max ?? min ?? 0;
  if (ceiling < floor) return { keep: false, unknown: false };
  return { keep: true, unknown: false };
}

export function formatPay(
  min: number | null,
  max: number | null,
  currency: string,
  unknown: boolean,
): string {
  if (unknown || (min == null && max == null)) return "Pay unknown";
  const money = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(value);
  if (min != null && max != null && min !== max) return `${money(min)}–${money(max)}`;
  const only = min ?? max;
  return only == null ? "Pay unknown" : money(only);
}
