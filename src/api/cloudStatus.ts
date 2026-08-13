export interface CloudStatusSnapshot {
  available: boolean;
  message: string | null;
}

// The boot screen uses animation only; an error message is published only after a request fails.
let snapshot: CloudStatusSnapshot = { available: false, message: null };
const listeners = new Set<() => void>();

function publish(next: CloudStatusSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

export function getCloudStatus(): CloudStatusSnapshot {
  return snapshot;
}

export function subscribeCloudStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function markCloudAvailable(): void {
  if (snapshot.available && snapshot.message === null) return;
  publish({ available: true, message: null });
}

export function markCloudUnavailable(message = '云端服务暂时不可用，请稍后重试。'): void {
  if (!snapshot.available && snapshot.message === message) return;
  publish({ available: false, message });
}
