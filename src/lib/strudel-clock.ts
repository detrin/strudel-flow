let _schedulerNow: (() => number) | null = null;
let _schedulerCps: (() => number) | null = null;

export function setSchedulerNow(fn: () => number, cps?: () => number) {
  _schedulerNow = fn;
  if (cps) _schedulerCps = cps;
}
export function getSchedulerNow(): number {
  return _schedulerNow?.() ?? 0;
}
/** Cycles per second now (0 before Strudel started). */
export function getSchedulerCps(): number {
  return _schedulerCps?.() ?? 0;
}
