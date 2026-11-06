import PDFDocument from "pdfkit";
import { themeById, type Theme } from "./resume";
import type { Profile, ResumeContent } from "./types";

function collect(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function font(theme: Theme, bold = false): string {
  if (theme.font === "Helvetica") return bold ? "Helvetica-Bold" : "Helvetica";
  return bold ? "Times-Bold" : "Times-Roman";
}

function drawMark(doc: PDFKit.PDFDocument, theme: Theme, x: number, y: number) {
  doc.save();
  doc.fillColor(theme.accent);
  if (theme.id === "signal") {
    doc.roundedRect(x, y, 28, 28, 6).fill();
  } else if (theme.id === "ledger") {
    doc.moveTo(x + 14, y).lineTo(x + 28, y + 14).lineTo(x + 14, y + 28).lineTo(x, y + 14).fill();
  } else if (theme.id === "field") {
    doc.rect(x, y + 16, 28, 3).rect(x, y + 8, 20, 3).rect(x, y, 12, 3).fill();
  } else {
    doc.circle(x + 14, y + 14, 14).fill();
  }
  doc.fillColor("#FFFFFF").font(font(theme, true)).fontSize(11);
  doc.restore();
}

function writeBody(doc: PDFKit.PDFDocument, theme: Theme, profile: Profile, content: ResumeContent, letter: boolean) {
  const left = 56;
  const width = 500;
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(theme.paper);
  drawMark(doc, theme, left, 46);
  doc.fillColor(theme.ink).font(font(theme, true)).fontSize(22);
  doc.text(profile.displayName || "Name", left, 86, { width });
  doc.font(font(theme)).fontSize(11).fillColor(theme.accent);
  const contact = [profile.headline, profile.email, profile.phone, profile.location]
    .map((item) => item.trim())
    .filter(Boolean)
    .join("  ·  ");
  if (contact) doc.text(contact, left, 114, { width });
  doc.moveTo(left, 136).lineTo(556, 136).strokeColor(theme.rule).lineWidth(1).stroke();
  doc.fillColor(theme.ink).font(font(theme)).fontSize(10);
  doc.text(`Prepared for ${content.targetTitle} · ${content.targetCompany}`, left, 146, { width });

  let y = 172;
  const section = (label: string) => {
    doc.fillColor(theme.accent).font(font(theme, true)).fontSize(9).text(label.toUpperCase(), left, y, { width, characterSpacing: 1 });
    y = doc.y + 6;
    doc.fillColor(theme.ink).font(font(theme)).fontSize(11);
  };

  if (letter) {
    section("Letter");
    doc.text(content.coverLetter || "", left, y, { width, lineGap: 3 });
    return;
  }

  if (content.summary) {
    section("Summary");
    doc.text(content.summary, left, y, { width, lineGap: 2 });
    y = doc.y + 14;
  }

  if (content.bullets.length) {
    section("Selected work");
    const groups = new Map<string, string[]>();
    for (const bullet of content.bullets) {
      const key = bullet.context.trim() || "Experience";
      const list = groups.get(key) ?? [];
      list.push((bullet.after || bullet.before).trim());
      groups.set(key, list);
    }
    for (const [context, lines] of groups) {
      doc.font(font(theme, true)).fontSize(12).fillColor(theme.ink).text(context, left, y, { width });
      y = doc.y + 2;
      doc.font(font(theme)).fontSize(11);
      for (const line of lines) {
        doc.text(`•  ${line}`, left, y, { width, lineGap: 2 });
        y = doc.y + 2;
      }
      y += 6;
    }
  }

  if (content.skillNames.length) {
    section("Skills");
    doc.text(content.skillNames.join("   ·   "), left, y, { width });
    y = doc.y + 14;
  }

  if (content.portfolio.length) {
    section("Portfolio");
    for (const piece of content.portfolio) {
      const line = [piece.title, piece.url, piece.summary].filter(Boolean).join(" — ");
      doc.text(line, left, y, { width });
      y = doc.y + 4;
    }
  }

  if (!content.summary && content.bullets.length === 0 && content.skillNames.length === 0) {
    section("Facts");
    doc.text("No resume facts have been added yet.", left, y, { width });
  }
}

export async function renderPdf(profile: Profile, content: ResumeContent, letter = false): Promise<Buffer> {
  const theme = themeById(content.themeId);
  const doc = new PDFDocument({ size: "LETTER", margin: 56 });
  const done = collect(doc);
  writeBody(doc, theme, profile, content, letter);
  doc.end();
  return done;
}
