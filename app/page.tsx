"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AionChat } from "@/components/aion-chat";
import { CalendarStudio } from "@/components/calendar-studio";
import { DocumentStudio } from "@/components/document-studio";
import { MailStudio } from "@/components/mail-studio";
import { TranslatorStudio } from "@/components/translator-studio";
import { useAionVoice } from "@/hooks/use-aion-voice";
import type { AionMode } from "@/lib/aion-assistant";

type Mode = AionMode;

const modes: Record<
  Mode,
  { label: string; eyebrow: string; prompt: string; accent: string; icon: string }
> = {
  alltag: {
    label: "Alltag",
    eyebrow: "DEIN TAG, KLAR SORTIERT",
    prompt: "Was möchtest du heute leichter machen?",
    accent: "cyan",
    icon: "✦",
  },
  jung: {
    label: "Jung",
    eyebrow: "SCHATTEN & LICHT",
    prompt: "Was in dir möchte gerade gesehen werden?",
    accent: "gold",
    icon: "◐",
  },
  meditation: {
    label: "Meditation",
    eyebrow: "ANKOMMEN & LOSLASSEN",
    prompt: "Wie viel Ruhe brauchst du gerade?",
    accent: "teal",
    icon: "◌",
  },
  wissen: {
    label: "Wissen",
    eyebrow: "FRAGEN. VERSTEHEN. HANDELN.",
    prompt: "Was möchtest du wirklich verstehen?",
    accent: "violet",
    icon: "⌁",
  },
};

const actions = [
  { icon: "☼", title: "Mein Morgen", text: "Wetter, Termine & Fokus", calendarStudio: true },
  { icon: "▱", title: "Dokumente", text: "PDF, Word, Excel & mehr", documentStudio: true },
  { icon: "✉", title: "Postfach", text: "E-Mails lesen & entwerfen", mailStudio: true },
  { icon: "文", title: "Übersetzer", text: "Unterwegs überall verstanden", translatorStudio: true },
  { icon: "◐", title: "Jung-Modus", text: "Innere Muster erkunden", mode: "jung" as Mode },
  { icon: "◌", title: "Zur Ruhe", text: "Meditation & Körperreise", mode: "meditation" as Mode },
  { icon: "⌁", title: "Aktuell", text: "News & Wissen auf den Punkt", mode: "wissen" as Mode },
];

