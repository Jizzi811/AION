import { auth } from "@/auth";

export const runtime = "nodejs";

type GoogleEvent = {
  id?: string;
  summary?: string;
  location?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

function calendarHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

async function getAccessToken() {
  const session = await auth();
  if (!session?.accessToken || session.authError) return null;
  return session.accessToken;
}

export async function GET() {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return Response.json({ error: "Google Calendar ist nicht verbunden." }, { status: 401 });
  }

  const timeMin = new Date();
  const timeMax = new Date(timeMin);
  timeMax.setDate(timeMax.getDate() + 7);
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "30",
    timeZone: "Europe/Berlin",
  });

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: calendarHeaders(accessToken), cache: "no-store" },
  );
  if (!response.ok) {
    return Response.json({ error: "Der Kalender konnte nicht gelesen werden." }, { status: 502 });
  }

  const result = (await response.json()) as { items?: GoogleEvent[] };
  const events = (result.items || []).map((event) => ({
    id: event.id,
    title: event.summary || "Ohne Titel",
    location: event.location,
    url: event.htmlLink,
    start: event.start?.dateTime || event.start?.date,
    end: event.end?.dateTime || event.end?.date,
    allDay: Boolean(event.start?.date),
  }));

  return Response.json({ events, rangeEnd: timeMax.toISOString() });
}

export async function POST(request: Request) {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return Response.json({ error: "Google Calendar ist nicht verbunden." }, { status: 401 });
  }

  const body = (await request.json()) as {
    title?: string;
    start?: string;
    end?: string;
    location?: string;
    description?: string;
    confirmed?: boolean;
  };
  const title = body.title?.trim().slice(0, 200);
  const start = body.start ? new Date(body.start) : null;
  const end = body.end ? new Date(body.end) : null;

  if (
    !body.confirmed ||
    !title ||
    !start ||
    !end ||
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end <= start
  ) {
    return Response.json(
      { error: "Bitte bestätige einen vollständigen Termin mit gültiger Zeit." },
      { status: 400 },
    );
  }

  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: calendarHeaders(accessToken),
      body: JSON.stringify({
        summary: title,
        location: body.location?.trim().slice(0, 300) || undefined,
        description: body.description?.trim().slice(0, 4_000) || undefined,
        start: { dateTime: start.toISOString(), timeZone: "Europe/Berlin" },
        end: { dateTime: end.toISOString(), timeZone: "Europe/Berlin" },
        visibility: "private",
      }),
    },
  );
  const event = (await response.json()) as GoogleEvent & { error?: { message?: string } };
  if (!response.ok) {
    return Response.json(
      { error: event.error?.message || "Der Termin konnte nicht angelegt werden." },
      { status: 502 },
    );
  }

  return Response.json({
    event: {
      id: event.id,
      title: event.summary,
      start: event.start?.dateTime,
      end: event.end?.dateTime,
      url: event.htmlLink,
    },
  });
}
