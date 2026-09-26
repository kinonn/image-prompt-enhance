import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Auth is optional: only enable the Google provider when credentials are configured.
// Without them the app runs fully anonymously (login UI is hidden).
const authEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

// AUTH_SECRET is required in production. In dev we fall back to a local-only
// secret so the flow can be tested without env setup. Never rely on the fallback
// in production — set AUTH_SECRET (e.g. `openssl rand -base64 32`).
const secret =
  process.env.AUTH_SECRET || (process.env.NODE_ENV !== "production" ? "image-prompt-dev-secret-change-me" : undefined);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: authEnabled ? [Google] : [],
  session: { strategy: "jwt" },
  // Self-hosted (Docker / LAN) — trust the host header.
  trustHost: true,
  secret,
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user) session.user.id = (token.id as string) ?? session.user.id;
      return session;
    },
  },
});