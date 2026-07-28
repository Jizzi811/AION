"use client";

import { FormEvent, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { AnimatePresence, motion } from "motion/react";

type Mail = {
  id: string;
  from: string;
  subject: string;
  date?: string;
  snippet: string;
};

type MailStudioProps = {
  open: boolean;
  onClose: () => void;
};

const emptyDraft = { to: "", subject: "", message: "" };

export function MailStudio({ open, onClose }: MailStudioProps) {
  const [messages, setMessages] = useState<Mail[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [confirmSend, setConfirmSend] = useState(false);

  async function loadInbox(signal?: AbortSignal) {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/gmail", { cache: "no-store", signal });
      if (response.status === 401) {
        setConnected(false);
        return;
      }
      const result = (await response.json()) as {
        messages?: Mail[];
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "Posteingang konnte nicht geladen werden.");
      setConnected(true);
      setMessages(result.messages || []);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNotice(error instanceof Error ? error.message : "Posteingang konnte nicht geladen werden.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void loadInbox(controller.signal);
    return () => controller.abort();
  }, [open]);

  function previewSend(event: FormEvent) {
    event.preventDefault();
    if (!draft.to.trim() || !draft.subject.trim() || !draft.message.trim()) {
      setNotice("Empfänger, Betreff und Nachricht werden benötigt.");
      return;
    }
    setNotice(null);
    setConfirmSend(true);
  }

  async function performMailAction(action: "draft" | "send") {
    setBusy(true);
    setNotice(action === "send" ? "AION versendet die bestätigte E-Mail …" : "Entwurf wird gespeichert …");
    try {
      const response = await fetch("/api/gmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, action, confirmed: action === "send" }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "E-Mail-Aktion fehlgeschlagen.");
      setConfirmSend(false);
      setDraft(emptyDraft);
      setNotice(
        action === "send"
          ? "Die E-Mail wurde versendet."
          : "Der Entwurf wurde in Gmail gespeichert.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "E-Mail-Aktion fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="mail-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => event.target === event.currentTarget && onClose()}
        >
          <motion.section
            className="mail-studio"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mail-title"
          >
            <header className="mail-header">
              <div>
                <small>AION POSTFACH</small>
                <h2 id="mail-title">Wichtiges, klar sortiert</h2>
                <p>Gmail · Lesen, entwerfen und bewusst versenden</p>
              </div>
              <button onClick={onClose} aria-label="E-Mail schließen">×</button>
            </header>

            {connected === false ? (
              <div className="mail-connect">
                <span>✉</span>
                <h3>Gmail verbinden</h3>
                <p>
                  AION liest nur nach deiner Freigabe. Keine Nachricht wird ohne
                  eine zweite, sichtbare Bestätigung versendet.
                </p>
                <button onClick={() => void signIn("google", { callbackUrl: "/" })}>
                  Mit Google verbinden <i>↗</i>
                </button>
              </div>
            ) : (
              <div className="mail-layout">
                <section className="mail-inbox">
                  <small>POSTEINGANG</small>
                  <h3>Letzte Nachrichten</h3>
                  {busy && messages.length === 0 ? (
                    <p className="mail-empty">AION lädt dein Postfach …</p>
                  ) : messages.length === 0 ? (
                    <p className="mail-empty">Keine Nachrichten gefunden.</p>
                  ) : (
                    <div className="mail-list">
                      {messages.map((mail) => (
                        <article key={mail.id}>
                          <span>{mail.from}</span>
                          <strong>{mail.subject}</strong>
                          <p>{mail.snippet}</p>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <form className="mail-compose" onSubmit={previewSend}>
                  <small>NEUE NACHRICHT</small>
                  <h3>Antwort vorbereiten</h3>
                  <label>
                    <span>An</span>
                    <input
                      type="email"
                      value={draft.to}
                      onChange={(event) => setDraft({ ...draft, to: event.target.value })}
                      placeholder="name@beispiel.de"
                    />
                  </label>
                  <label>
                    <span>Betreff</span>
                    <input
                      value={draft.subject}
                      onChange={(event) => setDraft({ ...draft, subject: event.target.value })}
                      placeholder="Worum geht es?"
                    />
                  </label>
                  <label>
                    <span>Nachricht</span>
                    <textarea
                      value={draft.message}
                      onChange={(event) => setDraft({ ...draft, message: event.target.value })}
                      placeholder="Deine Nachricht …"
                    />
                  </label>
                  <div className="mail-compose-actions">
                    <button type="button" onClick={() => void performMailAction("draft")} disabled={busy}>
                      Als Entwurf
                    </button>
                    <button disabled={busy}>Versand prüfen <span>→</span></button>
                  </div>
                  {notice && <p className="mail-notice">{notice}</p>}
                </form>
              </div>
            )}

            {confirmSend && (
              <div className="mail-confirm">
                <div>
                  <small>VERSAND BESTÄTIGEN</small>
                  <h3>{draft.subject}</h3>
                  <p>An: {draft.to}</p>
                  <blockquote>{draft.message}</blockquote>
                  <span>Erst der nächste Klick versendet diese E-Mail wirklich.</span>
                  <div>
                    <button onClick={() => setConfirmSend(false)}>Noch ändern</button>
                    <button onClick={() => void performMailAction("send")} disabled={busy}>
                      Jetzt versenden
                    </button>
                  </div>
                </div>
              </div>
            )}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
