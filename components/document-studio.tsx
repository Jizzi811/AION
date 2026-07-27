"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

type DocumentFormat = "pdf" | "docx" | "xlsx" | "pptx" | "md" | "html" | "txt" | "csv";

type DocumentStudioProps = {
  open: boolean;
  onClose: () => void;
};

const formats: { id: DocumentFormat; label: string; description: string }[] = [
  { id: "pdf", label: "PDF", description: "Fertig zum Teilen" },
  { id: "docx", label: "Word", description: "Weiterbearbeitbar" },
  { id: "xlsx", label: "Excel", description: "Zeilen als Tabelle" },
  { id: "pptx", label: "PowerPoint", description: "Absätze als Folien" },
  { id: "md", label: "Markdown", description: "Sauber strukturiert" },
  { id: "html", label: "HTML", description: "Für Web & E-Mail" },
  { id: "txt", label: "Text", description: "Universell lesbar" },
  { id: "csv", label: "CSV", description: "Für Tabellen" },
];

const templates = {
  frei: {
    label: "Freies Dokument",
    title: "Mein Dokument",
    content: "Beginne hier mit deinem Inhalt …",
  },
  brief: {
    label: "Geschäftsbrief",
    title: "Betreff des Schreibens",
    content:
      "Sehr geehrte Damen und Herren,\n\nhier steht dein Anliegen. Beschreibe kurz, klar und vollständig, worum es geht.\n\nMit freundlichen Grüßen\n[Name]",
  },
  protokoll: {
    label: "Besprechungsprotokoll",
    title: "Besprechungsprotokoll",
    content:
      "Datum: \nTeilnehmende: \n\nThemen\n1. \n2. \n\nEntscheidungen\n- \n\nNächste Schritte\n- Aufgabe | Verantwortlich | Termin",
  },
  rechnung: {
    label: "Rechnung",
    title: "Rechnung",
    content:
      "Rechnungsnummer: \nRechnungsdatum: \nKundin/Kunde: \n\nLeistung | Menge | Einzelpreis | Gesamt\n\nNettobetrag: \nUmsatzsteuer: \nGesamtbetrag: \n\nZahlungsziel: ",
  },
};

