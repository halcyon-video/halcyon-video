/** Noncritical model loads belong to one scene and never hold its usable entry.
 * The browser idle callback paces request starts; one load runs at a time.
 */
export type IdleSchedule = (work: () => void) => () => void;

const scheduleIdle: IdleSchedule = (work) => {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(work, { timeout: 250 });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(work, 16);
  return () => clearTimeout(id);
};

interface DetailJob { start: () => Promise<void>; cancelled: boolean }

export class DeferredModelLoads {
  private jobs = new Set<DetailJob>();
  private released = false;
  private stopped = false;
  private running = false;
  private cancelScheduled: (() => void) | null = null;
  private abort = () => this.dispose();

  private signal: AbortSignal;
  private schedule: IdleSchedule;
  private onError: (error: unknown) => void;

  constructor(
    signal: AbortSignal,
    schedule: IdleSchedule = scheduleIdle,
    onError: (error: unknown) => void = error => console.warn('[models] Deferred detail failed:', error),
  ) {
    this.signal = signal;
    this.schedule = schedule;
    this.onError = onError;
    if (signal.aborted) this.stopped = true;
    else signal.addEventListener('abort', this.abort, { once: true });
  }

  /** Cancelling before dequeue must not even resolve/fetch the asset URL. */
  enqueue(start: () => Promise<void>): () => void {
    if (this.stopped) return () => {};
    const job: DetailJob = { start, cancelled: false };
    this.jobs.add(job);
    this.arm();
    return () => {
      job.cancelled = true;
      this.jobs.delete(job);
      if (!this.jobs.size) { this.cancelScheduled?.(); this.cancelScheduled = null; }
    };
  }

  release(): void {
    if (this.stopped) return;
    this.released = true;
    this.arm();
  }

  dispose(): void {
    this.stopped = true;
    this.cancelScheduled?.();
    this.cancelScheduled = null;
    for (const job of this.jobs) job.cancelled = true;
    this.jobs.clear();
    this.signal.removeEventListener('abort', this.abort);
  }

  private arm(): void {
    if (!this.released || this.stopped || this.running || this.cancelScheduled || !this.jobs.size) return;
    this.cancelScheduled = this.schedule(() => {
      this.cancelScheduled = null;
      if (this.stopped) return;
      const job = this.jobs.values().next().value as DetailJob | undefined;
      if (!job) return;
      this.jobs.delete(job);
      this.running = true;
      void Promise.resolve().then(() => {
        if (!job.cancelled && !this.stopped) return job.start();
      }).catch(this.onError).finally(() => {
        this.running = false;
        this.arm();
      });
    });
  }
}
