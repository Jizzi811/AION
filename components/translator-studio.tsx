"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
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
  const [targetLanguage, setTargetLanguage] = useState("de");
  const [style, setStyle] = useState<"natural" | "polite">("natural");
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [recordingState, setRecordingState] = useState<
    "idle" | "listening" | "processing"
  >("idle");
  const [heardSpeech, setHeardSpeech] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const recordingStartedAtRef = useRef(0);
  const lastSpeechAtRef = useRef(0);
  const speechDetectedRef = useRef(false);

  const releaseMicrophone = useCallback(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) {
      window.speechSynthesis?.cancel();
      const recorder = mediaRecorderRef.current;
      recorder?.state === "recording" && recorder.stop();
      releaseMicrophone();
      setRecordingState("idle");
      setHeardSpeech(false);
      setCopied(false);
    }
  }, [open, releaseMicrophone]);

  useEffect(
    () => () => {
      const recorder = mediaRecorderRef.current;
      recorder?.state === "recording" && recorder.stop();
      releaseMicrophone();
    },
    [releaseMicrophone],
  );

  const translateText = useCallback(async (sourceText: string) => {
    if (!sourceText.trim()) return;
    setBusy(true);
    setNotice(null);
    setCopied(false);
    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sourceText, targetLanguage, style }),
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
  }, [style, targetLanguage]);

  async function translate(event?: FormEvent) {
    event?.preventDefault();
    if (!text.trim() || busy) return;
    await translateText(text);
  }

  function stopListening() {
    const recorder = mediaRecorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
  }

  async function startListening() {
    if (recordingState !== "idle" || busy) return;
    if (!navigator.mediaDevices?.getUserMedia || !("MediaRecorder" in window)) {
      setNotice("Die Live-Übersetzung wird von diesem Browser nicht unterstützt.");
      return;
    }

    setNotice(null);
    setResult(null);
    setHeardSpeech(false);
    speechDetectedRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const supportedType = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/webm",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(
        stream,
        supportedType ? { mimeType: supportedType } : undefined,
      );
      const chunks: BlobPart[] = [];
      mediaRecorderRef.current = recorder;
      recordingStartedAtRef.current = Date.now();
      lastSpeechAtRef.current = Date.now();

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      });
      recorder.addEventListener("stop", () => {
        const speechWasDetected = speechDetectedRef.current;
        const mimeType = recorder.mimeType || "audio/webm";
        releaseMicrophone();
        mediaRecorderRef.current = null;

        if (!speechWasDetected || chunks.length === 0) {
          setRecordingState("idle");
          setNotice("Ich habe keine deutliche Sprache gehört. Versuch es bitte noch einmal.");
          return;
        }

        setRecordingState("processing");
        const audio = new Blob(chunks, { type: mimeType });
        const extension = mimeType.includes("mp4") ? "m4a" : "webm";
        const formData = new FormData();
        formData.append("audio", audio, `aion-live.${extension}`);

        void fetch("/api/translate/audio", {
          method: "POST",
          body: formData,
        })
          .then(async (response) => {
            const body = (await response.json()) as { text?: string; error?: string };
            if (!response.ok || !body.text) {
              throw new Error(body.error || "Die Sprache konnte nicht erkannt werden.");
            }
            setText(body.text);
            await translateText(body.text);
          })
          .catch((error) => {
            setNotice(
              error instanceof Error
                ? error.message
                : "Die Sprache konnte nicht erkannt werden.",
            );
          })
          .finally(() => setRecordingState("idle"));
      });

      const AudioContextConstructor =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioContextConstructor) {
        const audioContext = new AudioContextConstructor();
        audioContextRef.current = audioContext;
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const samples = new Uint8Array(analyser.fftSize);

        const watchVolume = () => {
          if (recorder.state !== "recording") return;
          analyser.getByteTimeDomainData(samples);
          let energy = 0;
          for (const sample of samples) {
            const normalized = (sample - 128) / 128;
            energy += normalized * normalized;
          }
          const rms = Math.sqrt(energy / samples.length);
          const now = Date.now();

          if (rms > 0.035) {
            speechDetectedRef.current = true;
            setHeardSpeech(true);
            lastSpeechAtRef.current = now;
          }

          const recordingDuration = now - recordingStartedAtRef.current;
          const silenceDuration = now - lastSpeechAtRef.current;
          if (
            (speechDetectedRef.current && recordingDuration > 1_000 && silenceDuration > 1_500) ||
            recordingDuration > 30_000 ||
            (!speechDetectedRef.current && recordingDuration > 10_000)
          ) {
            recorder.stop();
            return;
          }
          animationFrameRef.current = window.requestAnimationFrame(watchVolume);
        };
        animationFrameRef.current = window.requestAnimationFrame(watchVolume);
      }

      recorder.start(250);
      setRecordingState("listening");
    } catch (error) {
      releaseMicrophone();
      setRecordingState("idle");
      setNotice(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Bitte erlaube AION den Mikrofonzugriff in deinem Browser."
          : "Das Mikrofon konnte nicht gestartet werden.",
      );
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
                <div className={`translator-live ${recordingState}`}>
                  <div>
                    <strong>
                      {recordingState === "listening"
                        ? heardSpeech
                          ? "Sprache erkannt"
                          : "AION hört zu …"
                        : recordingState === "processing"
                          ? "AION erkennt und übersetzt …"
                          : "Live aus der Umgebung"}
                    </strong>
                    <span>
                      {recordingState === "listening"
                        ? "Sprich in normaler Lautstärke. Nach einer Pause stoppt AION automatisch."
                        : "Zielsprache wählen, Mikrofon starten und das Gegenüber sprechen lassen."}
                    </span>
                  </div>
                  {recordingState === "listening" ? (
                    <button type="button" onClick={stopListening}>
                      <i />
                      Stoppen
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void startListening()}
                      disabled={recordingState === "processing" || busy}
                    >
                      <i />
                      Mikrofon starten
                    </button>
                  )}
                </div>
                <textarea
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="Oder schreib hier, was du unterwegs sagen oder verstehen möchtest …"
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
