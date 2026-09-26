"use client";

import * as React from "react";
import { SessionProvider, useSession, signIn as nextSignIn, signOut as nextSignOut } from "next-auth/react";

export interface AuthUser {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  status: "loading" | "authenticated" | "unauthenticated";
  /** Whether Google OAuth is configured (env vars present). Login UI is hidden when false. */
  enabled: boolean;
  signIn: () => void;
  signOut: () => void;
}

const Ctx = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children, enabled }: { children: React.ReactNode; enabled: boolean }) {
  return (
    <SessionProvider>
      <AuthInner enabled={enabled}>{children}</AuthInner>
    </SessionProvider>
  );
}

function AuthInner({ children, enabled }: { children: React.ReactNode; enabled: boolean }) {
  const { data, status } = useSession();
  const value: AuthContextValue = React.useMemo(
    () => ({
      user: data?.user ?? null,
      status,
      enabled,
      signIn: () => nextSignIn("google", { callbackUrl: "/" }),
      signOut: () => nextSignOut({ callbackUrl: "/" }),
    }),
    [data, status, enabled]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}