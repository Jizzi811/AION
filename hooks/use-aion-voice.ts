"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type Vapi from "@vapi-ai/web";
import { buildAionAssistant, type AionMode } from "@/lib/aion-assistant";

export type VoiceState =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking";

type CalendarVoiceAction = {
  kind: "create" | "update" | "delete";
  eventId: string;
  title: string;
  start: string;
  end: string;
  location: string;
  summary: string;
};

export type TranscriptItem = {
  id: string;
  role: "user" | "assistant";
  text: string;
  calendarAction?: CalendarVoiceAction;
  calendarConnectionRequired?: boolean;
  youtubeVideo?: YouTubeVideo;
  browserUrl?: string;
};

export type YouTubeVideo = {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
};

type VapiMessage = {
  type?: string;
  role?: string;
  transcript?: string;
  transcriptType?: string;
};

type LiveVoiceMessage = {
  role: "user" | "assistant";
  content: string;
};

const calendarVoicePatterns = [
  /\bkalender\w*/i,
  /\b\w*termin\w*/i,
  /\bmeeting\w*/i,
  /\bverabredung\w*/i,
  /\bverschieb/i,
  /\btrag\w*\b.*\bein\b/i,
  /\blösch/i,
  /\babsag/i,
];

const mailVoicePatterns = [
  /\bgmail\b/i,
  /\bpostfach\b/i,
  /\be-?mail\w*/i,
  /\bmail\w*\b/i,
];
const liveVoicePatterns = [
  /\bnews\b/i,
  /\bnachrichten\b/i,
  /\bschlagzeilen\b/i,
  /\bwetter\b/i,
  /\btemperatur\b/i,
  /\bprognose\b/i,
  /\bregnet\b/i,
  /\bregen\b/i,
  /\bsonnig\b/i,
  /\bwindig\b/i,
  /\bwas ist heute passiert\b/i,
];
const musicVoicePatterns = [
  /\bamazon music\b/i,
  /\byoutube(?: music)?\b/i,
  /\bmusik\b.*\b(spiel|abspiel|hör|amazon)\w*/i,
  /\b(spiel|spiele|starte)\b.*\b(song|lied|album|playlist|musik)\b/i,
  /\b(spiel|spiele|hör|höre)\s+(mir\s+)?(mal\s+)?(bitte\s+)?(?!eine?\s+(meditation|körperreise|traumreise))[\p{L}\p{N}]/iu,
  /\bich\s+(möchte|will)\b.+\bhören\b/i,
  /\bmach\b.+\b(musik|song|lied|von)\b.+\ban\b/i,
  /\b(kannst|könntest|würdest)\s+du\b.+\b(spielen|abspielen|anmachen|auflegen)\b/i,
  /\b(mach|starte|leg|lege)\b.+\b(an|auf)\b/i,
  /\b(play|listen to|put on)\b.+/i,
];

function hasMusicIntent(text: string) {
  const asksForInnerAudio =
    /\b(meditation|körperreise|traumreise|atemübung|jung[- ]?modus)\b/i.test(text);
  const explicitlyAsksForMusic =
    /\b(musik|song|lied|playlist|album|track|youtube|amazon music)\b/i.test(text);
  if (asksForInnerAudio && !explicitlyAsksForMusic) return false;
  return musicVoicePatterns.some((pattern) => pattern.test(text));
}

