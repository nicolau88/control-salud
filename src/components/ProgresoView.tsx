import React, { useMemo, useState } from 'react';
import { Award, BarChart3, Dumbbell, Flame, TrendingDown } from 'lucide-react';
import type { ActividadRow, AppConfig, DiarioRow, EtapaType, GymSeriesRow } from '../types';
import { formatDateWithYearEs, formatShortDateEs } from '../lib/dates';
import {
  computeDailySeries,
  computeSmoothedTDEE,
  computeWeeklySummaries,
  extractSets,
  formatNum,
  normalizeExerciseKey,
  parseNum
} from '../lib/metrics';

interface ProgresoViewProps {
  diario: DiarioRow[];
  seriesGym: GymSeriesRow[];
  actividadFisica: ActividadRow[];
  config: AppConfig;
}

export const ProgresoView: React.FC<ProgresoViewProps> = ({
  diario,
  seriesGym,
  actividadFisica,
  config
}) => {
  const [stageFilter, setStageFilter] = useState<EtapaType>('2026-Actual');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const filteredDiario = useMemo(
    () => (stageFilter === 'Todas' ? diario : diario.filter((d) => d.Etapa === stageFilter)),
    [diario, stageFilter]
  );
  const filteredGym = useMemo(
    () => (stageFilter === 'Todas' ? seriesGym : seriesGym.filter((g) => g.Etapa === stageFilter)),
    [seriesGym, stageFilter]
  );
  const filteredAct = useMemo(
    () =>
      stageFilter === 'Todas'
        ? actividadFisica
        : actividadFisica.filter((a) => a.Etapa === stageFilter),
    [actividadFisica, stageFilter]
  );

  // Automatically offer quick switch hint if 2026 only has 2 days so far
  const weightSeries = useMemo(
    () => computeDailySeries(filteredDiario).filter((d) => d.peso !== null),
    [filteredDiario]
  );

  const weeklySummaries = useMemo(
    () => computeWeeklySummaries(filteredDiario, filteredGym, filteredAct),
    [filteredDiario, filteredGym, filteredAct]
  );

  const tdeeSummary = useMemo(() => computeSmoothedTDEE(weeklySummaries), [weeklySummaries]);

  // Exercise progression options (grouped by normalized exercise key)
  const exerciseGroups = useMemo(() => {
    const map = new Map<
      string,
      { label: string; count: number; rows: GymSeriesRow[]; maxKg: number; best1RM: number }
    >();
    for (const r of filteredGym) {
      const key = normalizeExerciseKey(r.Ejercicio);
      const sets = extractSets(r);
      if (sets.length === 0) continue;
      const topKg = Math.max(...sets.map((s) => s.kg));
      const est1rm = parseNum(r.Mejor_1RM_Est) ?? 0;
      const entry = map.get(key);
      if (!entry) {
        map.set(key, {
          label: r.Ejercicio,
          count: 1,
          rows: [r],
          maxKg: topKg,
          best1RM: est1rm
        });
      } else {
        entry.count += 1;
        entry.rows.push(r);
        if (topKg > entry.maxKg) entry.maxKg = topKg;
        if (est1rm > entry.best1RM) entry.best1RM = est1rm;
      }
    }
    return Array.from(map.entries())
      .map(([key, v]) => ({
        key,
        ...v,
        rows: v.rows.sort((a, b) => a.Fecha.localeCompare(b.Fecha))
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredGym]);

  const [selectedExKey, setSelectedExKey] = useState('sentadilla');
  const activeExGroup = useMemo(() => {
    return (
      exerciseGroups.find((g) => g.key === selectedExKey) ||
      exerciseGroups[0] ||
      null
    );
  }, [exerciseGroups, selectedExKey]);

  // Weight SVG chart geometry
  const goalWeight = parseNum(config.peso_objetivo_kg);
  const wChart = useMemo(() => {
    if (weightSeries.length === 0) return null;
    const W = 760;
    const H = 250;
    const padL = 46;
    const padR = 20;
    const padT = 20;
    const padB = 34;
    const vals = weightSeries.map((d) => d.peso as number);
    if (goalWeight && stageFilter === '2026-Actual') vals.push(goalWeight);
    const minW = Math.floor((Math.min(...vals) - 0.6) * 2) / 2;
    const maxW = Math.ceil((Math.max(...vals) + 0.6) * 2) / 2;
    const span = Math.max(1, maxW - minW);

    const xFor = (i: number) =>
      weightSeries.length === 1
        ? (padL + W - padR) / 2
        : padL + (i / (weightSeries.length - 1)) * (W - padL - padR);
    const yFor = (kg: number) => padT + (1 - (kg - minW) / span) * (H - padT - padB);

    const rawPoints = weightSeries.map((d, i) => `${xFor(i).toFixed(1)},${yFor(d.peso!).toFixed(1)}`).join(' ');
    const avgPoints = weightSeries
      .map((d, i) =>
        d.mediaMovil7d !== null ? `${xFor(i).toFixed(1)},${yFor(d.mediaMovil7d).toFixed(1)}` : null
      )
      .filter(Boolean)
      .join(' ');

    return { W, H, padL, padR, padT, padB, minW, maxW, xFor, yFor, rawPoints, avgPoints };
  }, [weightSeries, goalWeight, stageFilter]);

  // Exercise SVG chart geometry
  const exChart = useMemo(() => {
    if (!activeExGroup || activeExGroup.rows.length === 0) return null;
    const pts = activeExGroup.rows
      .map((r) => {
        const sets = extractSets(r);
        const topKg = sets.length > 0 ? Math.max(...sets.map((s) => s.kg)) : 0;
        const est1rm = parseNum(r.Mejor_1RM_Est) ?? topKg;
        const ton = parseNum(r.Tonelaje_Kg) ?? 0;
        return { fecha: r.Fecha, topKg, est1rm, ton, sets };
      })
      .filter((p) => p.est1rm > 0 || p.topKg > 0);
    if (pts.length === 0) return null;

    const W = 760;
    const H = 236;
    const padL = 46;
    const padR = 20;
    const padT = 26;
    const padB = 34;
    const allY = pts.flatMap((p) => [p.topKg, p.est1rm]);
    const minY = Math.max(0, Math.floor(Math.min(...allY) - 5));
    const maxY = Math.ceil(Math.max(...allY) + 5);
    const span = Math.max(5, maxY - minY);

    const xFor = (i: number) =>
      pts.length === 1
        ? (padL + W - padR) / 2
        : padL + (i / (pts.length - 1)) * (W - padL - padR);
    const yFor = (v: number) => padT + (1 - (v - minY) / span) * (H - padT - padB);

    const line1RM = pts.map((p, i) => `${xFor(i).toFixed(1)},${yFor(p.est1rm).toFixed(1)}`).join(' ');
    const lineTopKg = pts.map((p, i) => `${xFor(i).toFixed(1)},${yFor(p.topKg).toFixed(1)}`).join(' ');

    return { W, H, padL, padR, padT, padB, minY, maxY, pts, xFor, yFor, line1RM, lineTopKg };
  }, [activeExGroup]);

  const startWeight = weightSeries.length > 0 ? weightSeries[0].peso! : null;
  const latestWeight = weightSeries.length > 0 ? weightSeries[weightSeries.length - 1].peso! : null;
  const totalDeltaKg =
    startWeight !== null && latestWeight !== null
      ? Math.round((latestWeight - startWeight) * 100) / 100
      : null;

  const hoveredPoint =
    hoverIdx !== null && weightSeries[hoverIdx] ? weightSeries[hoverIdx] : weightSeries[weightSeries.length - 1];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
      {/* Selector de etapa */}
      <section className="card">
        <div className="card-header">
          <div>
            <h1 className="card-title" style={{ fontSize: '1.2rem' }}>
              <BarChart3 size={20} aria-hidden="true" />
              Evolución, Fuerza e Historial
            </h1>
            <p className="card-desc">
              Compará tu etapa actual con tu proceso completo de 2021 importado desde Metricas Salud.
            </p>
          </div>
        </div>

        <fieldset className="radio-group">
          <legend>Etapa analizada</legend>
          {(
            [
              { id: '2026-Actual', label: 'Etapa Actual (2026)' },
              { id: '2021-Historico', label: 'Histórico 2021 (232 días · 654 ejercicios)' },
              { id: 'Todas', label: 'Historial Completo Unificado' }
            ] as const
          ).map((opt) => (
            <label key={opt.id} className="check-pill" htmlFor={`stage-${opt.id}`}>
              <input
                id={`stage-${opt.id}`}
                type="radio"
                name="etapa_progreso"
                value={opt.id}
                checked={stageFilter === opt.id}
                onChange={() => {
                  setStageFilter(opt.id);
                  setHoverIdx(null);
                }}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </fieldset>

        <div className="grid-stats">
          <div className="stat-tile">
            <span className="stat-label">Cambio de Peso</span>
            <span className="stat-value">
              {totalDeltaKg !== null ? `${totalDeltaKg > 0 ? '+' : ''}${formatNum(totalDeltaKg, 2)} kg` : '—'}
            </span>
            <span className="stat-meta">
              {startWeight !== null && latestWeight !== null
                ? `${formatNum(startWeight, 2)} → ${formatNum(latestWeight, 2)} kg`
                : 'Sin registros'}
            </span>
          </div>

          <div className="stat-tile">
            <span className="stat-label">Días Registrados</span>
            <span className="stat-value">{weightSeries.length}</span>
            <span className="stat-meta">{weeklySummaries.length} semanas computadas</span>
          </div>

          <div className="stat-tile">
            <span className="stat-label">TDEE Medio Estimado</span>
            <span className="stat-value">
              {tdeeSummary.tdee ? `${tdeeSummary.tdee} kcal` : 'Calibrando'}
            </span>
            <span className="stat-meta">
              {tdeeSummary.avgIntake
                ? `Ingesta media: ${tdeeSummary.avgIntake} kcal/día`
                : 'Sumá 2 semanas para cálculo'}
            </span>
          </div>

          <div className="stat-tile">
            <span className="stat-label">Series de Gimnasio</span>
            <span className="stat-value">{filteredGym.length}</span>
            <span className="stat-meta">Bloques de ejercicios cargados</span>
          </div>
        </div>
      </section>

      {/* Gráfico 1: Peso Diario + Media Móvil 7d */}
      <section className="card" aria-labelledby="chart-weight-heading">
        <div className="card-header">
          <div>
            <h2 id="chart-weight-heading" className="card-title">
              <TrendingDown size={19} style={{ color: 'var(--brand)' }} aria-hidden="true" />
              Curva de Peso Diario vs. Media Móvil de 7 Días
            </h2>
            <p className="card-desc">
              Tocá o pasá el cursor sobre la curva para inspeccionar cada pesaje.
            </p>
          </div>
          {hoveredPoint && (
            <div className="badge badge-emerald tabular">
              {formatDateWithYearEs(hoveredPoint.fecha)}: {formatNum(hoveredPoint.peso, 2)} kg (Media 7d:{' '}
              {formatNum(hoveredPoint.mediaMovil7d, 2)} kg)
            </div>
          )}
        </div>

        {wChart ? (
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <svg
              viewBox={`0 0 ${wChart.W} ${wChart.H}`}
              role="img"
              aria-label="Gráfico de evolución de peso corporal y media móvil de 7 días"
              style={{ width: '100%', height: 'auto', display: 'block' }}
            >
              {/* Líneas horizontales de guía */}
              {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                const val = wChart.minW + t * (wChart.maxW - wChart.minW);
                const y = wChart.yFor(val);
                return (
                  <g key={t}>
                    <line
                      x1={wChart.padL}
                      x2={wChart.W - wChart.padR}
                      y1={y}
                      y2={y}
                      stroke="var(--border-subtle)"
                      strokeDasharray="3 3"
                    />
                    <text
                      x={wChart.padL - 6}
                      y={y + 4}
                      textAnchor="end"
                      fontSize="11"
                      fill="var(--text-secondary)"
                    >
                      {val.toFixed(1)}
                    </text>
                  </g>
                );
              })}

              {/* Meta de peso en etapa actual */}
              {goalWeight &&
                stageFilter === '2026-Actual' &&
                goalWeight >= wChart.minW &&
                goalWeight <= wChart.maxW && (
                  <line
                    x1={wChart.padL}
                    x2={wChart.W - wChart.padR}
                    y1={wChart.yFor(goalWeight)}
                    y2={wChart.yFor(goalWeight)}
                    stroke="var(--amber)"
                    strokeWidth="1.5"
                    strokeDasharray="6 4"
                  />
                )}

              {/* Peso diario (línea tenue) */}
              <polyline
                fill="none"
                stroke="var(--blue)"
                strokeOpacity="0.45"
                strokeWidth="1.6"
                points={wChart.rawPoints}
              />

              {/* Media móvil 7 días (línea principal esmeralda) */}
              <polyline
                fill="none"
                stroke="var(--brand)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={wChart.avgPoints}
              />

              {/* Puntos interactivos */}
              {weightSeries.map((d, idx) => {
                const cx = wChart.xFor(idx);
                const cy = wChart.yFor(d.peso!);
                const showDot = weightSeries.length <= 45 || idx === hoverIdx || idx === weightSeries.length - 1;
                return (
                  <g key={d.fecha}>
                    {showDot && (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={idx === hoverIdx ? 5.5 : 3.2}
                        fill={idx === hoverIdx ? 'var(--amber)' : 'var(--brand)'}
                      />
                    )}
                    <rect
                      x={cx - Math.max(4, (wChart.W - wChart.padL - wChart.padR) / Math.max(10, weightSeries.length) / 2)}
                      y={wChart.padT}
                      width={Math.max(8, (wChart.W - wChart.padL - wChart.padR) / Math.max(10, weightSeries.length))}
                      height={wChart.H - wChart.padT - wChart.padB}
                      fill="transparent"
                      onMouseEnter={() => setHoverIdx(idx)}
                      onClick={() => setHoverIdx(idx)}
                    />
                  </g>
                );
              })}

              {/* Etiquetas de fecha inicio y fin */}
              <text x={wChart.padL} y={wChart.H - 8} fontSize="11" fill="var(--text-secondary)">
                {formatDateWithYearEs(weightSeries[0].fecha)}
              </text>
              <text
                x={wChart.W - wChart.padR}
                y={wChart.H - 8}
                textAnchor="end"
                fontSize="11"
                fill="var(--text-secondary)"
              >
                {formatDateWithYearEs(weightSeries[weightSeries.length - 1].fecha)}
              </text>
            </svg>
          </div>
        ) : (
          <p className="card-desc">Aún no hay pesajes en esta etapa.</p>
        )}
      </section>

      {/* Gráfico 2: Progresión de Fuerza en Gimnasio */}
      <section className="card" aria-labelledby="chart-gym-heading">
        <div className="card-header">
          <div>
            <h2 id="chart-gym-heading" className="card-title">
              <Dumbbell size={19} style={{ color: 'var(--blue)' }} aria-hidden="true" />
              Progresión de Cargas y 1RM Estimado por Ejercicio
            </h2>
            <p className="card-desc">
              Curva azul: 1RM estimado (Epley) · Curva verde: Peso máximo levantado en la sesión.
            </p>
          </div>

          {exerciseGroups.length > 0 && (
            <div>
              <label className="visually-hidden" htmlFor="select-prog-ex">
                Seleccionar ejercicio para graficar
              </label>
              <select
                id="select-prog-ex"
                name="selectedExercise"
                value={activeExGroup?.key || ''}
                onChange={(e) => setSelectedExKey(e.target.value)}
                style={{ width: 'auto', minInlineSize: '220px' }}
              >
                {exerciseGroups.map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.label} ({g.count} sesiones · Máx {g.maxKg}kg)
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {activeExGroup && exChart ? (
          <>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span className="badge badge-amber tabular">
                <Award size={13} aria-hidden="true" /> Mejor carga: {activeExGroup.maxKg} kg
              </span>
              <span className="badge badge-blue tabular">
                Mejor 1RM est.: {formatNum(activeExGroup.best1RM, 1)} kg
              </span>
              <span className="badge badge-emerald tabular">
                {activeExGroup.count} sesiones registradas
              </span>
            </div>

            <div style={{ width: '100%', overflowX: 'auto' }}>
              <svg
                viewBox={`0 0 ${exChart.W} ${exChart.H}`}
                role="img"
                aria-label={`Progresión de fuerza en ${activeExGroup.label}`}
                style={{ width: '100%', height: 'auto', display: 'block' }}
              >
                {[0, 0.5, 1].map((t) => {
                  const val = exChart.minY + t * (exChart.maxY - exChart.minY);
                  const y = exChart.yFor(val);
                  return (
                    <g key={t}>
                      <line
                        x1={exChart.padL}
                        x2={exChart.W - exChart.padR}
                        y1={y}
                        y2={y}
                        stroke="var(--border-subtle)"
                        strokeDasharray="3 3"
                      />
                      <text
                        x={exChart.padL - 6}
                        y={y + 4}
                        textAnchor="end"
                        fontSize="11"
                        fill="var(--text-secondary)"
                      >
                        {Math.round(val)}kg
                      </text>
                    </g>
                  );
                })}

                <polyline
                  fill="none"
                  stroke="var(--blue)"
                  strokeWidth="2.5"
                  points={exChart.line1RM}
                />
                <polyline
                  fill="none"
                  stroke="var(--brand)"
                  strokeWidth="2.5"
                  points={exChart.lineTopKg}
                />

                {exChart.pts.map((p, i) => (
                  <g key={`${p.fecha}-${i}`}>
                    <circle cx={exChart.xFor(i)} cy={exChart.yFor(p.est1rm)} r={3.5} fill="var(--blue)" />
                    <circle cx={exChart.xFor(i)} cy={exChart.yFor(p.topKg)} r={3.5} fill="var(--brand)" />
                  </g>
                ))}

                <text x={exChart.padL} y={exChart.H - 8} fontSize="11" fill="var(--text-secondary)">
                  {formatShortDateEs(exChart.pts[0].fecha)}
                </text>
                <text
                  x={exChart.W - exChart.padR}
                  y={exChart.H - 8}
                  textAnchor="end"
                  fontSize="11"
                  fill="var(--text-secondary)"
                >
                  {formatShortDateEs(exChart.pts[exChart.pts.length - 1].fecha)}
                </text>
              </svg>
            </div>
          </>
        ) : (
          <p className="card-desc">
            Cargá tus series de gimnasio para ver la curva de progresión, o cambiá el filtro a{' '}
            <strong>Histórico 2021</strong> para explorar tus 654 registros previos.
          </p>
        )}
      </section>

      {/* Tabla Semanal Adaptable (modern-web-guidance: responsive-table) */}
      <section className="card" aria-labelledby="weekly-table-heading">
        <div>
          <h2 id="weekly-table-heading" className="card-title">
            <Flame size={19} style={{ color: 'var(--amber)' }} aria-hidden="true" />
            Cierres Semanales (Peso, Kcal, Déficit g/Sem y Entrenamientos)
          </h2>
          <p className="card-desc">
            Equivalente automático a tu planilla histórica, sin errores por celdas vacías.
          </p>
        </div>

        <div
          tabIndex={0}
          role="region"
          aria-labelledby="weekly-table-caption"
          className="table-wrapper"
        >
          <table
            style={
              {
                '--label-2': '"Prom. Peso"',
                '--label-3': '"Prom. Kcal"',
                '--label-4': '"Déficit g/Sem"',
                '--label-5': '"TDEE Est."',
                '--label-6': '"Actividad"'
              } as React.CSSProperties
            }
          >
            <caption id="weekly-table-caption">
              Resumen semanal ({weeklySummaries.length} semanas en {stageFilter})
            </caption>
            <thead>
              <tr>
                <th scope="col">Semana</th>
                <th scope="col">Prom. Peso</th>
                <th scope="col">Prom. Kcal</th>
                <th scope="col">Déficit g/Sem</th>
                <th scope="col">TDEE Est.</th>
                <th scope="col">Actividad</th>
              </tr>
            </thead>
            <tbody>
              {[...weeklySummaries].reverse().map((w) => (
                <tr key={w.mondayISO}>
                  <th scope="row" className="tabular">
                    {w.label} ({w.mondayISO.slice(0, 4)})
                  </th>
                  <td className="tabular">
                    {w.promPeso !== null ? `${formatNum(w.promPeso, 2)} kg (${w.diasPesados}d)` : '—'}
                  </td>
                  <td className="tabular">
                    {w.promKcal !== null ? `${w.promKcal} kcal` : '—'}
                  </td>
                  <td className="tabular">
                    {w.deficitGramosSem !== null ? (
                      w.deficitGramosSem >= 0 ? (
                        <span style={{ color: 'var(--brand)', fontWeight: 700 }}>
                          -{w.deficitGramosSem} g
                        </span>
                      ) : (
                        <span style={{ color: 'var(--amber)', fontWeight: 700 }}>
                          +{Math.abs(w.deficitGramosSem)} g
                        </span>
                      )
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="tabular">
                    {w.tdeeEstimadoSem ? `${w.tdeeEstimadoSem} kcal` : '—'}
                  </td>
                  <td className="tabular">
                    {w.sesionesGym} Gym · {w.sesionesPadel} Pádel
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
