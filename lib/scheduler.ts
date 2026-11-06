import { getCriteria, lastSearch } from "./db";
import { fillMissingLogos } from "./logos";
import { runSearch } from "./search";

const globalState = globalThis as unknown as { jobSearchTimer?: boolean; jobSearchRunning?: boolean; jobLogos?: boolean };

export function startScheduler() {
  if (globalState.jobSearchTimer) return;
  globalState.jobSearchTimer = true;
  const tick = async () => {
    if (globalState.jobSearchRunning) return;
    const criteria = getCriteria();
    const last = lastSearch();
    if (last) {
      const age = Date.now() - Date.parse(last.finishedAt);
      if (age < criteria.intervalHours * 60 * 60 * 1000) return;
    }
    globalState.jobSearchRunning = true;
    try {
      await runSearch();
    } catch (error) {
      console.error("Scheduled search failed", error instanceof Error ? error.message : error);
    } finally {
      globalState.jobSearchRunning = false;
    }
  };
  setTimeout(() => void tick(), 45_000);
  setInterval(() => void tick(), 60 * 60 * 1000);
  if (!globalState.jobLogos) {
    globalState.jobLogos = true;
    setTimeout(() => {
      void fillMissingLogos().catch((error) => {
        console.error("Logo lookup failed", error instanceof Error ? error.message : error);
      });
    }, 4000);
  }
}

export function searchLock(): { running: boolean; start: () => void; end: () => void } {
  return {
    running: Boolean(globalState.jobSearchRunning),
    start() {
      globalState.jobSearchRunning = true;
    },
    end() {
      globalState.jobSearchRunning = false;
    },
  };
}
