"use client";

import { FormEvent, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

type TranslatorStudioProps = {
  open: boolean;
  onClose: () => void;
};

type TranslationResult = {
  detectedLanguage: string;
  detectedLanguageCode: string;
  targetLanguage: string;
  targetLanguageCode: string;
  translation: string;
  pronunciation: string;
  culturalNote: string;
};

const languages = [
  ["de", "Deutsch"],
  ["en", "Englisch"],
  ["es", "Spanisch"],
  ["fr", "Französisch"],
  ["it", "Italienisch"],
  ["pt", "Portugiesisch"],
  ["nl", "Niederländisch"],
  ["tr", "Türkisch"],
  ["el", "Griechisch"],
  ["ar", "Arabisch"],
  ["hr", "Kroatisch"],
  ["hu", "Ungarisch"],
  ["pl", "Polnisch"],
  ["ja", "Japanisch"],
  ["ko", "Koreanisch"],
  ["zh", "Chinesisch"],
] as const;

export function TranslatorStudio({ open, onClose }: TranslatorStudioProps) {
  const [text, setText] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("en");
  const [style, setStyle] = useState<"natural" | "polite">("natural");
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      window.speechSynthesis?.cancel();
      setCopied(false);
    }
  }, [open]);

  async function translate(event?: FormEvent) {
    event?.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setNotice(null);
    setCopied(false);
    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, targetLanguage, style }),
      });
      const translated = (await response.json()) as TranslationResult & { error?: string };
      if (!response.ok || !translated.translation) {
        throw new Error(translated.error || "Die Übersetzung ist fehlgeschlagen.");
      }
      setResult(translated);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Die Übersetzung ist fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function copyTranslation() {
    if (!result?.translation) return;
    try {
      await navigator.clipboard.writeText(result.translation);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_800);
    } catch {
      setNotice("Kopieren wurde vom Browser blockiert.");
    }
  }

  function speakTranslation() {
    if (!result?.translation || !("speechSynthesis" in window)) {
      setNotice("Vorlesen wird von diesem Browser nicht unterstützt.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(result.translation);
    utterance.lang = result.targetLanguageCode;
    window.speechSynthesis.speak(utterance);
  }

  function swapLanguages() {
    if (!result) return;
    const detectedCode = languages.some(([code]) => code === result.detectedLanguageCode)
      ? result.detectedLanguageCode
      : "de";
    setText(result.translation);
    setTargetLanguage(detectedCode);
    setResult(null);
    setNotice(null);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="translator-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => event.target === event.currentTarget && onClose()}
        >
          <motion.section
            className="translator-studio"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="translator-title"
          >
            <header className="translator-header">
              <div>
                <small>AION REISEÜBERSETZER</small>
                <h2 id="translator-title">Verstehen, überall</h2>
                <p>Sprache automatisch erkennen · Natürlich übersetzen</p>
              </div>
              <button onClick={onClose} aria-label="Übersetzer schließen">×</button>
            </header>

            <form className="translator-body" onSubmit={translate}>
              <section className="translator-input">
                <div className="translator-language-row">
                  <span>SPRACHE AUTOMATISCH ERKENNEN</span>
                  {result && <strong>{result.detectedLanguage}</strong>}
                </div>
                <textarea
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="Schreib hier, was du unterwegs sagen oder verstehen möchtest …"
                  maxLength={8_000}
                  autoFocus
                />
                <span className="translator-count">{text.length.toLocaleString("de-DE")} / 8.000</span>
              </section>

              <button
                className="translator-swap"
                type="button"
                onClick={swapLanguages}
                disabled={!result}
                aria-label="Sprachen tauschen"
                title="Übersetzung als neuen Ausgangstext übernehmen"
              >
                ⇄
              </button>

              <section className="translator-output">
                <div className="translator-language-row">
                  <label>
                    <span>ZIELSPRACHE</span>
                    <select
                      value={targetLanguage}
                      onChange={(event) => {
                        setTargetLanguage(event.target.value);
                        setResult(null);
                      }}
                    >
                      {languages.map(([code, name]) => (
                        <option key={code} value={code}>{name}</option>
                      ))}
                    </select>
                  </label>
                  <div className="translator-style">
                    <button
                      type="button"
                      className={style === "natural" ? "active" : ""}
                      onClick={() => setStyle("natural")}
                    >
                      Natürlich
                    </button>
                    <button
                      type="button"
                      className={style === "polite" ? "active" : ""}
                      onClick={() => setStyle("polite")}
                    >
                      Höflich
                    </button>
                  </div>
                </div>

                <div className={`translator-result ${result ? "filled" : ""}`}>
                  {result ? (
                    <>
                      <p>{result.translation}</p>
                      {result.pronunciation && (
                        <div>
                          <small>AUSSPRACHE</small>
                          <span>{result.pronunciation}</span>
                        </div>
                      )}
                      {result.culturalNote && (
                        <aside>
                          <strong>Gut zu wissen</strong>
                          <span>{result.culturalNote}</span>
                        </aside>
                      )}
                    </>
                  ) : (
                    <p>Hier erscheint deine Übersetzung.</p>
                  )}
                </div>

                <div className="translator-actions">
                  <button type="button" onClick={speakTranslation} disabled={!result}>
                    ◖ Vorlesen
                  </button>
                  <button type="button" onClick={() => void copyTranslation()} disabled={!result}>
                    {copied ? "✓ Kopiert" : "□ Kopieren"}
                  </button>
                  <button className="translator-submit" disabled={busy || !text.trim()}>
                    {busy ? "AION übersetzt …" : "Jetzt übersetzen"} <span>→</span>
                  </button>
                </div>
                {notice && <p className="translator-notice">{notice}</p>}
              </section>
            </form>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
