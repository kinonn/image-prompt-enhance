import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUserState, setUserState } from "@/lib/server-store";
import type { PersistedAppState } from "@/lib/state-types";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return session.user.id;
}

/** GET /api/state — returns the logged-in user's in-memory state (or null). */
export async function GET() {
  const userId = await requireUser();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(getUserState(userId) ?? null);
}

/**
 * PUT /api/state — merges partial slices ({ settings?, image?, chat? }) into
 * the user's in-memory state. The client sends complete slices per provider.
 */
export async function PUT(req: NextRequest) {
  const userId = await requireUser();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Partial<PersistedAppState>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const current = getUserState(userId);
  const next: PersistedAppState = {
    settings: body.settings ?? current?.settings,
    image: body.image ?? current?.image,
    chat: body.chat ?? current?.chat,
  };

  // Nothing to store — treat as a no-op rather than creating an empty entry.
  if (!next.settings && !next.image && !next.chat) {
    return NextResponse.json({ ok: true });
  }

  setUserState(userId, next);
  return NextResponse.json({ ok: true });
}