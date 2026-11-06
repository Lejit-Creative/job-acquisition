import puppeteer from "puppeteer-core";
import zlib from "node:zlib";

function pdfHas(bytes, needle) {
  const raw = Buffer.from(bytes);
  const parts = [raw.toString("latin1")];
  let cursor = 0;
  while (cursor < raw.length) {
    const marker = raw.indexOf("stream", cursor);
    if (marker < 0) break;
    let start = marker + "stream".length;
    if (raw[start] === 0x0d) start += 1;
    if (raw[start] === 0x0a) start += 1;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    const slice = raw.subarray(start, end);
    try {
      parts.push(zlib.inflateSync(slice).toString("latin1"));
    } catch {
      parts.push(slice.toString("latin1"));
    }
    cursor = end + "endstream".length;
  }
  const decoded = parts.join("\n").replace(/<([0-9A-Fa-f]+)>/g, (_, hex) => {
    let text = "";
    for (let index = 0; index + 1 < hex.length; index += 2) {
      text += String.fromCharCode(Number.parseInt(hex.slice(index, index + 2), 16));
    }
    return text;
  });
  return decoded.includes(needle);
}

const base = process.env.JA_BASE || "http://127.0.0.1:3000";
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage();
page.setDefaultTimeout(20000);
const notes = [];

function log(message) {
  notes.push(message);
  console.log(message);
}

