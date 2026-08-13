export interface AuthUser {
  id: number;
  username: string;
}

let activeUser: AuthUser | null = null;

/**
 * The browser keeps only the identity for the current in-memory session.
 * Authentication and user data are always read from the API; nothing here is
 * persisted to localStorage, IndexedDB, or a service-worker cache.
 */
export function getActiveUser(): AuthUser | null {
  return activeUser;
}

export function activateUser(user: AuthUser): void {
  activeUser = user;
}

export function clearActiveUser(): void {
  activeUser = null;
}

/** Namespaces are still scoped in memory so a user switch cannot mix state. */
export function userStorageKey(key: string): string {
  return activeUser ? `wenyan:user:${activeUser.id}:${key}` : `wenyan:${key}`;
}
