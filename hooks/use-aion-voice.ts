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

export type TranscriptItem = {
  id: string;
  role: "user" | "assistant";
  text: string;
  calendarAction?: {
    kind: "create" | "update" | "delete";
    eventId: string;
    title: string;
    start: string;
    end: string;
    location: string;
    summary: string;
  };
  calendarConnectionRequired?: boolean;
};

type VapiMessage = {
  type?: string;
  role?: string;
  transcript?: string;
  transcriptType?: string;
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

export function useAionVoice(mode: AionMode) {
  const vapiRef = useRef<Vapi | null>(null);
  const modeRef = useRef(mode);
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
          const hasCalendarIntent = calendarVoicePatterns.some((pattern) =>
            pattern.test(transcript),
          );
          const hasMailIntent = mailVoicePatterns.some((pattern) =>
            pattern.test(transcript),
          );

          if (hasCalendarIntent) {
            vapi.stop();
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
                setMessages((current) => [
                  ...current,
                  {
                    id: `${Date.now()}-${current.length}`,
                    role: "assistant",
                    text: body.message as string,
                    calendarAction: body.calendarAction,
                    calendarConnectionRequired: body.calendarConnectionRequired,
                  },
                ]);
                setHandoff({ id: Date.now(), target: "chat" });
              })
              .catch((requestError) => {
                setMessages((current) => [
                  ...current,
                  {
                    id: `${Date.now()}-${current.length}`,
                    role: "assistant",
                    text:
                      requestError instanceof Error
                        ? requestError.message
                        : "Kalenderauftrag konnte nicht vorbereitet werden.",
                  },
                ]);
                setHandoff({ id: Date.now(), target: "chat" });
              })
              .finally(() => setState("idle"));
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
