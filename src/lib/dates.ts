// Location-agnostic calendar date utilities using Temporal.PlainDate
// Prevents UTC-3 timezone drift on YYYY-MM-DD fitness logs.

type PlainDateLike = {
  year: number;
  month: number;
  day: number;
  dayOfWeek: number; // 1 = Monday .. 7 = Sunday
  add(duration: { days?: number; weeks?: number; months?: number }, options?: { overflow?: 'constrain' | 'reject' }): PlainDateLike;
  subtract(duration: { days?: number; weeks?: number }): PlainDateLike;
  until(other: PlainDateLike, options?: { largestUnit?: 'day' }): { days: number };
  equals(other: PlainDateLike): boolean;
  toString(): string;
};

let TemporalRef: any = (globalThis as any).Temporal;

export async function ensureTemporalLoaded(): Promise<void> {
  if (typeof (globalThis as any).Temporal === 'undefined') {
    const mod = await import('temporal-polyfill');
    (globalThis as any).Temporal = mod.Temporal;
  }
  TemporalRef = (globalThis as any).Temporal;
}

function getTemporal() {
  if (!TemporalRef) {
    TemporalRef = (globalThis as any).Temporal;
  }
  return TemporalRef;
}

export function plainDateFromISO(iso: string): PlainDateLike {
  const T = getTemporal();
  return T.PlainDate.from(iso);
}

export function todayISO(): string {
  const T = getTemporal();
  return T.Now.plainDateISO().toString();
}

export function addDaysISO(iso: string, days: number): string {
  const d = plainDateFromISO(iso);
  return (days >= 0 ? d.add({ days }) : d.subtract({ days: Math.abs(days) })).toString();
}

export function diffDaysISO(fromIso: string, toIso: string): number {
  const a = plainDateFromISO(fromIso);
  const b = plainDateFromISO(toIso);
  return a.until(b, { largestUnit: 'day' }).days;
}

export function weekMondayISO(iso: string): string {
  const d = plainDateFromISO(iso);
  const offset = d.dayOfWeek - 1; // 1=Mon -> 0, 7=Sun -> 6
  return offset === 0 ? d.toString() : d.subtract({ days: offset }).toString();
}

export function weekDaysISO(isoInWeek: string): string[] {
  const mon = plainDateFromISO(weekMondayISO(isoInWeek));
  return Array.from({ length: 7 }, (_, idx) => (idx === 0 ? mon.toString() : mon.add({ days: idx }).toString()));
}

const WEEKDAYS_ES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const WEEKDAYS_SHORT_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTHS_SHORT_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function weekdayNameEs(iso: string): string {
  if (!iso) return '';
  const d = plainDateFromISO(iso);
  return WEEKDAYS_ES[d.dayOfWeek - 1] || '';
}

export function weekdayShortEs(iso: string): string {
  if (!iso) return '';
  const d = plainDateFromISO(iso);
  return WEEKDAYS_SHORT_ES[d.dayOfWeek - 1] || '';
}

export function formatShortDateEs(iso: string): string {
  if (!iso) return '';
  const d = plainDateFromISO(iso);
  return `${d.day} ${MONTHS_SHORT_ES[d.month - 1]}`;
}

export function formatDateWithYearEs(iso: string): string {
  if (!iso) return '';
  const d = plainDateFromISO(iso);
  return `${String(d.day).padStart(2, '0')}/${String(d.month).padStart(2, '0')}/${d.year}`;
}

export function formatHumanDateHeaderEs(iso: string): string {
  if (!iso) return '';
  const d = plainDateFromISO(iso);
  return `${WEEKDAYS_ES[d.dayOfWeek - 1]} ${d.day} de ${MONTHS_SHORT_ES[d.month - 1]} ${d.year}`;
}

export function stageForDate(iso: string): '2026-Actual' | '2021-Historico' {
  return iso.startsWith('2021-') || iso.startsWith('2022-') ? '2021-Historico' : '2026-Actual';
}
