"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { AionMode } from "@/lib/aion-assistant";

type Message = {
  role: "user" | "assistant";
  content: string;
  live?: boolean;
  sources?: { title: string; url: string }[];
  calendarAction?: CalendarAction;
  calendarConnectionRequired?: boolean;
};

type CalendarAction = {
  kind: "create" | "update" | "delete";
  eventId: string;
  title: string;
  start: string;
  end: string;
  location: string;
  summary: string;
};

type AionChatProps = {
  mode: AionMode;
  open: boolean;
  onClose: () => void;
  onOpenDocuments: () => void;
  onOpenCalendar: () => void;
  voiceMessages?: Message[];
};

const modeNames: Record<AionMode, string> = {
  alltag: "Alltag",
  jung: "Jung",
  meditation: "Meditation",
  wissen: "Wissen",
};

const starters: Record<AionMode, string[]> = {
  alltag: [
    "Plane meinen Tag mit mir",
    "Wie wird das Wetter heute in meiner Stadt?",
    "Formuliere eine wichtige Nachricht",
  ],
  jung: [
    "Lass uns ein wiederkehrendes Muster betrachten",
    "Hilf mir, eine Projektion zu erkennen",
    "Stell mir eine ehrliche Reflexionsfrage",
  ],
  meditation: [
    "Führe mich durch eine kurze Meditation",
    "Starte eine ruhige Körperreise",
    "Hilf mir, vor dem Schlafen loszulassen",
  ],
  wissen: [
    "Fasse die wichtigsten Nachrichten von heute zusammen",
    "Wie wird das Wetter heute?",
    "Erkläre mir ein komplexes Thema einfach",
  ],
};

