/** Official SuperOps MSP published limit: 100 requests per minute. */
export const SUPEROPS_MAX_REQUESTS_PER_MINUTE = 100;
export const SUPEROPS_MAX_PAGE_SIZE = 100;

export class MinuteLimiter {
  private readonly timestamps: number[] = [];

  constructor(
    private readonly maxPerMinute: number = SUPEROPS_MAX_REQUESTS_PER_MINUTE,
    private readonly now: () => number = () => Date.now()
  ) {}

  tryAcquire(): boolean {
    const cutoff = this.now() - 60_000;
    while (this.timestamps.length > 0 && this.timestamps[0] <= cutoff) {
      this.timestamps.shift();
    }
    if (this.timestamps.length >= this.maxPerMinute) {
      return false;
    }
    this.timestamps.push(this.now());
    return true;
  }
}

export function clampPageSize(value: number | undefined, fallback = 25): number {
  const n = value ?? fallback;
  if (!Number.isInteger(n) || n < 1) return fallback;
  return Math.min(n, SUPEROPS_MAX_PAGE_SIZE);
}
