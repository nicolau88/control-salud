import type { ActividadRow, DiarioRow, GymSeriesRow } from '../types';
import { addDaysISO, diffDaysISO, formatShortDateEs, weekMondayISO } from './dates';

export function parseNum(val: string | number | undefined | null): number | null {
  if (val === undefined || val === null) return null;
  const cleaned = String(val).trim().replace(',', '.');
  if (!cleaned || cleaned === '-' || cleaned === '#DIV/0!') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function formatNum(val: number | null | undefined, decimals = 1): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  const rounded = Number(val.toFixed(decimals));
  return decimals === 0 ? String(Math.round(val)) : rounded.toFixed(decimals).replace(/\.0+$/, '');
}

export interface ParsedSet {
  setNumber: number;
  reps: number;
  kg: number;
}

export function extractSets(row: GymSeriesRow): ParsedSet[] {
  const pairs: [string, string][] = [
    [row.Serie_1_Reps, row.Serie_1_Kg],
    [row.Serie_2_Reps, row.Serie_2_Kg],
    [row.Serie_3_Reps, row.Serie_3_Kg],
    [row.Serie_4_Reps, row.Serie_4_Kg],
    [row.Serie_5_Reps, row.Serie_5_Kg],
    [row.Serie_6_Reps, row.Serie_6_Kg]
  ];
  const out: ParsedSet[] = [];
  pairs.forEach(([rStr, kStr], idx) => {
    const reps = parseNum(rStr);
    const kg = parseNum(kStr);
    if (reps !== null && reps > 0) {
      out.push({
        setNumber: idx + 1,
        reps,
        kg: kg !== null ? kg : 0
      });
    }
  });
  return out;
}

export function computeGymTotals(sets: { reps: string; kg: string }[]) {
  let totalSeries = 0;
  let totalReps = 0;
  let tonelaje = 0;
  let best1RM = 0;
  let maxKg = 0;

  for (const s of sets) {
    const r = parseNum(s.reps);
    const k = parseNum(s.kg) ?? 0;
    if (r !== null && r > 0) {
      totalSeries += 1;
      totalReps += Math.round(r);
      if (k > 0) {
        tonelaje += r * k;
        if (k > maxKg) maxKg = k;
        const effectiveReps = Math.min(r, 15);
        const est = effectiveReps === 1 ? k : k * (1 + effectiveReps / 30);
        if (est > best1RM) best1RM = est;
      }
    }
  }

  return {
    totalSeries,
    totalReps,
    tonelaje: Math.round(tonelaje * 10) / 10,
    best1RM: Math.round(best1RM * 10) / 10,
    maxKg
  };
}

export interface DailyWithMovingAvg {
  fecha: string;
  peso: number | null;
  mediaMovil7d: number | null;
  kcal: number | null;
  pasos: number | null;
  creatina: boolean;
  row: DiarioRow;
}

export function computeDailySeries(diarioRows: DiarioRow[]): DailyWithMovingAvg[] {
  const sorted = [...diarioRows].sort((a, b) => a.Fecha.localeCompare(b.Fecha));
  return sorted.map((row, idx) => {
    const peso = parseNum(row.Peso_Kg);
    const kcal = parseNum(row.Kcal);
    const pasos = parseNum(row.Pasos);

    const windowWeights: number[] = [];
    for (let j = idx; j >= 0; j--) {
      const prev = sorted[j];
      const dist = diffDaysISO(prev.Fecha, row.Fecha);
      if (dist > 6) break;
      const pw = parseNum(prev.Peso_Kg);
      if (pw !== null) windowWeights.push(pw);
    }
    const mediaMovil7d =
      windowWeights.length > 0
        ? Math.round((windowWeights.reduce((s, v) => s + v, 0) / windowWeights.length) * 100) / 100
        : null;

    return {
      fecha: row.Fecha,
      peso,
      mediaMovil7d,
      kcal,
      pasos,
      creatina: row.Creatina?.toUpperCase() === 'SI',
      row
    };
  });
}

export interface WeeklySummary {
  mondayISO: string;
  sundayISO: string;
  label: string;
  promPeso: number | null;
  promKcal: number | null;
  deficitGramosSem: number | null;
  deltaKgSem: number | null;
  diasPesados: number;
  diasKcal: number;
  sesionesGym: number;
  sesionesPadel: number;
  minutosCardio: number;
  pasosPromedio: number | null;
  tdeeEstimadoSem: number | null;
}

