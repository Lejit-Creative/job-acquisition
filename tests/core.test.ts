import assert from "node:assert/strict";
import test from "node:test";
import { blockedHost } from "../lib/connectors";
import { extractTerms, mapTerms, questionsFor } from "../lib/extract";
import { DEFAULT_FIELDS, classifyField, isRemote } from "../lib/fields";
import { parsePay, payDecision } from "../lib/pay";
import { formatDuration, suggestStage } from "../lib/stages";
import { skillHits, skillMatchScore, synopsis } from "../lib/fit";
import { brandFromHtml } from "../lib/logos";
import { grounded, repairMojibake, wordCount } from "../lib/text";

test("repairs latin1-misread locations without touching real text", () => {
  const muscat = "Ù\u0085Ø³Ù\u0082Ø·";
  assert.equal(repairMojibake(muscat), "مسقط");
  assert.equal(repairMojibake("Café"), "Café");
  assert.equal(repairMojibake("Remote"), "Remote");
});

test("fit tab uses the posting and the skill library", () => {
  const skills = [{ id: 1, name: "Figma", category: "", notes: "" }];
  const description = "Remote product design role.\nExperience with Figma.\nYou will increase conversion.";
  const hits = skillHits(description, skills);
  assert.equal(hits.length, 1);
  assert.match(hits[0].line, /Figma/);
  assert.equal(skillMatchScore(description, skills).score, 100);
  assert.equal(skillHits(description, []).length, 0);
  const line = synopsis({
    title: "Product Designer",
    company: "Northwind",
    location: "Remote",
    remote: true,
    payMin: null,
    payMax: null,
    currency: "USD",
    payUnknown: true,
    description,
  });
  assert.match(line, /Product Designer at Northwind/);
  assert.match(line, /Remote product design role/);
  assert.equal(line.includes("Remote, Remote"), false);
});

test("board html yields a logo and ignores blocked hosts", () => {
  const ashby = brandFromHtml(
    `"publicWebsite":"https://linear.app/","logoWordmarkImageUrl":"https://app.ashbyhq.com/api/images/logo.png"`,
    "https://jobs.ashbyhq.com/linear",
  );
  assert.equal(ashby.logoUrl, "https://app.ashbyhq.com/api/images/logo.png");
  assert.equal(ashby.companyUrl, "https://linear.app/");
  const greenhouse = brandFromHtml(
    `<img src="https://s2-recruiting.cdn.greenhouse.io/logos/acme.png" alt="Acme Logo">`,
    "https://job-boards.greenhouse.io/acme",
  );
  assert.match(greenhouse.logoUrl, /acme\.png/);
  const blocked = brandFromHtml(
    `<img src="https://media.licdn.com/logo.png" alt="Logo">`,
    "https://jobs.ashbyhq.com/acme",
  );
  assert.equal(blocked.logoUrl, "");
});

test("pay range and hourly", () => {
  assert.deepEqual(parsePay("$120,000 - $150,000"), { min: 120000, max: 150000, currency: "USD" });
  assert.equal(parsePay("$80k–$110k").min, 80000);
  assert.equal(parsePay("$45/hour").min, 45 * 2080);
  assert.equal(parsePay("competitive pay").min, null);
  assert.equal(payDecision(null, null, 50000, "USD").unknown, true);
  assert.equal(payDecision(40000, null, 50000, "USD").keep, false);
  assert.equal(payDecision(40000, 80000, 50000, "USD").keep, true);
  assert.equal(payDecision(30000, 40000, 50000, "EUR").keep, true);
});

test("fields and remote defaults", () => {
  assert.equal(classifyField("Brand Designer", "", "", DEFAULT_FIELDS, ""), "graphic-design");
  assert.equal(classifyField("Product Designer", "", "", DEFAULT_FIELDS, ""), "ux");
  assert.equal(classifyField("FP&A Analyst", "", "", DEFAULT_FIELDS, ""), "finance");
  assert.equal(classifyField("Business Operations Manager", "", "", DEFAULT_FIELDS, ""), "business");
  assert.equal(classifyField("Head of Finance, Canada", "", "", DEFAULT_FIELDS, ""), "finance");
  assert.equal(classifyField("Technical Program Manager", "", "", DEFAULT_FIELDS, ""), null);
  assert.equal(classifyField("Clinical Coordination Manager", "finance, design, ops", "we do finance", DEFAULT_FIELDS, ""), null);
  assert.equal(classifyField("Backend Engineer", "design", "we design systems", DEFAULT_FIELDS, ""), null);
  assert.equal(isRemote("Remote, US", null), true);
  assert.equal(isRemote("San Francisco", "hybrid"), false);
  assert.equal(isRemote("New York", null), false);
});

test("blocked boards and stage suggestions", () => {
  assert.equal(blockedHost(new URL("https://www.linkedin.com/jobs/view/1")), "linkedin.com");
  assert.equal(blockedHost(new URL("https://indeed.com/viewjob")), "indeed.com");
  assert.equal(blockedHost(new URL("https://boards.greenhouse.io/figma/jobs/1")), null);
  assert.equal(suggestStage("We would like to schedule a phone screen")?.stage, "interview");
  assert.equal(suggestStage("Your application is under review")?.stage, "in_review");
  assert.equal(suggestStage("we are pleased to offer you the role")?.stage, "offer");
  assert.equal(suggestStage("this role offers great benefits"), null);
  assert.equal(formatDuration(2 * 24 * 60 * 60 * 1000), "2d");
});

test("bullets stay grounded and under 20 words", () => {
  assert.equal(wordCount("Led a rebrand for three teams"), 6);
  assert.equal(grounded("Raised conversion 12%", "conversion went up 12%"), true);
  assert.equal(grounded("Raised conversion 18%", "conversion went up 12%"), false);
  const mapped = mapTerms(extractTerms("Experience with Figma. You will increase conversion."), [
    { id: 1, body: "Built a Figma library for three squads", context: "", skillIds: [] },
  ]);
  assert.equal(mapped.some((item) => item.term.toLowerCase().includes("figma") && !item.gap), true);
  assert.ok(questionsFor(mapped).length <= 5);
});
