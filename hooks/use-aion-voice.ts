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
  musicUrl?: string;
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
  /\bmusik\b.*\b(spiel|abspiel|hör|amazon)\w*/i,
  /\b(spiel|spiele|starte)\b.*\b(song|lied|album|playlist|musik)\b/i,
];
const voiceYesPattern =
  /^\s*(ja|ja bitte|ja genau|ja mach das|bitte|genau|okay|ok|mach das|eintragen|bestätigt)\s*[.!]?\s*$/i;
const voiceNoPattern =
  /^\s*(nein|abbrechen|stopp|stop|doch nicht|nicht eintragen)\s*[.!]?\s*$/i;

export function useAionVoice(mode: AionMode) {
  const vapiRef = useRef<Vapi | null>(null);
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
    vapiRef.current?.stop();
    setState("idle");
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

        vapi.on("call-start", () => setState("listening"));
        vapi.on("call-end", () => setState("idle"));
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
          const hasMusicIntent = musicVoicePatterns.some((pattern) =>
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

          if (hasMusicIntent) {
            const musicQuery = transcript
              .replace(/\b(auf|bei|über|in)\s+amazon music\b/gi, "")
              .replace(/\bamazon music\b/gi, "")
              .replace(
                /^\s*(aion[,.]?\s*)?(spiel|spiele|starte|öffne|suche|finde|hör|höre)\s+(mir\s+)?/i,
                "",
              )
              .replace(/\s+/g, " ")
              .trim();
            const musicUrl = musicQuery
              ? `https://music.amazon.de/search/${encodeURIComponent(musicQuery)}`
              : "https://music.amazon.de";
            vapi.stop();
            setMessages((current) => [
              ...current,
              {
                id: `${Date.now()}-${current.length}`,
                role: "assistant",
                text: musicQuery
                  ? `Ich habe „${musicQuery}“ für Amazon Music vorbereitet. Tippe im Chat auf „In Amazon Music öffnen“.`
                  : "Ich habe Amazon Music für dich vorbereitet. Tippe im Chat auf „In Amazon Music öffnen“.",
                musicUrl,
              },
            ]);
            setHandoff({ id: Date.now(), target: "chat" });
            setState("idle");
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
            vapi.stop();
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
            setState("idle");
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
    handoff,
    clearHandoff: () => setHandoff(null),
  };
}
