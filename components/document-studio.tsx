"use client";

import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

type DocumentFormat = "pdf" | "docx" | "xlsx" | "pptx" | "md" | "html" | "txt" | "csv";

type DocumentStudioProps = {
  open: boolean;
  onClose: () => void;
};

type DocumentAction = "zusammenfassen" | "verbessern" | "strukturieren";

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

const supportedInput =
  ".txt,.md,.html,.htm,.csv,.json,.docx,.xlsx,.pptx,.pdf,.png,.jpg,.jpeg,.webp";
const maxFileSize = 15 * 1024 * 1024;
const maxOcrPdfPages = 8;

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

function stripHtml(value: string) {
  const document = new DOMParser().parseFromString(value, "text/html");
  return document.body.textContent?.replace(/\n{3,}/g, "\n\n").trim() || "";
}

function extensionOf(filename: string) {
  return filename.toLowerCase().split(".").pop() || "";
}

function titleFromFilename(filename: string) {
  return filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Importiertes Dokument";
}

export function DocumentStudio({ open, onClose }: DocumentStudioProps) {
  const [title, setTitle] = useState(templates.frei.title);
  const [content, setContent] = useState(templates.frei.content);
  const [format, setFormat] = useState<DocumentFormat>("pdf");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sourceFile, setSourceFile] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const wordCount = useMemo(
    () => content.trim().split(/\s+/).filter(Boolean).length,
    [content],
  );

  function applyTemplate(key: keyof typeof templates) {
    setTitle(templates[key].title);
    setContent(templates[key].content);
    setSourceFile(null);
    setNotice(null);
  }

  async function runAionAction(action: DocumentAction) {
    if (!content.trim() || busy) {
      setNotice("Öffne oder schreibe zuerst ein Dokument.");
      return;
    }

    const instructions: Record<DocumentAction, string> = {
      zusammenfassen:
        "Fasse das Dokument präzise zusammen. Erhalte wichtige Fakten, Entscheidungen, Termine und offene Punkte.",
      verbessern:
        "Überarbeite das Dokument sprachlich. Mache es klar, professionell und gut lesbar, ohne Fakten hinzuzuerfinden.",
      strukturieren:
        "Strukturiere das Dokument sinnvoll mit passenden Überschriften, Absätzen und Aufzählungen. Erhalte den vollständigen Inhalt.",
    };

    setBusy(true);
    setNotice(`AION beginnt: ${action} …`);

    try {
      const response = await fetch("/api/aion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "alltag",
          messages: [{ role: "user", content: instructions[action] }],
          document: { title, content },
        }),
      });
      const result = (await response.json()) as { message?: string; error?: string };
      if (!response.ok || !result.message) {
        throw new Error(result.error || "AION konnte das Dokument nicht bearbeiten.");
      }
      setContent(result.message);
      setNotice(`AION hat das Dokument ${action === "verbessern" ? "verbessert" : action === "strukturieren" ? "strukturiert" : "zusammengefasst"}.`);
    } catch (actionError) {
      setNotice(
        actionError instanceof Error
          ? actionError.message
          : "AION konnte das Dokument nicht bearbeiten.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function recognizeImages(
    sources: (File | HTMLCanvasElement)[],
    pageLabel = "Bild",
  ) {
    const { createWorker } = await import("tesseract.js");
    let activeSource = 0;
    const worker = await createWorker(["deu", "eng"], undefined, {
      logger: (message) => {
        if (message.status !== "recognizing text") return;
        const overall = (activeSource + message.progress) / sources.length;
        setOcrProgress(Math.round(overall * 100));
      },
    });

    const results: string[] = [];
    try {
      for (const [index, source] of sources.entries()) {
        activeSource = index;
        setNotice(`AION erkennt Text in ${pageLabel} ${index + 1} von ${sources.length} …`);
        const result = await worker.recognize(source);
        const text = result.data.text.trim();
        if (text) results.push(`${pageLabel} ${index + 1}\n${text}`);
      }
    } finally {
      await worker.terminate();
      setOcrProgress(null);
    }

    return results.join("\n\n");
  }

  async function importFile(file: File) {
    if (file.size > maxFileSize) {
      setNotice("Die Datei ist größer als 15 MB. Bitte verwende eine kleinere Datei.");
      return;
    }

    const extension = extensionOf(file.name);
    const allowed = [
      "txt",
      "md",
      "html",
      "htm",
      "csv",
      "json",
      "docx",
      "xlsx",
      "pptx",
      "pdf",
      "png",
      "jpg",
      "jpeg",
      "webp",
    ];
    if (!allowed.includes(extension)) {
      setNotice("Dieses Format wird noch nicht unterstützt.");
      return;
    }

    setBusy(true);
    setNotice(`AION liest ${file.name} …`);

    try {
      const buffer = await file.arrayBuffer();
      let extracted = "";

      if (["png", "jpg", "jpeg", "webp"].includes(extension)) {
        extracted = await recognizeImages([file]);
      } else if (["txt", "md", "csv"].includes(extension)) {
        extracted = new TextDecoder().decode(buffer);
      } else if (extension === "json") {
        const parsed = JSON.parse(new TextDecoder().decode(buffer)) as unknown;
        extracted = JSON.stringify(parsed, null, 2);
      } else if (extension === "html" || extension === "htm") {
        extracted = stripHtml(new TextDecoder().decode(buffer));
      } else if (extension === "docx") {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ arrayBuffer: buffer });
        extracted = result.value;
      } else if (extension === "xlsx") {
        const ExcelJS = await import("exceljs");
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        const sheets: string[] = [];
        workbook.eachSheet((sheet) => {
          const rows: string[] = [];
          sheet.eachRow((row) => {
            const values = Array.isArray(row.values) ? row.values.slice(1) : [];
            rows.push(
              values
                .map((value) => (value == null ? "" : String(value)))
                .join(" | "),
            );
          });
          sheets.push(`${sheet.name}\n${rows.join("\n")}`);
        });
        extracted = sheets.join("\n\n");
      } else if (extension === "pptx") {
        const JSZip = (await import("jszip")).default;
        const archive = await JSZip.loadAsync(buffer);
        const slideNames = Object.keys(archive.files)
          .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
          .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
        const slides: string[] = [];
        for (const [index, name] of slideNames.entries()) {
          const xml = await archive.file(name)?.async("string");
          if (!xml) continue;
          const parsed = new DOMParser().parseFromString(xml, "application/xml");
          const text = Array.from(parsed.getElementsByTagName("a:t"))
            .map((node) => node.textContent || "")
            .filter(Boolean)
            .join("\n");
          slides.push(`Folie ${index + 1}\n${text}`);
        }
        extracted = slides.join("\n\n");
      } else if (extension === "pdf") {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
        const pages: string[] = [];
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const text = await page.getTextContent();
          pages.push(
            `Seite ${pageNumber}\n${text.items
              .map((item) => ("str" in item ? item.str : ""))
              .join(" ")}`,
          );
        }
        extracted = pages.join("\n\n").trim();

        const meaningfulText = extracted
          .replace(/Seite \d+/g, "")
          .replace(/\s+/g, "")
          .trim();

        if (meaningfulText.length < 20) {
          const pageCount = Math.min(pdf.numPages, maxOcrPdfPages);
          setNotice(
            pdf.numPages > maxOcrPdfPages
              ? `Scan erkannt. AION liest aus Sicherheitsgründen zunächst die ersten ${maxOcrPdfPages} Seiten.`
              : "Scan erkannt. AION startet die lokale Texterkennung …",
          );
          const canvases: HTMLCanvasElement[] = [];
          for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
            const page = await pdf.getPage(pageNumber);
            const viewport = page.getViewport({ scale: 1.65 });
            const canvas = document.createElement("canvas");
            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);
            const context = canvas.getContext("2d", { willReadFrequently: true });
            if (!context) continue;
            await page.render({ canvas, canvasContext: context, viewport }).promise;
            canvases.push(canvas);
          }
          extracted = await recognizeImages(canvases, "Seite");
          if (pdf.numPages > maxOcrPdfPages && extracted) {
            extracted += `\n\nHinweis: Die PDF enthält ${pdf.numPages} Seiten. OCR wurde für die ersten ${maxOcrPdfPages} Seiten ausgeführt.`;
          }
        }
      }

      if (!extracted.trim()) {
        throw new Error("empty");
      }

      setTitle(titleFromFilename(file.name));
      setContent(extracted.trim());
      setSourceFile(file.name);
      setNotice(`${file.name} wurde lokal eingelesen. Wähle jetzt das gewünschte Ausgabeformat.`);
    } catch {
      setNotice(
        ["pdf", "png", "jpg", "jpeg", "webp"].includes(extension)
          ? "Die Texterkennung ist fehlgeschlagen. Die Datei ist möglicherweise geschützt, zu undeutlich oder beschädigt."
          : "Die Datei konnte nicht gelesen werden. Sie ist möglicherweise geschützt oder beschädigt.",
      );
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
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
                <div className="aion-document-tools">
                  <span>AION KI</span>
                  <button onClick={() => void runAionAction("zusammenfassen")} disabled={busy}>
                    Zusammenfassen
                  </button>
                  <button onClick={() => void runAionAction("verbessern")} disabled={busy}>
                    Verbessern
                  </button>
                  <button onClick={() => void runAionAction("strukturieren")} disabled={busy}>
                    Strukturieren
                  </button>
                </div>
                <div
                  className={`file-dropzone ${dragging ? "dragging" : ""}`}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={(event) => {
                    if (event.currentTarget === event.target) setDragging(false);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    const file = event.dataTransfer.files[0];
                    if (file) void importFile(file);
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={supportedInput}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void importFile(file);
                    }}
                  />
                  <div>
                    <strong>{sourceFile ? `Geöffnet: ${sourceFile}` : "Vorhandenes Dokument öffnen"}</strong>
                    <span>Dokument oder Scan ablegen · maximal 15 MB</span>
                  </div>
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                    {busy ? "Wird gelesen …" : "Datei wählen"}
                  </button>
                </div>
                {ocrProgress !== null && (
                  <div className="ocr-progress" aria-live="polite">
                    <div>
                      <span style={{ width: `${ocrProgress}%` }} />
                    </div>
                    <p>Lokale Texterkennung · {ocrProgress}%</p>
                  </div>
                )}
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
                  <span>{sourceFile ? "lokal importiert" : "lokale Verarbeitung"}</span>
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
