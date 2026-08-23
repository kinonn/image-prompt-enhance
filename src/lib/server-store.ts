import type { PersistedAppState } from "@/lib/state-types";

/**
 * Server-side in-memory store for logged-in users.
 *
 * Keyed by user id; survives page refreshes but is lost when the server
 * process restarts (intentional — no database). Single-instance only.
 */
const store = new Map<string, PersistedAppState>();

export function getUserState(userId: string): PersistedAppState | undefined {
  return store.get(userId);
}

export function setUserState(userId: string, state: PersistedAppState): void {
  store.set(userId, state);
}

export function clearUserState(userId: string): void {
  store.delete(userId);
}