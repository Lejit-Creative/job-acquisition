import { USER_AGENT } from "./defaults";

export async function getJson(url: string, headers: Record<string, string> = {}, ms = 12000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "application/json", ...headers },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(String(response.status));
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function getText(url: string, ms = 12000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(String(response.status));
    const text = await response.text();
    return text.slice(0, 1_000_000);
  } finally {
    clearTimeout(timer);
  }
}

export async function pool<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
  if (items.length === 0) return;
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await task(current);
    }
  });
  await Promise.all(workers);
}
