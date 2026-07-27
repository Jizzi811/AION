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
};

type VapiMessage = {
  type?: string;
  role?: string;
  transcript?: string;
  transcriptType?: string;
};

export function useAionVoice(mode: AionMode) {
  const vapiRef = useRef<Vapi | null>(null);
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<TranscriptItem[]>([]);

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
          if (role === "user") setState("thinking");
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

  return { state, error, messages, start, stop };
}
