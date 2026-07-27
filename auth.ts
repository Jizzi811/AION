import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const googleScope = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

async function refreshGoogleToken(token: {
  refreshToken?: string;
  accessToken?: string;
  expiresAt?: number;
  error?: string;
}) {
  if (!token.refreshToken) return { ...token, error: "RefreshTokenMissing" };

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.AUTH_GOOGLE_ID || "",
        client_secret: process.env.AUTH_GOOGLE_SECRET || "",
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
    });
    const result = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
    };
    if (!response.ok || !result.access_token) throw new Error("refresh_failed");

    return {
      ...token,
      accessToken: result.access_token,
      expiresAt: Math.floor(Date.now() / 1000 + (result.expires_in || 3600)),
      refreshToken: result.refresh_token || token.refreshToken,
      error: undefined,
    };
  } catch {
    return { ...token, error: "RefreshTokenError" };
  }
}

export const { handlers, auth } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      authorization: {
        params: {
          access_type: "offline",
          prompt: "consent",
          scope: googleScope,
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.expiresAt = account.expires_at;
        token.refreshToken = account.refresh_token;
        return token;
      }

      if (token.expiresAt && Date.now() < Number(token.expiresAt) * 1000 - 60_000) {
        return token;
      }

      return refreshGoogleToken(token);
    },
    async session({ session, token }) {
      session.accessToken =
        typeof token.accessToken === "string" ? token.accessToken : undefined;
      session.authError = typeof token.error === "string" ? token.error : undefined;
      return session;
    },
  },
});