export function AionChat({
  mode,
  open,
  onClose,
  onOpenDocuments,
  onOpenCalendar,
  voiceMessages = [],
}: AionChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calendarBusy, setCalendarBusy] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const importedVoiceCount = useRef(0);

  useEffect(() => {
    if (voiceMessages.length < importedVoiceCount.current) {
      importedVoiceCount.current = 0;
    }
    if (voiceMessages.length <= importedVoiceCount.current) return;
    const newMessages = voiceMessages.slice(importedVoiceCount.current);
    importedVoiceCount.current = voiceMessages.length;
    setMessages((current) => [...current, ...newMessages].slice(-24));
  }, [voiceMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);

  async function sendMessage(text: string) {
    const clean = text.trim();
    if (!clean || busy) return;

    const nextMessages: Message[] = [...messages, { role: "user", content: clean }];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/aion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, messages: nextMessages }),
      });
      const result = (await response.json()) as {
        message?: string;
        error?: string;
        live?: boolean;
        sources?: { title: string; url: string }[];
        calendarAction?: CalendarAction;
        calendarConnectionRequired?: boolean;
      };
      if (!response.ok || !result.message) {
        throw new Error(result.error || "AION konnte nicht antworten.");
      }
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: result.message as string,
          live: result.live,
          sources: result.sources,
          calendarAction: result.calendarAction,
          calendarConnectionRequired: result.calendarConnectionRequired,
        },
      ]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "AION konnte nicht antworten.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmCalendarAction(action: CalendarAction, messageIndex: number) {
    setCalendarBusy(messageIndex);
    setError(null);
    try {
      const method =
        action.kind === "create" ? "POST" : action.kind === "update" ? "PATCH" : "DELETE";
      const response = await fetch("/api/calendar", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: action.eventId,
          title: action.title,
          start: action.start,
          end: action.end,
          location: action.location,
          confirmed: true,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Kalenderaktion fehlgeschlagen.");
      setMessages((current) =>
        current.map((message, index) =>
          index === messageIndex
            ? { ...message, calendarAction: undefined }
            : message,
        ).concat({
          role: "assistant",
          content:
            action.kind === "create"
              ? "Erledigt – der Termin steht jetzt in deinem Kalender."
              : action.kind === "update"
                ? "Erledigt – ich habe den Termin geändert."
                : "Erledigt – der Termin wurde gelöscht.",
        }),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Kalenderaktion fehlgeschlagen.",
      );
    } finally {
      setCalendarBusy(null);
    }
  }

  function dismissCalendarAction(messageIndex: number) {
    setMessages((current) =>
      current.map((message, index) =>
        index === messageIndex ? { ...message, calendarAction: undefined } : message,
      ),
    );
  }

  function formatCalendarAction(action: CalendarAction) {
    if (action.kind === "delete") return "Dauerhaft aus dem Kalender entfernen";
    const start = new Intl.DateTimeFormat("de-DE", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Berlin",
    }).format(new Date(action.start));
    const end = new Intl.DateTimeFormat("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Berlin",
    }).format(new Date(action.end));
    return `${start}–${end} Uhr${action.location ? ` · ${action.location}` : ""}`;
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void sendMessage(input);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="chat-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => event.target === event.currentTarget && onClose()}
        >
          <motion.section
            className="aion-chat"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="aion-chat-title"
          >
            <header className="chat-header">
              <div className="chat-orb"><span /></div>
              <div>
                <small>AION · {modeNames[mode].toUpperCase()}</small>
                <h2 id="aion-chat-title">Was möchtest du bewegen?</h2>
              </div>
              <button onClick={onClose} aria-label="AION Chat schließen">×</button>
            </header>

            <div className="chat-messages" ref={scrollRef} aria-live="polite">
              {messages.length === 0 ? (
                <div className="chat-welcome">
                  <p>Ich bin bereit. Du kannst frei schreiben oder direkt mit einem Gedanken starten.</p>
                  <div>
                    {starters[mode].map((starter) => (
                      <button key={starter} onClick={() => void sendMessage(starter)}>
                        {starter}<span>↗</span>
                      </button>
                    ))}
                  </div>
                  <button className="chat-document-link" onClick={onOpenDocuments}>
                    <span>▱</span>
                    Dokument öffnen oder umwandeln
                  </button>
                </div>
              ) : (
                messages.map((message, index) => (
                  <div key={`${message.role}-${index}`} className={`chat-message ${message.role}`}>
                    <small>
                      {message.role === "assistant" ? "AION" : "DU"}
                      {message.live ? " · LIVE RECHERCHIERT" : ""}
                    </small>
                    <p>{message.content}</p>
                    {message.sources && message.sources.length > 0 && (
                      <div className="chat-sources">
                        {message.sources.map((source) => (
                          <a
                            key={source.url}
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {source.title}<span>↗</span>
                          </a>
                        ))}
                      </div>
                    )}
                    {message.calendarConnectionRequired && (
                      <button className="chat-calendar-connect" onClick={onOpenCalendar}>
                        Google Calendar verbinden <span>↗</span>
                      </button>
                    )}
                    {message.calendarAction && (
                      <div className={`chat-calendar-action ${message.calendarAction.kind}`}>
                        <small>
                          {message.calendarAction.kind === "create"
                            ? "TERMIN ANLEGEN"
                            : message.calendarAction.kind === "update"
                              ? "TERMIN ÄNDERN"
                              : "TERMIN LÖSCHEN"}
                        </small>
                        <strong>{message.calendarAction.title}</strong>
                        <span>{formatCalendarAction(message.calendarAction)}</span>
                        <div>
                          <button
                            onClick={() => dismissCalendarAction(index)}
                            disabled={calendarBusy === index}
                          >
                            Abbrechen
                          </button>
                          <button
                            onClick={() =>
                              void confirmCalendarAction(message.calendarAction as CalendarAction, index)
                            }
                            disabled={calendarBusy === index}
                          >
                            {calendarBusy === index ? "Wird ausgeführt …" : "Jetzt bestätigen"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
              {busy && (
                <div className="chat-thinking">
                  <i /><i /><i />
                  <span>AION denkt</span>
                </div>
              )}
            </div>

            <form className="chat-composer" onSubmit={submit}>
              {error && <p>{error}</p>}
              <div>
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendMessage(input);
                    }
                  }}
                  placeholder="Schreib AION, was du brauchst …"
                  rows={2}
                  maxLength={12_000}
                />
                <button disabled={busy || !input.trim()} aria-label="Nachricht senden">
                  ↑
                </button>
              </div>
              <small>AION kann Fehler machen. Wichtige Angaben bitte prüfen.</small>
            </form>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