try {
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem("ja-welcomed", "1");
  });
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(base, { waitUntil: "networkidle0" });
  await page.waitForSelector("h1");
  await page.waitForSelector('[data-testid="add-job"]');
  const greeting = await page.$eval("h1", (node) => node.textContent);
  log(`greeting: ${greeting}`);
  if (await page.$(".illustration")) throw new Error("illustration is still on the page");
  const nav = await page.$eval("nav", (node) => node.textContent ?? "");
  if (!nav.includes("Prepare application")) throw new Error(`nav missing rename: ${nav}`);
  if (/\bTailor\b/.test(nav)) throw new Error("nav still says Tailor");
  const buttons = await page.$$("button");
  for (const button of buttons) {
    const label = await page.evaluate((node) => node.textContent?.trim(), button);
    if (label === "Start") await button.click();
  }
  await page.waitForSelector('[data-testid="add-job"]');
  await page.screenshot({ path: "/tmp/ja-home.png" });

  for (let attempt = 0; attempt < 12; attempt += 1) {
    await page.click('[data-testid="add-job"]');
    const opened = await page.$('[data-testid="job-title"]');
    if (opened) break;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  await page.waitForSelector('[data-testid="job-title"]');
  await page.type('[data-testid="job-title"]', "Product Designer");
  const company = `Northwind ${Date.now()}`;
  await page.type('[data-testid="job-company"]', company);
  await page.type('[data-testid="job-description"]', "Remote product design role. Experience with Figma. You will increase conversion.");
  await page.click('[data-testid="add-job-form"] button[type="submit"]');
  await page.waitForFunction(() => !document.querySelector('[data-testid="add-job-form"]'));
  await page.waitForFunction(
    (name) => [...document.querySelectorAll('[data-testid="job-row"]')].some((row) => row.textContent.includes(name)),
    {},
    company,
  );
  log("manual job visible");

  await page.evaluate((name) => {
    const row = [...document.querySelectorAll('[data-testid="job-row"]')].find((item) => item.textContent.includes(name));
    row.click();
  }, company);
  await page.waitForSelector('[data-testid="job-panel"]');
  const columns = await page.$eval(".columns.with-panel", (node) => getComputedStyle(node).gridTemplateColumns);
  log(`split: ${columns}`);
  if (!columns.includes(" ")) throw new Error(`expected a two-column split, got ${columns}`);
  await page.waitForSelector('[data-testid="fit-for-me"]');
  const fit = await page.$eval('[data-testid="fit-for-me"]', (node) => node.textContent ?? "");
  if (!fit.includes(company) || !fit.includes("Prepare application")) throw new Error(`fit tab: ${fit.slice(0, 180)}`);
  await page.screenshot({ path: "/tmp/ja-split.png" });
  await page.click('[data-testid="description-tab"]');
  await page.waitForFunction(() => (document.querySelector('[data-testid="job-description"]')?.textContent ?? "").includes("Figma"));
  await page.click('[data-testid="fit-tab"]');
  await page.waitForSelector('[data-testid="fit-for-me"]');
  const logos = await page.$$('[data-testid="company-logo"]');
  log(`logos: ${logos.length}`);
  if (logos.length === 0) throw new Error("expected a company logo on at least one listing");
  await page.click('[data-testid="save-application"]');
  await page.waitForFunction(() => document.body.textContent.includes("Saved"));
  log("application saved");

  await page.goto(`${base}/skills`, { waitUntil: "networkidle0" });
  await page.click('[data-testid="add-skill"]');
  await page.waitForSelector('[data-testid="skill-name"]');
  await page.type('[data-testid="skill-name"]', "Figma");
  await page.click('[data-testid="skill-form"] button[type="submit"]');
  await page.waitForFunction(() => !document.querySelector('[data-testid="skill-form"]'));
  await page.waitForFunction(() => document.body.textContent.includes("Figma"));
  await page.click('[data-testid="add-bullet"]');
  await page.waitForSelector('[data-testid="bullet-body"]');
  await page.type('[data-testid="bullet-body"]', "Built a Figma library for three squads");
  await page.click('[data-testid="bullet-form"] button[type="submit"]');
  await page.waitForFunction(() => !document.querySelector('[data-testid="bullet-form"]'));
  await page.waitForFunction(() => document.body.textContent.includes("Built a Figma library"));
  log("skill and bullet saved");

  await page.goto(base, { waitUntil: "networkidle0" });
  await page.evaluate(() => {
    const button = [...document.querySelectorAll(".list-switch button")].find((item) => item.textContent.includes("Ready"));
    button.click();
  });
  await page.waitForFunction(
    (name) => [...document.querySelectorAll('[data-testid="job-row"]')].some((row) => row.textContent.includes(name)),
    {},
    company,
  );
  await page.evaluate((name) => {
    const row = [...document.querySelectorAll('[data-testid="job-row"]')].find((item) => item.textContent.includes(name));
    row.click();
  }, company);
  await page.waitForSelector("a[href^='/tailor/']");
  const tailorHref = await page.$eval("a[href^='/tailor/']", (node) => node.getAttribute("href"));
  await page.goto(`${base}${tailorHref}`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.textContent.includes("Prepare application"));
  log("prepare application opened");
  await page.click('[data-testid="save-materials"]');
  await page.waitForFunction(() => location.pathname.startsWith("/applications/"));
  log(`application view: ${page.url()}`);
  await page.waitForSelector('[data-testid="stage-line"]');
  await page.click('[data-testid="stage-interview"]');
  await page.waitForSelector('[data-testid="confirm-stage"]');
  await page.click('[data-testid="confirm-stage"]');
  await page.waitForFunction(() => document.querySelector('[data-testid="stage-interview"]')?.className.includes("current"));
  log("stage moved to interview");
  await page.screenshot({ path: "/tmp/ja-application.png" });

  const resume = await page.evaluate(async () => {
    const response = await fetch(`/api${location.pathname}/resume`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const head = String.fromCharCode(...bytes.slice(0, 5));
    return { status: response.status, head, bytes: Array.from(bytes), size: bytes.length };
  });
  resume.hasBullet = pdfHas(resume.bytes, "Figma");
  delete resume.bytes;
  log(`pdf: ${JSON.stringify(resume)}`);
  if (resume.head !== "%PDF-" || !resume.hasBullet) throw new Error(`PDF check failed ${JSON.stringify(resume)}`);

  await page.click('[data-testid="theme-toggle"]');
  await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  await page.screenshot({ path: "/tmp/ja-dark.png" });
  log("dark theme on");

  await page.setViewport({ width: 390, height: 844 });
  await page.goto(base, { waitUntil: "networkidle0" });
  await page.screenshot({ path: "/tmp/ja-mobile.png" });
  log("mobile home captured");

  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(base, { waitUntil: "networkidle0" });
  await page.click('[data-testid="paste-url"]');
  await page.waitForSelector('[data-testid="paste-input"]');
  await page.type('[data-testid="paste-input"]', "https://www.linkedin.com/jobs/view/123");
  await page.click('[data-testid="paste-form"] button[type="submit"]');
  await page.waitForFunction(() => document.body.textContent.includes("linkedin.com"));
  log("linkedin paste refused");

  await page.goto(`${base}/positioning`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.textContent.includes("Graphic design") || document.body.textContent.includes("UX"));
  log("positioning page rendered");

  await page.goto(`${base}/applications`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.textContent.includes("Gmail is off") || document.body.textContent.includes("Connect Gmail"));
  log("gmail stays manual without credentials");
} catch (error) {
  await page.screenshot({ path: "/tmp/ja-fail.png" }).catch(() => {});
  console.error("FAILED", error);
  process.exitCode = 1;
} finally {
  console.log(notes.join("\n"));
  await browser.close();
}