export function computeWeeklySummaries(
  diarioRows: DiarioRow[],
  gymRows: GymSeriesRow[],
  actRows: ActividadRow[]
): WeeklySummary[] {
  const weekMap = new Map<
    string,
    {
      weights: number[];
      kcals: number[];
      steps: number[];
      gymDates: Set<string>;
      padelCount: number;
      cardioMins: number;
    }
  >();

  const ensureWeek = (iso: string) => {
    const mon = weekMondayISO(iso);
    let bucket = weekMap.get(mon);
    if (!bucket) {
      bucket = {
        weights: [],
        kcals: [],
        steps: [],
        gymDates: new Set(),
        padelCount: 0,
        cardioMins: 0
      };
      weekMap.set(mon, bucket);
    }
    return bucket;
  };

  for (const d of diarioRows) {
    if (!d.Fecha) continue;
    const b = ensureWeek(d.Fecha);
    const w = parseNum(d.Peso_Kg);
    const k = parseNum(d.Kcal);
    const s = parseNum(d.Pasos);
    if (w !== null) b.weights.push(w);
    if (k !== null) b.kcals.push(k);
    if (s !== null) b.steps.push(s);
  }

  for (const g of gymRows) {
    if (!g.Fecha) continue;
    const b = ensureWeek(g.Fecha);
    b.gymDates.add(g.Fecha);
  }

  for (const a of actRows) {
    if (!a.Fecha) continue;
    const b = ensureWeek(a.Fecha);
    if (a.Tipo.toLowerCase().includes('pádel') || a.Tipo.toLowerCase().includes('padel')) {
      b.padelCount += 1;
    }
    const mins = parseNum(a.Duracion_Min);
    if (mins !== null) b.cardioMins += mins;
  }

  const mondays = Array.from(weekMap.keys()).sort();
  const out: WeeklySummary[] = [];

  for (let i = 0; i < mondays.length; i++) {
    const mon = mondays[i];
    const sun = addDaysISO(mon, 6);
    const b = weekMap.get(mon)!;
    const promPeso =
      b.weights.length > 0
        ? Math.round((b.weights.reduce((x, y) => x + y, 0) / b.weights.length) * 100) / 100
        : null;
    const promKcal =
      b.kcals.length > 0 ? Math.round(b.kcals.reduce((x, y) => x + y, 0) / b.kcals.length) : null;
    const pasosPromedio =
      b.steps.length > 0 ? Math.round(b.steps.reduce((x, y) => x + y, 0) / b.steps.length) : null;

    const prev = i > 0 ? out[i - 1] : null;
    const isContiguous = prev ? diffDaysISO(prev.mondayISO, mon) <= 14 : false;
    let deltaKgSem: number | null = null;
    let deficitGramosSem: number | null = null;
    let tdeeEstimadoSem: number | null = null;

    if (isContiguous && prev && prev.promPeso !== null && promPeso !== null) {
      deltaKgSem = Math.round((promPeso - prev.promPeso) * 100) / 100;
      deficitGramosSem = Math.round((prev.promPeso - promPeso) * 1000);
      if (promKcal !== null) {
        const rawTdee = Math.round(promKcal - (deltaKgSem * 7700) / 7);
        if (rawTdee >= 1200 && rawTdee <= 5000) {
          tdeeEstimadoSem = rawTdee;
        }
      }
    }

    out.push({
      mondayISO: mon,
      sundayISO: sun,
      label: `${formatShortDateEs(mon)} – ${formatShortDateEs(sun)}`,
      promPeso,
      promKcal,
      deficitGramosSem,
      deltaKgSem,
      diasPesados: b.weights.length,
      diasKcal: b.kcals.length,
      sesionesGym: b.gymDates.size,
      sesionesPadel: b.padelCount,
      minutosCardio: b.cardioMins,
      pasosPromedio,
      tdeeEstimadoSem
    });
  }

  return out;
}

export function computeSmoothedTDEE(weekly: WeeklySummary[]): {
  tdee: number | null;
  weeksUsed: number;
  avgIntake: number | null;
  avgWeeklyDeltaKg: number | null;
} {
  const valid = weekly.filter((w) => w.tdeeEstimadoSem !== null && w.promKcal !== null && w.deltaKgSem !== null);
  const recent = valid.slice(-4);
  if (recent.length === 0) {
    return { tdee: null, weeksUsed: 0, avgIntake: null, avgWeeklyDeltaKg: null };
  }
  const avgTdee = Math.round(recent.reduce((s, w) => s + (w.tdeeEstimadoSem ?? 0), 0) / recent.length);
  const avgIntake = Math.round(recent.reduce((s, w) => s + (w.promKcal ?? 0), 0) / recent.length);
  const avgWeeklyDeltaKg =
    Math.round((recent.reduce((s, w) => s + (w.deltaKgSem ?? 0), 0) / recent.length) * 100) / 100;
  return { tdee: avgTdee, weeksUsed: recent.length, avgIntake, avgWeeklyDeltaKg };
}