function safeFilename(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[ä]/g, "ae")
      .replace(/[ö]/g, "oe")
      .replace(/[ü]/g, "ue")
      .replace(/[ß]/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "aion-dokument"
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function DocumentStudio({ open, onClose }: DocumentStudioProps) {
  const [title, setTitle] = useState(templates.frei.title);
  const [content, setContent] = useState(templates.frei.content);
  const [format, setFormat] = useState<DocumentFormat>("pdf");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const wordCount = useMemo(
    () => content.trim().split(/\s+/).filter(Boolean).length,
    [content],
  );

  function applyTemplate(key: keyof typeof templates) {
    setTitle(templates[key].title);
    setContent(templates[key].content);
    setNotice(null);
  }

  async function createDocument() {
    if (!content.trim()) {
      setNotice("Gib deinem Dokument zuerst etwas Inhalt.");
      return;
    }

    setBusy(true);
    setNotice(null);
    const filename = safeFilename(title);
    const paragraphs = content.split(/\n+/).filter(Boolean);

    try {
      if (format === "txt" || format === "md") {
        const body = format === "md" ? `# ${title}\n\n${content}` : `${title}\n\n${content}`;
        downloadBlob(new Blob([body], { type: "text/plain;charset=utf-8" }), `${filename}.${format}`);
      } else if (format === "html") {
        const body = paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("\n");
        const html = `<!doctype html><html lang="de"><meta charset="utf-8"><title>${escapeHtml(title)}</title><body><h1>${escapeHtml(title)}</h1>${body}</body></html>`;
        downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), `${filename}.html`);
      } else if (format === "csv") {
        const rows = content.split("\n").map((line) => `"${line.replaceAll('"', '""')}"`);
        downloadBlob(
          new Blob([`\uFEFFInhalt\n${rows.join("\n")}`], { type: "text/csv;charset=utf-8" }),
          `${filename}.csv`,
        );
      } else if (format === "pdf") {
        const { jsPDF } = await import("jspdf");
        const pdf = new jsPDF({ unit: "mm", format: "a4" });
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(20);
        pdf.text(title, 20, 24, { maxWidth: 170 });
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(11);
        const lines = pdf.splitTextToSize(content, 170) as string[];
        let y = 38;
        for (const line of lines) {
          if (y > 278) {
            pdf.addPage();
            y = 22;
          }
          pdf.text(line, 20, y);
          y += 6;
        }
        pdf.save(`${filename}.pdf`);
      } else if (format === "docx") {
        const { Document, HeadingLevel, Packer, Paragraph } = await import("docx");
        const document = new Document({
          sections: [
            {
              children: [
                new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
                ...content.split("\n").map((text) => new Paragraph({ text, spacing: { after: 160 } })),
              ],
            },
          ],
        });
        downloadBlob(await Packer.toBlob(document), `${filename}.docx`);
      } else if (format === "xlsx") {
        const ExcelJS = await import("exceljs");
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet(title.slice(0, 31) || "AION");
        sheet.columns = [{ header: title, key: "content", width: 80 }];
        content.split("\n").forEach((line) => sheet.addRow({ content: line }));
        sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
        sheet.getRow(1).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF33245E" },
        };
        const buffer = await workbook.xlsx.writeBuffer();
        downloadBlob(
          new Blob([buffer], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }),
          `${filename}.xlsx`,
        );
      } else if (format === "pptx") {
        const PptxGenJS = (await import("pptxgenjs")).default;
        const presentation = new PptxGenJS();
        presentation.layout = "LAYOUT_WIDE";
        presentation.author = "AION by Nadj.ai";
        presentation.subject = title;
        const chunks = paragraphs.length ? paragraphs : [content];
        chunks.forEach((paragraph, index) => {
          const slide = presentation.addSlide();
          slide.background = { color: "080714" };
          slide.addText(index === 0 ? title : `Kapitel ${index + 1}`, {
            x: 0.8,
            y: 0.65,
            w: 11.7,
            h: 0.7,
            color: "79E9FF",
            fontFace: "Aptos Display",
            fontSize: 26,
            bold: true,
          });
          slide.addText(paragraph, {
            x: 0.85,
            y: 1.65,
            w: 11.5,
            h: 4.8,
            color: "F5F3FF",
            fontFace: "Aptos",
            fontSize: 20,
            breakLine: false,
            valign: "middle",
            margin: 0.12,
          });
          slide.addText("AION by Nadj.ai", {
            x: 9.9,
            y: 7.05,
            w: 2.4,
            h: 0.2,
            color: "77738C",
            fontSize: 8,
            align: "right",
          });
        });
        await presentation.writeFile({ fileName: `${filename}.pptx` });
      }

      setNotice(`${format.toUpperCase()} wurde erstellt und heruntergeladen.`);
    } catch {
      setNotice("Das Dokument konnte nicht erstellt werden. Bitte versuche es noch einmal.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="studio-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => event.target === event.currentTarget && onClose()}
        >
          <motion.section
            className="document-studio"
            initial={{ opacity: 0, y: 30, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="studio-title"
          >
            <header className="studio-header">
              <div>
                <p>AION WERKZEUG</p>
                <h2 id="studio-title">Dokumentenstudio</h2>
                <span>Erstellen. Gestalten. Im richtigen Format mitnehmen.</span>
              </div>
              <button onClick={onClose} aria-label="Dokumentenstudio schließen">×</button>
            </header>

            <div className="studio-layout">
              <aside className="studio-sidebar">
                <small>VORLAGE</small>
                {(Object.keys(templates) as (keyof typeof templates)[]).map((key) => (
                  <button key={key} onClick={() => applyTemplate(key)}>
                    {templates[key].label}
                  </button>
                ))}
                <div className="privacy-note">
                  <strong>Privat by design</strong>
                  <p>Die Erstellung erfolgt in diesem ersten Modul direkt in deinem Browser.</p>
                </div>
              </aside>

              <div className="studio-editor">
                <label>
                  <span>Titel</span>
                  <input value={title} onChange={(event) => setTitle(event.target.value)} />
                </label>
                <label>
                  <span>Inhalt</span>
                  <textarea value={content} onChange={(event) => setContent(event.target.value)} />
                </label>
                <div className="editor-meta">
                  <span>{wordCount} Wörter</span>
                  <span>{content.length} Zeichen</span>
                  <span>lokale Verarbeitung</span>
                </div>
              </div>

              <aside className="format-panel">
                <small>AUSGABEFORMAT</small>
                <div className="format-grid">
                  {formats.map((item) => (
                    <button
                      key={item.id}
                      className={format === item.id ? "active" : ""}
                      onClick={() => setFormat(item.id)}
                    >
                      <strong>{item.label}</strong>
                      <span>{item.description}</span>
                    </button>
                  ))}
                </div>
                <button className="create-document" onClick={createDocument} disabled={busy}>
                  {busy ? "AION erstellt …" : `${format.toUpperCase()} erstellen`}
                  <span>↓</span>
                </button>
                {notice && <p className="studio-notice">{notice}</p>}
              </aside>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