export default function Home() {
  const [activeMode, setActiveMode] = useState<Mode>("alltag");
  const [documentStudioOpen, setDocumentStudioOpen] = useState(false);
  const [calendarStudioOpen, setCalendarStudioOpen] = useState(false);
  const [mailStudioOpen, setMailStudioOpen] = useState(false);
  const [translatorStudioOpen, setTranslatorStudioOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const {
    state: voiceState,
    error,
    messages,
    start: toggleVoice,
    speak,
    handoff,
    clearHandoff,
  } = useAionVoice(activeMode);
  const active = modes[activeMode];

  useEffect(() => {
    if (!handoff) return;
    if (handoff.target === "mail") {
      setMailStudioOpen(true);
    } else {
      setChatOpen(true);
    }
    clearHandoff();
  }, [handoff, clearHandoff]);

  return (
    <main className={`site-shell mode-${active.accent}`}>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="nav-wrap">
        <a className="brand" href="#top" aria-label="AION Startseite">
          <span className="brand-mark">A</span>
          <span className="brand-copy">
            <strong>AION</strong>
            <small>by Nadj.ai</small>
          </span>
        </a>
        <nav aria-label="Hauptnavigation">
          <a href="#moeglichkeiten">Möglichkeiten</a>
          <button className="nav-link" onClick={() => setCalendarStudioOpen(true)}>Kalender</button>
          <button className="nav-link" onClick={() => setMailStudioOpen(true)}>Postfach</button>
          <button className="nav-link" onClick={() => setDocumentStudioOpen(true)}>Dokumente</button>
          <button className="nav-link" onClick={() => setTranslatorStudioOpen(true)}>Übersetzer</button>
          <a href="#balance">Balance</a>
          <a href="#privacy">Privatsphäre</a>
        </nav>
        <button className="nav-button" onClick={() => setChatOpen(true)}>
          AION öffnen <span>↗</span>
        </button>
      </header>

      <section className="hero" id="top">
        <motion.div
          className="hero-copy"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <p className="kicker">
            <span />
            {active.eyebrow}
          </p>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeMode}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35 }}
            >
              <h1>
                Für alles, was außen ansteht.
                <em>Und innen bewegt.</em>
              </h1>
              <p className="intro">
                AION verbindet Wissen, Organisation und innere Balance in einem
                persönlichen Begleiter, der zuhört, versteht und mit dir handelt.
              </p>
            </motion.div>
          </AnimatePresence>

          <div className="mode-switcher" aria-label="AION Modus wählen">
            {(Object.keys(modes) as Mode[]).map((mode) => (
              <button
                key={mode}
                className={activeMode === mode ? "active" : ""}
                onClick={() => {
                  setActiveMode(mode);
                  setChatOpen(true);
                }}
              >
                <span>{modes[mode].icon}</span>
                {modes[mode].label}
              </button>
            ))}
          </div>
        </motion.div>

          <div
            className={`orb-stage ${voiceState} ${
              musicPlaying
                ? activeMode === "jung" || activeMode === "meditation"
                  ? "music-flow"
                  : "dancing"
                : ""
            }`}
          >
          <div className="orbit orbit-a" />
          <div className="orbit orbit-b" />
          <div className="orb-glow" />
          <video
            className="orb-video"
            autoPlay
            muted
            loop
            playsInline
            poster="/aion-orb-poster.png"
            aria-label="Lebendiger, kosmischer AION Orb"
          >
            <source src="/aion-orb-motion.mp4" type="video/mp4" />
          </video>
          <div className="orb-status">
            <span className="status-dot" />
            {musicPlaying
              ? activeMode === "jung" || activeMode === "meditation"
                ? "AION bewegt sich ruhig zur Musik"
                : "AION tanzt – auf eigene Gefahr"
              : voiceState === "connecting"
              ? "AION verbindet sich …"
              : voiceState === "listening"
                ? "AION hört zu"
                : voiceState === "thinking"
                  ? "AION denkt nach"
                  : voiceState === "speaking"
                    ? "AION spricht"
                    : active.prompt}
          </div>
        </div>

        <motion.div
          className="voice-panel"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.6 }}
        >
          <button
            className={`voice-button ${voiceState}`}
            onClick={toggleVoice}
            aria-label={
              voiceState !== "idle" ? "Gespräch beenden" : "Gespräch mit AION starten"
            }
          >
            <span className="mic">{voiceState === "idle" ? "●" : "■"}</span>
            <span>
              <small>
                {voiceState === "connecting"
                  ? "VERBINDUNG WIRD AUFGEBAUT"
                  : voiceState === "listening"
                    ? "ICH HÖRE ZU"
                    : voiceState === "thinking"
                      ? "EINEN MOMENT"
                      : voiceState === "speaking"
                        ? "AION SPRICHT"
                        : "SPRICH MIT AION"}
              </small>
              {voiceState === "idle"
                ? "Tippe, um zu beginnen"
                : voiceState === "speaking"
                  ? "Du kannst AION jederzeit unterbrechen"
                  : "Erzähl mir, was dich bewegt …"}
            </span>
            <i>{voiceState === "idle" ? "›" : "×"}</i>
          </button>
          {error && <div className="voice-error">{error}</div>}
          {messages.length > 0 && (
            <div className="mini-transcript" aria-live="polite">
              <small>LETZTER GEDANKE</small>
              <p>
                {messages[messages.length - 1].role === "assistant" ? "AION: " : "DU: "}
                {messages[messages.length - 1].text}
              </p>
              <button onClick={() => setChatOpen(true)}>
                Im Chat fortsetzen <span>↗</span>
              </button>
            </div>
          )}
          <p>Deine Gedanken bleiben deine. Du bestimmst, was AION sich merkt.</p>
        </motion.div>
      </section>

      <section className="possibilities" id="moeglichkeiten">
        <div className="section-heading">
          <p>DEIN PERSÖNLICHES LIFE OS</p>
          <h2>Was brauchst du gerade?</h2>
        </div>
        <div className="action-grid">
          {actions.map((action, index) => (
            <motion.button
              key={action.title}
              className="action-card"
              onClick={() => {
                if (action.documentStudio) setDocumentStudioOpen(true);
                if (action.calendarStudio) setCalendarStudioOpen(true);
                if (action.mailStudio) setMailStudioOpen(true);
                if (action.translatorStudio) setTranslatorStudioOpen(true);
                if (action.mode) {
                  setActiveMode(action.mode);
                  setChatOpen(true);
                }
              }}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ delay: index * 0.08 }}
              whileHover={{ y: -6 }}
            >
              <span className="action-icon">{action.icon}</span>
              <span>
                <strong>{action.title}</strong>
                <small>{action.text}</small>
              </span>
              <i>↗</i>
            </motion.button>
          ))}
        </div>
      </section>

      <section className="balance" id="balance">
        <div>
          <p className="kicker">
            <span />
            MEHR ALS EIN ASSISTENT
          </p>
          <h2>Technologie, die dich nicht lauter macht. Sondern klarer.</h2>
        </div>
        <p>
          Plane deinen Tag, finde verlässliche Antworten oder wechsle bewusst in
          den Jung-Modus. AION trennt Fakten von Reflexion und begleitet dich,
          ohne dir deine Entscheidungen abzunehmen.
        </p>
      </section>

      <footer id="privacy">
        <a className="brand footer-brand" href="#top">
          <span className="brand-mark">A</span>
          <span className="brand-copy">
            <strong>AION</strong>
            <small>by Nadj.ai</small>
          </span>
        </a>
        <p>Wissen. Bewusstsein. Balance.</p>
        <span>© 2026 Nadj.ai</span>
      </footer>
      <AionChat
        mode={activeMode}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        onOpenDocuments={() => {
          setChatOpen(false);
          setDocumentStudioOpen(true);
        }}
        onOpenCalendar={() => {
          setChatOpen(false);
          setCalendarStudioOpen(true);
        }}
        onMusicPlayingChange={setMusicPlaying}
        voiceState={voiceState}
        onToggleVoice={toggleVoice}
        onSpeak={speak}
        voiceMessages={messages.map((message) => ({
          role: message.role,
          content: message.text,
          calendarAction: message.calendarAction,
          calendarConnectionRequired: message.calendarConnectionRequired,
          youtubeVideo: message.youtubeVideo,
          browserUrl: message.browserUrl,
        }))}
      />
      <DocumentStudio open={documentStudioOpen} onClose={() => setDocumentStudioOpen(false)} />
      <CalendarStudio open={calendarStudioOpen} onClose={() => setCalendarStudioOpen(false)} />
      <MailStudio open={mailStudioOpen} onClose={() => setMailStudioOpen(false)} />
      <TranslatorStudio
        open={translatorStudioOpen}
        onClose={() => setTranslatorStudioOpen(false)}
      />
    </main>
  );
}
