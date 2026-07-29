"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { AionMode } from "@/lib/aion-assistant";
import type { VoiceState } from "@/hooks/use-aion-voice";

type YouTubeVideo = {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  live?: boolean;
  sources?: { title: string; url: string }[];
  calendarAction?: CalendarAction;
  calendarConnectionRequired?: boolean;
  youtubeVideo?: YouTubeVideo;
  browserUrl?: string;
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
  onMusicPlayingChange: (playing: boolean) => void;
  voiceState: VoiceState;
  onToggleVoice: () => void;
  onSpeak: (text: string) => boolean;
  voiceMessages?: Message[];
};

type YouTubePlayer = {
  destroy: () => void;
  playVideo: () => void;
  setVolume: (volume: number) => void;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement,
        options: {
          videoId: string;
          playerVars: Record<string, string | number>;
          events: {
            onReady: (event: { target: YouTubePlayer }) => void;
            onStateChange: (event: { data: number }) => void;
            onError: () => void;
          };
        },
      ) => YouTubePlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<void> | null = null;

function loadYouTubePlayerApi() {
  if (window.YT?.Player) return Promise.resolve();
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise<void>((resolve) => {
    const existingCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      existingCallback?.();
      resolve();
    };
    if (!document.getElementById("youtube-iframe-api")) {
      const script = document.createElement("script");
      script.id = "youtube-iframe-api";
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      document.head.appendChild(script);
    }
  });
  return youtubeApiPromise;
}

function extractMusicQuery(text: string) {
  return text
    .replace(/\b(auf|bei|über|in)\s+(amazon|youtube) music\b/gi, "")
    .replace(/\b(amazon|youtube)(?: music)?\b/gi, "")
    .replace(
      /^\s*(aion[,.]?\s*)?(spiel|spiele|starte|öffne|suche|finde|hör|höre)\s+(mir\s+)?(mal\s+)?(bitte\s+)?/i,
      "",
    )
    .replace(/^\s*ich\s+(möchte|will)\s+(gern(?:e)?\s+)?/i, "")
    .replace(/^\s*mach\s+/i, "")
    .replace(/\s+(hören|an)\s*[.!]?\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function YouTubeMusicPlayer({
  video,
  onPlayingChange,
  voiceState,
}: {
  video: YouTubeVideo;
  onPlayingChange: (playing: boolean) => void;
  voiceState: VoiceState;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const [activated, setActivated] = useState(false);
  const [playerError, setPlayerError] = useState(false);

  useEffect(() => {
    if (!activated || !mountRef.current) return;
    let cancelled = false;

    void loadYouTubePlayerApi().then(() => {
      if (cancelled || !mountRef.current || !window.YT?.Player) return;
      playerRef.current = new window.YT.Player(mountRef.current, {
        videoId: video.id,
        playerVars: {
          autoplay: 1,
          controls: 1,
          playsinline: 1,
          rel: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            event.target.setVolume(voiceState === "speaking" ? 18 : 72);
            event.target.playVideo();
          },
          onStateChange: (event) => onPlayingChange(event.data === 1),
          onError: () => {
            setPlayerError(true);
            onPlayingChange(false);
          },
        },
      });
    });

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      onPlayingChange(false);
    };
  }, [activated, onPlayingChange, video.id]);

  useEffect(() => {
    if (!playerRef.current) return;
    playerRef.current.setVolume(voiceState === "speaking" ? 18 : 72);
  }, [voiceState]);

  return (
    <div className={`youtube-music-player ${activated ? "active" : ""}`}>
      <div className="youtube-track-copy">
        <span>♫</span>
        <div>
          <strong>{video.title}</strong>
          <small>{video.channel}</small>
        </div>
      </div>
      {!activated ? (
        <button onClick={() => setActivated(true)}>
          <span>▶</span>
          Jetzt in AION abspielen
        </button>
      ) : (
        <div className="youtube-player-frame" ref={mountRef} />
      )}
      {playerError && (
        <a
          href={`https://www.youtube.com/watch?v=${video.id}`}
          target="_blank"
          rel="noreferrer"
        >
          Titel direkt auf YouTube öffnen <span>↗</span>
        </a>
      )}
    </div>
  );
}

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
  onMusicPlayingChange,
  voiceState,
  onToggleVoice,
  onSpeak,
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

  useEffect(() => {
    if (!open) onMusicPlayingChange(false);
  }, [onMusicPlayingChange, open]);

  async function sendMessage(text: string) {
    const clean = text.trim();
    if (!clean || busy) return;

    const nextMessages: Message[] = [...messages, { role: "user", content: clean }];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);
    setError(null);

    try {
      const hasMusicIntent =
        /\b(amazon|youtube)(?: music)?\b/i.test(clean) ||
        /\bmusik\b.*\b(spiel|abspiel|hör)\w*/i.test(clean) ||
        /\b(spiel|spiele|starte)\b.*\b(song|lied|album|playlist|musik)\b/i.test(clean) ||
        /\b(spiel|spiele|hör|höre)\s+(mir\s+)?(mal\s+)?(bitte\s+)?(?!eine?\s+(meditation|körperreise|traumreise))[\p{L}\p{N}]/iu.test(clean) ||
        /\bich\s+(möchte|will)\b.+\bhören\b/i.test(clean) ||
        /\bmach\b.+\b(musik|song|lied|von)\b.+\ban\b/i.test(clean);
      if (hasMusicIntent) {
        const musicQuery = extractMusicQuery(clean);
        if (!musicQuery) {
          setMessages((current) => [
            ...current,
            {
              role: "assistant",
              content: "Gern – welchen Titel, Künstler oder welche Musikrichtung möchtest du hören?",
            },
          ]);
          return;
        }
        const musicResponse = await fetch(
          `/api/youtube/search?q=${encodeURIComponent(musicQuery)}`,
          { cache: "no-store" },
        );
        const musicResult = (await musicResponse.json()) as {
          video?: YouTubeVideo;
          error?: string;
        };
        if (!musicResponse.ok || !musicResult.video) {
          throw new Error(musicResult.error || "Ich konnte keinen passenden Titel finden.");
        }
        const musicAnswer =
          mode === "jung" || mode === "meditation"
            ? `Gefunden: „${musicResult.video?.title}“. Tippe auf Abspielen, sobald du bereit bist.`
            : `Gefunden: „${musicResult.video?.title}“. Einmal Abspielen antippen – den Rest erledigen Musik und meine fragwürdigen Tanzkünste.`;
        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            content: musicAnswer,
            youtubeVideo: musicResult.video,
          },
        ]);
        onSpeak(musicAnswer);
        return;
      }

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
      onSpeak(result.message);
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
              <div className="chat-header-actions">
                <button
                  className={`chat-voice-toggle ${voiceState}`}
                  onClick={onToggleVoice}
                  aria-label={
                    voiceState === "idle"
                      ? "Sprachgespräch mit AION starten"
                      : "Sprachgespräch mit AION beenden"
                  }
                  title={
                    voiceState === "idle"
                      ? "Mit AION sprechen"
                      : "Sprachgespräch beenden"
                  }
                >
                  {voiceState === "idle" ? "●" : "■"}
                </button>
                <button onClick={onClose} aria-label="AION Chat schließen">×</button>
              </div>
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
                    {message.youtubeVideo && (
                      <YouTubeMusicPlayer
                        video={message.youtubeVideo}
                        onPlayingChange={onMusicPlayingChange}
                        voiceState={voiceState}
                      />
                    )}
                    {message.browserUrl && (
                      <a
                        className="chat-browser-link"
                        href={message.browserUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Im Browser öffnen <span>↗</span>
                      </a>
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
