"use client";

import { FormEvent, useEffect, useState } from "react";
import { signIn, signOut } from "next-auth/react";
import { AnimatePresence, motion } from "motion/react";

type CalendarEvent = {
  id?: string;
  title: string;
  start?: string;
  end?: string;
  location?: string;
  url?: string;
  allDay?: boolean;
};

type CalendarStudioProps = {
  open: boolean;
  onClose: () => void;
};

type Draft = {
  title: string;
  date: string;
  time: string;
  duration: string;
  location: string;
};

const emptyDraft: Draft = {
  title: "",
  date: "",
  time: "",
  duration: "60",
  location: "",
};

function formatEventDate(value?: string, allDay?: boolean) {
  if (!value) return "Zeit offen";
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    ...(allDay ? {} : { hour: "2-digit", minute: "2-digit" }),
    timeZone: "Europe/Berlin",
  }).format(new Date(value));
}

export function CalendarStudio({ open, onClose }: CalendarStudioProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [confirming, setConfirming] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CalendarEvent | null>(null);

  async function loadCalendar(signal?: AbortSignal) {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/calendar", { cache: "no-store", signal });
      if (response.status === 401) {
        setConnected(false);
        return;
      }
      const result = (await response.json()) as {
        events?: CalendarEvent[];
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "Kalender konnte nicht geladen werden.");
      setConnected(true);
      setEvents(result.events || []);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNotice(error instanceof Error ? error.message : "Kalender konnte nicht geladen werden.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void loadCalendar(controller.signal);
    return () => controller.abort();
  }, [open]);

  function previewEvent(event: FormEvent) {
    event.preventDefault();
    if (!draft.title.trim() || !draft.date || !draft.time) {
      setNotice("Titel, Datum und Uhrzeit werden benötigt.");
      return;
    }
    setNotice(null);
    setConfirming(true);
  }

  async function saveEvent() {
    const start = new Date(`${draft.date}T${draft.time}:00`);
    const end = new Date(start.getTime() + Number(draft.duration) * 60_000);
    setBusy(true);
    setNotice("AION trägt den bestätigten Termin ein …");

    try {
      const response = await fetch("/api/calendar", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          title: draft.title,
          location: draft.location,
          start: start.toISOString(),
          end: end.toISOString(),
          confirmed: true,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Termin konnte nicht gespeichert werden.");
      setDraft(emptyDraft);
      setEditingId(null);
      setConfirming(false);
      setNotice(
        editingId
          ? "Die Änderung wurde in Google Calendar gespeichert."
          : "Der Termin wurde in Google Calendar angelegt.",
      );
      await loadCalendar();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Termin konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  }

  function editEvent(event: CalendarEvent) {
    if (!event.id || !event.start || event.allDay) {
      setNotice("Ganztägige Termine bearbeitest du vorerst direkt in Google Calendar.");
      return;
    }
    const start = new Date(event.start);
    const end = event.end ? new Date(event.end) : new Date(start.getTime() + 60 * 60_000);
    const berlinDate = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "Europe/Berlin",
    }).format(start);
    const berlinTime = new Intl.DateTimeFormat("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Europe/Berlin",
    }).format(start);
    setEditingId(event.id);
    setDraft({
      title: event.title,
      date: berlinDate,
      time: berlinTime,
      duration: String(Math.max(15, Math.round((end.getTime() - start.getTime()) / 60_000))),
      location: event.location || "",
    });
    setNotice("Termin geladen – ändere die Angaben und prüfe sie anschließend.");
  }

  async function deleteEvent() {
    if (!pendingDelete?.id) return;
    setBusy(true);
    try {
      const response = await fetch("/api/calendar", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pendingDelete.id, confirmed: true }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Termin konnte nicht gelöscht werden.");
      setPendingDelete(null);
      setNotice("Der Termin wurde aus Google Calendar gelöscht.");
      await loadCalendar();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Termin konnte nicht gelöscht werden.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="calendar-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => event.target === event.currentTarget && onClose()}
        >
          <motion.section
            className="calendar-studio"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-title"
          >
            <header className="calendar-header">
              <div>
                <small>AION ALLTAG</small>
                <h2 id="calendar-title">Deine Zeit im Blick</h2>
                <p>Google Calendar · Europe/Berlin</p>
              </div>
              <button onClick={onClose} aria-label="Kalender schließen">×</button>
            </header>

            {connected === false ? (
              <div className="calendar-connect">
                <span>31</span>
                <h3>Google Calendar verbinden</h3>
                <p>
                  AION liest nur nach deiner Freigabe. Neue Termine werden vor dem
                  Eintragen noch einmal vollständig angezeigt.
                </p>
                <button onClick={() => void signIn("google", { callbackUrl: "/" })}>
                  Mit Google verbinden <i>↗</i>
                </button>
              </div>
            ) : (
              <div className="calendar-layout">
                <div className="calendar-agenda">
                  <div className="calendar-section-title">
                    <div>
                      <small>NÄCHSTE 7 TAGE</small>
                      <h3>Was ansteht</h3>
                    </div>
                    <button onClick={() => void signOut({ callbackUrl: "/" })}>
                      Verbindung lösen
                    </button>
                  </div>
                  {busy && events.length === 0 ? (
                    <p className="calendar-empty">AION lädt deinen Kalender …</p>
                  ) : events.length === 0 ? (
                    <p className="calendar-empty">In den nächsten sieben Tagen ist nichts eingetragen.</p>
                  ) : (
                    <div className="calendar-events">
                      {events.map((event) => (
                        <article
                          key={event.id || `${event.title}-${event.start}`}
                        >
                          <a href={event.url} target="_blank" rel="noreferrer">
                            <time>{formatEventDate(event.start, event.allDay)}</time>
                            <strong>{event.title}</strong>
                            {event.location && <span>{event.location}</span>}
                          </a>
                          <div className="calendar-event-actions">
                            <button onClick={() => editEvent(event)}>Ändern</button>
                            <button onClick={() => setPendingDelete(event)}>Löschen</button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>

                <form className="calendar-create" onSubmit={previewEvent}>
                  <small>{editingId ? "TERMIN ÄNDERN" : "NEUER TERMIN"}</small>
                  <h3>{editingId ? "Änderung vorbereiten" : "Für dich eintragen"}</h3>
                  <label>
                    <span>Titel</span>
                    <input
                      value={draft.title}
                      onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                      placeholder="Worum geht es?"
                    />
                  </label>
                  <div className="calendar-time-grid">
                    <label>
                      <span>Datum</span>
                      <input
                        type="date"
                        value={draft.date}
                        onChange={(event) => setDraft({ ...draft, date: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>Uhrzeit</span>
                      <input
                        type="time"
                        value={draft.time}
                        onChange={(event) => setDraft({ ...draft, time: event.target.value })}
                      />
                    </label>
                  </div>
                  <label>
                    <span>Dauer</span>
                    <select
                      value={draft.duration}
                      onChange={(event) => setDraft({ ...draft, duration: event.target.value })}
                    >
                      <option value="30">30 Minuten</option>
                      <option value="60">1 Stunde</option>
                      <option value="90">1,5 Stunden</option>
                      <option value="120">2 Stunden</option>
                      {!["30", "60", "90", "120"].includes(draft.duration) && (
                        <option value={draft.duration}>{draft.duration} Minuten</option>
                      )}
                    </select>
                  </label>
                  <label>
                    <span>Ort · optional</span>
                    <input
                      value={draft.location}
                      onChange={(event) => setDraft({ ...draft, location: event.target.value })}
                      placeholder="Adresse oder Online"
                    />
                  </label>
                  <button className="calendar-preview-button" disabled={busy}>
                    {editingId ? "Änderung prüfen" : "Termin prüfen"} <span>→</span>
                  </button>
                  {editingId && (
                    <button
                      type="button"
                      className="calendar-cancel-edit"
                      onClick={() => {
                        setEditingId(null);
                        setDraft(emptyDraft);
                        setNotice(null);
                      }}
                    >
                      Bearbeitung abbrechen
                    </button>
                  )}
                  {notice && <p className="calendar-notice">{notice}</p>}
                </form>
              </div>
            )}

            {confirming && (
              <div className="calendar-confirm">
                <div>
                  <small>BITTE BESTÄTIGEN</small>
                  <h3>{draft.title}</h3>
                  <p>
                    {formatEventDate(`${draft.date}T${draft.time}:00`)} · {draft.duration} Minuten
                    {draft.location ? ` · ${draft.location}` : ""}
                  </p>
                  <span>
                    {editingId
                      ? "Der bestehende Termin wird erst nach deiner Bestätigung geändert."
                      : "Der Termin wird privat in deinem Hauptkalender angelegt."}
                  </span>
                  <div>
                    <button onClick={() => setConfirming(false)}>Noch ändern</button>
                    <button onClick={() => void saveEvent()} disabled={busy}>
                      {editingId ? "Änderung speichern" : "Verbindlich eintragen"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {pendingDelete && (
              <div className="calendar-confirm">
                <div>
                  <small>LÖSCHEN BESTÄTIGEN</small>
                  <h3>{pendingDelete.title}</h3>
                  <p>{formatEventDate(pendingDelete.start, pendingDelete.allDay)}</p>
                  <span>Dieser Termin wird dauerhaft aus deinem Google Calendar entfernt.</span>
                  <div>
                    <button onClick={() => setPendingDelete(null)}>Abbrechen</button>
                    <button onClick={() => void deleteEvent()} disabled={busy}>
                      Endgültig löschen
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
