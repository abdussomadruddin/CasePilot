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
