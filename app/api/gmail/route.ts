import { auth } from "@/auth";

export const runtime = "nodejs";

type GmailHeader = { name?: string; value?: string };
type GmailMessage = {
  id?: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: GmailHeader[] };
};

async function getAccessToken() {
  const session = await auth();
  if (!session?.accessToken || session.authError) return null;
  return session.accessToken;
}

function header(message: GmailMessage, name: string) {
  return message.payload?.headers?.find(
    (item) => item.name?.toLowerCase() === name.toLowerCase(),
  )?.value;
}

function encodeMail(value: string) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function cleanHeader(value: string, max: number) {
  return value.replace(/[\r\n]/g, " ").trim().slice(0, max);
}

export async function GET() {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return Response.json({ error: "Google Mail ist nicht verbunden." }, { status: 401 });
  }

  const listResponse = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15&q=in%3Ainbox",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    },
  );
  const list = (await listResponse.json()) as {
    messages?: Array<{ id?: string }>;
    error?: { message?: string; status?: string };
  };
  if (!listResponse.ok) {
    const disabled = list.error?.status === "PERMISSION_DENIED";
    return Response.json(
      {
        error: disabled
          ? "Die Gmail API oder die Gmail-Berechtigung ist noch nicht aktiviert."
          : list.error?.message || "Der Posteingang konnte nicht gelesen werden.",
        setupRequired: disabled,
      },
      { status: 502 },
    );
  }

  const messages = await Promise.all(
    (list.messages || []).map(async ({ id }) => {
      if (!id) return null;
      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" },
      );
      if (!response.ok) return null;
      const message = (await response.json()) as GmailMessage;
      return {
        id: message.id,
        threadId: message.threadId,
        from: header(message, "From") || "Unbekannter Absender",
        subject: header(message, "Subject") || "Ohne Betreff",
        date: header(message, "Date"),
        snippet: message.snippet || "",
      };
    }),
  );

  return Response.json({ messages: messages.filter(Boolean) });
}

export async function POST(request: Request) {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return Response.json({ error: "Google Mail ist nicht verbunden." }, { status: 401 });
  }

  const body = (await request.json()) as {
    action?: "draft" | "send";
    to?: string;
    subject?: string;
    message?: string;
    confirmed?: boolean;
  };
  const to = cleanHeader(body.to || "", 320);
  const subject = cleanHeader(body.subject || "", 500);
  const message = body.message?.trim().slice(0, 40_000) || "";
  if (!to || !to.includes("@") || !subject || !message) {
    return Response.json(
      { error: "Empfänger, Betreff und Nachricht werden vollständig benötigt." },
      { status: 400 },
    );
  }
  if (body.action === "send" && !body.confirmed) {
    return Response.json(
      { error: "Das Versenden muss ausdrücklich bestätigt werden." },
      { status: 400 },
    );
  }

  const raw = encodeMail(
    [
      `To: ${to}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      message,
    ].join("\r\n"),
  );
  const endpoint =
    body.action === "send"
      ? "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
      : "https://gmail.googleapis.com/gmail/v1/users/me/drafts";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body.action === "send" ? { raw } : { message: { raw } }),
  });
  const result = (await response.json()) as {
    id?: string;
    message?: { id?: string };
    error?: { message?: string };
  };
  if (!response.ok) {
    return Response.json(
      { error: result.error?.message || "Die E-Mail-Aktion ist fehlgeschlagen." },
      { status: 502 },
    );
  }

  return Response.json({
    id: result.id || result.message?.id,
    status: body.action === "send" ? "sent" : "drafted",
  });
}