export function suggestNextSession(gymRows: GymSeriesRow[], selectedDate: string): 'Sesión A' | 'Sesión B' | 'Sesión C' {
  // If exercises were already logged on selectedDate under a session, stay on that session
  const sameDay = gymRows.find(
    (g) =>
      g.Fecha === selectedDate &&
      (g.Dia_Rutina === 'Sesión A' || g.Dia_Rutina === 'Sesión B' || g.Dia_Rutina === 'Sesión C')
  );
  if (sameDay) return sameDay.Dia_Rutina as 'Sesión A' | 'Sesión B' | 'Sesión C';

  const recentCurrent = [...gymRows]
    .filter(
      (g) =>
        g.Etapa === '2026-Actual' &&
        g.Fecha < selectedDate &&
        (g.Dia_Rutina === 'Sesión A' || g.Dia_Rutina === 'Sesión B' || g.Dia_Rutina === 'Sesión C')
    )
    .sort((a, b) => b.Fecha.localeCompare(a.Fecha));

  if (recentCurrent.length === 0) return 'Sesión A';
  const last = recentCurrent[0].Dia_Rutina;
  if (last === 'Sesión A') return 'Sesión B';
  if (last === 'Sesión B') return 'Sesión C';
  return 'Sesión A';
}

export function normalizeExerciseKey(name: string): string {
  const n = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (n.includes('sentadilla') && !n.includes('bulgara')) return 'sentadilla';
  if (n.includes('bulgara')) return 'sentadilla bulgara';
  if (n.includes('rumano')) return 'peso muerto rumano';
  if (n.includes('press plano') || n.includes('press pecho con manc') || n.includes('banca plano')) {
    return n.includes('manc') ? 'press pecho mancuernas' : 'press plano';
  }
  if (n.includes('press inclinado')) {
    return n.includes('manc') ? 'press inclinado mancuernas' : 'press inclinado barra';
  }
  if (n.includes('elevaciones laterales') || n.includes('vuelos laterales')) return 'elevaciones laterales';
  if (n.includes('jalon') || n.includes('dorsalera')) return 'jalon / dorsalera';
  if (n.includes('remo unilateral') || n.includes('serrucho')) return 'remo unilateral mancuerna';
  if (n.includes('remo en polea') || n.includes('remo bajo')) return 'remo polea baja';
  if (n.includes('press militar') || n.includes('press hombros')) return 'press militar hombros';
  if (n.includes('curl femoral') || n.includes('isquiotibiales acostado')) return 'curl femoral';
  if (n.includes('biceps')) return 'curl biceps';
  return n;
}

export function findLastExerciseLogs(
  exerciseName: string,
  allGymRows: GymSeriesRow[],
  beforeOrOnDate?: string
): { latestCurrent: GymSeriesRow | null; latestHistorical: GymSeriesRow | null; best1RMAllTime: number } {
  const key = normalizeExerciseKey(exerciseName);
  const matching = allGymRows
    .filter((r) => normalizeExerciseKey(r.Ejercicio) === key)
    .sort((a, b) => b.Fecha.localeCompare(a.Fecha));

  const filtered = beforeOrOnDate ? matching.filter((r) => r.Fecha <= beforeOrOnDate) : matching;
  const latestCurrent = filtered.find((r) => r.Etapa === '2026-Actual') || null;
  const latestHistorical = filtered.find((r) => r.Etapa === '2021-Historico') || null;

  let best1RMAllTime = 0;
  for (const r of matching) {
    const v = parseNum(r.Mejor_1RM_Est);
    if (v !== null && v > best1RMAllTime) best1RMAllTime = v;
  }

  return { latestCurrent, latestHistorical, best1RMAllTime };
}

export interface PatternVolume {
  patron: string;
  seriesEfectivas: number;
  tonelajeTotal: number;
  targetMin: number;
  targetMax: number;
}

export function computeWeeklyPatternVolume(gymRows: GymSeriesRow[], weekMonday: string): PatternVolume[] {
  const weekEnd = addDaysISO(weekMonday, 6);
  const inWeek = gymRows.filter((r) => r.Fecha >= weekMonday && r.Fecha <= weekEnd);

  const patterns = [
    { patron: 'Empuje tren inferior', targetMin: 8, targetMax: 15 },
    { patron: 'Traccion tren inferior', targetMin: 6, targetMax: 12 },
    { patron: 'Empuje tren superior', targetMin: 10, targetMax: 18 },
    { patron: 'Traccion tren superior', targetMin: 10, targetMax: 18 },
    { patron: 'Aislados brazo', targetMin: 6, targetMax: 14 },
    { patron: 'Core / Abdominales', targetMin: 3, targetMax: 9 }
  ];

  const map = new Map<string, { series: number; ton: number; min: number; max: number }>();
  for (const p of patterns) {
    map.set(p.patron, { series: 0, ton: 0, min: p.targetMin, max: p.targetMax });
  }

  for (const r of inWeek) {
    let pat = r.Patron_Movimiento;
    if (pat === 'Aislados tren superior') pat = 'Empuje tren superior';
    if (pat.includes('Core')) pat = 'Core / Abdominales';
    const entry = map.get(pat) || { series: 0, ton: 0, min: 6, max: 15 };
    entry.series += parseNum(r.Total_Series) ?? 0;
    entry.ton += parseNum(r.Tonelaje_Kg) ?? 0;
    map.set(pat, entry);
  }

  return Array.from(map.entries()).map(([patron, val]) => ({
    patron,
    seriesEfectivas: val.series,
    tonelajeTotal: Math.round(val.ton),
    targetMin: val.min,
    targetMax: val.max
  }));
}
