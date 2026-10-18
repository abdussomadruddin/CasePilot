// Coalesce bursts while discarding snapshots invalidated by a newer event.
export function createRealtimeRefresh<T>(
  load: () => Promise<T>,
  apply: (value: T) => void,
  disposed: () => boolean,
  onError: (error: unknown) => void,
) {
  let revision = 0;
  let running: Promise<void> | null = null;
  return function refresh(): Promise<void> {
    revision += 1;
    if (disposed()) return Promise.resolve();
    if (running) return running;
    running = (async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
      let snapshot: number;
      do {
        snapshot = revision;
        try {
          const value = await load();
          if (!disposed() && snapshot === revision) apply(value);
        } catch (error) {
          if (!disposed()) onError(error);
        }
      } while (!disposed() && snapshot !== revision);
    })().finally(() => { running = null; });
    return running;
  };
}

// Keep full reconciliation for reconnects and events without a visible parent ID.
// IDs remain pending until a successful read, including events arriving mid-request.
export function createScopedRealtimeRefresh<T extends { id: string }>(
  load: (ids?: string[]) => Promise<T[]>,
  apply: (rows: T[], ids?: string[]) => void,
  disposed: () => boolean,
  onError: (error: unknown) => void,
) {
  const pending = new Set<string>();
  let full = false;
  let running: Promise<void> | null = null;
  let revision = 0;
  return function refresh(id?: string): Promise<void> {
    if (disposed()) return Promise.resolve();
    revision += 1;
    if (id) pending.add(id); else full = true;
    if (running) return running;
    running = (async () => {
      // Combine event bursts from one transaction and simultaneous lifecycle events.
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
      while (!disposed()) {
        const snapshot = revision;
        const ids = full ? undefined : [...pending];
        try {
          const rows = await load(ids);
          if (disposed()) return;
          if (snapshot !== revision) continue;
          apply(rows, ids);
          pending.clear();
          full = false;
          return;
        } catch (error) {
          if (!disposed()) onError(error);
          return; // Retain pending IDs/full intent for the next retry.
        }
      }
    })().finally(() => { running = null; });
    return running;
  };
}

export function mergeRealtimeRows<T extends { id: string }>(current: T[], rows: T[], ids?: string[]): T[] {
  if (!ids) return rows;
  const changed = new Set(ids);
  return [...current.filter((row) => !changed.has(row.id)), ...rows];
}