function extractMusicQuery(text: string) {
  const query = text
    .replace(/^\s*aion[,.]?\s*/i, "")
    .replace(/\b(auf|bei|über|in)\s+(amazon|youtube) music\b/gi, "")
    .replace(/\b(amazon|youtube)(?: music)?\b/gi, "")
    .replace(
      /^\s*(kannst|könntest|würdest)\s+du\s+(mir\s+)?(mal\s+)?(bitte\s+)?/i,
      "",
    )
    .replace(
      /^\s*(spiel|spiele|starte|öffne|suche|finde|hör|höre|play|put on|listen to)\s+(mir\s+)?(mal\s+)?(bitte\s+)?/i,
      "",
    )
    .replace(/^\s*(mach|leg|lege)\s+(mir\s+)?(mal\s+)?(bitte\s+)?/i, "")
    .replace(/^\s*ich\s+(möchte|will)\s+(gern(?:e)?\s+)?/i, "")
    .replace(/^\s*(etwas|was|musik|einen song|ein lied)\s+(von|mit)\s+/i, "")
    .replace(/\s+(spielen|abspielen|anmachen|hören|auflegen|an|auf)\s*[?.!]?\s*$/i, "")
    .replace(/\s+(für mich|bitte)\s*[?.!]?\s*$/i, "")
    .replace(/[?.!]+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return /^(hören|listen|musik|music|etwas|was|song|lied|track|album|playlist|spielen|abspielen)$/i.test(
    query,
  )
    ? ""
    : query;
}
const browserVoicePatterns = [
  /\böffne\b.*\b(browser|webseite|website|internetseite)\b/i,
  /\b(geh|gehe)\b.*\bauf\b/i,
  /\bgoogle\b.*\b(nach|suche)\b/i,
  /\bsuche\b.*\b(im|mit dem)\s+(internet|browser|web)\b/i,
];
const voiceYesPattern =
  /^\s*(ja|ja bitte|ja genau|ja mach das|bitte|genau|okay|ok|mach das|eintragen|bestätigt)\s*[.!]?\s*$/i;
const voiceNoPattern =
  /^\s*(nein|abbrechen|stopp|stop|doch nicht|nicht eintragen)\s*[.!]?\s*$/i;

export function useAionVoice(mode: AionMode) {
  const vapiRef = useRef<Vapi | null>(null);
  const callActiveRef = useRef(false);
  const modeRef = useRef(mode);
  const pendingCalendarActionRef = useRef<CalendarVoiceAction | null>(null);
  const pendingLiveContextRef = useRef<LiveVoiceMessage[] | null>(null);
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<TranscriptItem[]>([]);
  const [handoff, setHandoff] = useState<{
    id: number;
    target: "chat" | "mail";
  } | null>(null);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const stop = useCallback(() => {
    pendingCalendarActionRef.current = null;
    pendingLiveContextRef.current = null;
    callActiveRef.current = false;
    vapiRef.current?.stop();
    setState("idle");
  }, []);

  const speak = useCallback((text: string) => {
    const clean = text.trim();
    if (!clean || !callActiveRef.current || !vapiRef.current) return false;
    vapiRef.current.say(clean, false, true, true);
    return true;
  }, []);

  const start = useCallback(async () => {
    if (state !== "idle") {
      stop();
      return;
    }

    setError(null);
    setMessages([]);
    setState("connecting");

    try {
      const response = await fetch("/api/vapi-config", { cache: "no-store" });
      if (!response.ok) throw new Error("config");
      const { publicKey } = (await response.json()) as { publicKey: string };

      if (!vapiRef.current) {
        const VapiConstructor = (await import("@vapi-ai/web")).default;
        const vapi = new VapiConstructor(publicKey);

        vapi.on("call-start", () => {
          callActiveRef.current = true;
          setState("listening");
        });
        vapi.on("call-end", () => {
          callActiveRef.current = false;
          setState("idle");
        });
        vapi.on("speech-start", () => setState("speaking"));
        vapi.on("speech-end", () => setState("listening"));
        vapi.on("message", (message: VapiMessage) => {
          if (
            message.type !== "transcript" ||
            message.transcriptType !== "final" ||
            !message.transcript
          )
            return;

          const role = message.role === "assistant" ? "assistant" : "user";
          setMessages((current) => [
            ...current,
            {
              id: `${Date.now()}-${current.length}`,
              role,
              text: message.transcript as string,
            },
          ]);
          if (role !== "user") return;
          setState("thinking");

          const transcript = message.transcript as string;
          const pendingAction = pendingCalendarActionRef.current;

          if (pendingAction) {
            if (voiceNoPattern.test(transcript)) {
              pendingCalendarActionRef.current = null;
              vapi.say(
                "Alles klar, ich habe den Kalenderauftrag verworfen.",
                false,
                true,
                true,
              );
              setState("listening");
              return;
            }
            if (!voiceYesPattern.test(transcript)) {
              vapi.say(
                "Bitte sag eindeutig Ja zum Ausführen oder Nein zum Abbrechen.",
                false,
                true,
                true,
              );
              setState("listening");
              return;
            }

            pendingCalendarActionRef.current = null;
            const method =
              pendingAction.kind === "create"
                ? "POST"
                : pendingAction.kind === "update"
                  ? "PATCH"
                  : "DELETE";
            void fetch("/api/calendar", {
              method,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: pendingAction.eventId,
                title: pendingAction.title,
                start: pendingAction.start,
                end: pendingAction.end,
                location: pendingAction.location,
                confirmed: true,
              }),
            })
              .then(async (result) => {
                const body = (await result.json()) as { error?: string };
                if (!result.ok) {
                  throw new Error(body.error || "Der Kalenderauftrag ist fehlgeschlagen.");
                }
                vapi.say(
                  pendingAction.kind === "create"
                    ? "Erledigt. Der Termin steht jetzt in deinem Kalender."
                    : pendingAction.kind === "update"
                      ? "Erledigt. Ich habe den Termin geändert."
                      : "Erledigt. Der Termin wurde gelöscht.",
                  false,
                  true,
                  true,
                );
              })
              .catch((requestError) => {
                vapi.say(
                  requestError instanceof Error
                    ? requestError.message
                    : "Der Kalenderauftrag ist fehlgeschlagen.",
                  false,
                  true,
                  true,
                );
              })
              .finally(() => setState("listening"));
            return;
          }

          const hasCalendarIntent = calendarVoicePatterns.some((pattern) =>
            pattern.test(transcript),
          );
          const hasMailIntent = mailVoicePatterns.some((pattern) =>
            pattern.test(transcript),
          );
          const hasLiveIntent = liveVoicePatterns.some((pattern) =>
            pattern.test(transcript),
          );
          const hasMusicRequest = hasMusicIntent(transcript);
          const hasBrowserIntent = browserVoicePatterns.some((pattern) =>
            pattern.test(transcript),
          );

          if (hasCalendarIntent) {
            void fetch("/api/aion", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                mode: modeRef.current,
                messages: [{ role: "user", content: transcript }],
              }),
            })
              .then(async (result) => {
                const body = (await result.json()) as {
                  message?: string;
                  error?: string;
                  calendarAction?: TranscriptItem["calendarAction"];
                  calendarConnectionRequired?: boolean;
                };
                if (!result.ok || !body.message) {
                  throw new Error(body.error || "Kalenderauftrag konnte nicht vorbereitet werden.");
                }
                if (body.calendarConnectionRequired) {
                  vapi.say(
                    "Google Calendar muss zuerst verbunden werden. Ich öffne dir dafür die passende Ansicht.",
                    false,
                    true,
                    true,
                  );
                  setMessages((current) => [
                    ...current,
                    {
                      id: `${Date.now()}-${current.length}`,
                      role: "assistant",
                      text: body.message as string,
                      calendarConnectionRequired: true,
                    },
                  ]);
                  setHandoff({ id: Date.now(), target: "chat" });
                  return;
                }
                if (!body.calendarAction) {
                  vapi.say(body.message as string, false, true, true);
                  return;
                }

                pendingCalendarActionRef.current = body.calendarAction;
                vapi.say(
                  `${body.calendarAction.summary} Soll ich das jetzt verbindlich ausführen? Bitte antworte mit Ja oder Nein.`,
                  false,
                  true,
                  true,
                );
              })
              .catch((requestError) => {
                vapi.say(
                  requestError instanceof Error
                    ? requestError.message
                    : "Kalenderauftrag konnte nicht vorbereitet werden.",
                  false,
                  true,
                  true,
                );
              })
              .finally(() => setState("listening"));
            return;
          }

          if (hasMusicRequest) {
            const musicQuery = extractMusicQuery(transcript);
            vapi.say(
              musicQuery
                ? modeRef.current === "jung" || modeRef.current === "meditation"
                  ? `Ich suche ${musicQuery} und öffne dir ganz in Ruhe den Player.`
                  : `Ich suche ${musicQuery} und öffne dir den Player. Dann darfst du entscheiden, ob meine Tanzkünste versichert werden müssen.`
                : "Sag mir bitte noch, welchen Titel, Künstler oder welche Musikrichtung du hören möchtest.",
              false,
              true,
              true,
            );
            if (!musicQuery) {
              setMessages((current) => [
                ...current,
                {
                  id: `${Date.now()}-${current.length}`,
                  role: "assistant",
                  text: "Gern – welchen Titel, Künstler oder welche Musikrichtung möchtest du hören?",
                },
              ]);
              setHandoff({ id: Date.now(), target: "chat" });
              setState("listening");
              return;
            }
            void fetch(`/api/youtube/search?q=${encodeURIComponent(musicQuery)}`, {
              cache: "no-store",
            })
              .then(async (result) => {
                const body = (await result.json()) as {
                  video?: YouTubeVideo;
                  error?: string;
                };
                if (!result.ok || !body.video) {
                  throw new Error(body.error || "Ich konnte keinen passenden Titel finden.");
                }
                setMessages((current) => [
                  ...current,
                  {
                    id: `${Date.now()}-${current.length}`,
                    role: "assistant",
                    text:
                      modeRef.current === "jung" || modeRef.current === "meditation"
                        ? `Gefunden: „${body.video?.title}“. Tippe im Player auf Abspielen, sobald du bereit bist.`
                        : `Gefunden: „${body.video?.title}“. Tippe im Player einmal auf Abspielen – ich übernehme den Tanzteil.`,
                    youtubeVideo: body.video,
                  },
                ]);
                setHandoff({ id: Date.now(), target: "chat" });
                setState("listening");
              })
              .catch((requestError) => {
                const failureMessage =
                  requestError instanceof Error
                    ? requestError.message
                    : "Ich konnte keinen passenden Titel finden.";
                vapi.say(failureMessage, false, true, true);
                setMessages((current) => [
                  ...current,
                  {
                    id: `${Date.now()}-${current.length}`,
                    role: "assistant",
                    text: `${failureMessage} Versuch es bitte mit Titel und Künstler noch einmal.`,
                  },
                ]);
                setHandoff({ id: Date.now(), target: "chat" });
                setState("listening");
              });
            return;
          }

          if (hasBrowserIntent) {
            const browserQuery = transcript
              .replace(
                /^\s*(aion[,.]?\s*)?(öffne|suche|finde|google|geh|gehe)\s+(mir\s+)?/i,
                "",
              )
              .replace(/\b(im|mit dem)\s+(internet|browser|web)\b/gi, "")
              .replace(/^\s*(die|das|den|nach|auf)\s+/i, "")
              .replace(/\s+/g, " ")
              .trim();
            const domain = browserQuery.match(
              /\b(?:https?:\/\/)?(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?\b/i,
            )?.[0];
            const browserUrl = domain
              ? /^https?:\/\//i.test(domain)
                ? domain
                : `https://${domain}`
              : browserQuery
                ? `https://www.google.com/search?q=${encodeURIComponent(browserQuery)}`
                : "https://www.google.com";
            setMessages((current) => [
              ...current,
              {
                id: `${Date.now()}-${current.length}`,
                role: "assistant",
                text: browserQuery
                  ? `Ich habe „${browserQuery}“ für den Browser vorbereitet. Öffne den geprüften Link im Chat.`
                  : "Ich habe den Browser für dich vorbereitet. Öffne den Link im Chat.",
                browserUrl,
              },
            ]);
            setHandoff({ id: Date.now(), target: "chat" });
            setState("listening");
            return;
          }

          const pendingLiveContext = pendingLiveContextRef.current;
          if (hasLiveIntent || pendingLiveContext) {
            pendingLiveContextRef.current = null;
            const liveMessages: LiveVoiceMessage[] = pendingLiveContext
              ? [
                  ...pendingLiveContext,
                  {
                    role: "user",
                    content: `Aktuelle Live-Recherche fortsetzen. Antwort auf deine Rückfrage: ${transcript}`,
                  },
                ]
              : [{ role: "user", content: transcript }];

            vapi.say(
              "Einen Moment, ich recherchiere das aktuell für dich.",
              false,
              true,
              true,
            );
            void fetch("/api/aion", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                mode: modeRef.current,
                messages: liveMessages,
              }),
            })
              .then(async (result) => {
                const body = (await result.json()) as {
                  message?: string;
                  error?: string;
                };
                if (!result.ok || !body.message) {
                  throw new Error(
                    body.error || "Die Live-Recherche ist fehlgeschlagen.",
                  );
                }
                const answer = body.message.trim();
                if (answer.endsWith("?")) {
                  pendingLiveContextRef.current = [
                    ...liveMessages,
                    { role: "assistant", content: answer },
                  ];
                }
                setMessages((current) => [
                  ...current,
                  {
                    id: `${Date.now()}-${current.length}`,
                    role: "assistant",
                    text: answer,
                  },
                ]);
                vapi.say(answer, false, true, true);
              })
              .catch((requestError) => {
                vapi.say(
                  requestError instanceof Error
                    ? requestError.message
                    : "Die Live-Recherche ist fehlgeschlagen.",
                  false,
                  true,
                  true,
                );
              })
              .finally(() => setState("listening"));
            return;
          }

          if (hasMailIntent) {
            setMessages((current) => [
              ...current,
              {
                id: `${Date.now()}-${current.length}`,
                role: "assistant",
                text:
                  "Ich öffne dir das sichere Postfach. Dort kannst du lesen, entwerfen oder den Versand bestätigen.",
              },
            ]);
            setHandoff({ id: Date.now(), target: "mail" });
            setState("listening");
          }
        });
        vapi.on("error", () => {
          setError(
            "Die Sprachverbindung konnte nicht gestartet werden. Prüfe bitte Mikrofonfreigabe und Vapi-Konfiguration.",
          );
          setState("idle");
        });
        vapiRef.current = vapi;
      }

      await vapiRef.current.start(buildAionAssistant(mode));
    } catch {
      setError(
        "AION konnte die Sprachverbindung nicht aufbauen. Bitte versuche es gleich noch einmal.",
      );
      setState("idle");
    }
  }, [mode, state, stop]);

  useEffect(() => {
    return () => {
      vapiRef.current?.stop();
      vapiRef.current?.removeAllListeners?.();
    };
  }, []);

  useEffect(() => {
    if (state !== "idle") stop();
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    state,
    error,
    messages,
    start,
    stop,
    speak,
    handoff,
    clearHandoff: () => setHandoff(null),
  };
}
