import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Flame,
  Moon,
  Scale,
  Sun
} from 'lucide-react';
import type { ActividadRow, AppConfig, DiarioRow, GymSeriesRow, NavSection } from '../types';
import {
  addDaysISO,
  formatHumanDateHeaderEs,
  formatShortDateEs,
  plainDateFromISO,
  stageForDate,
  todayISO,
  weekdayShortEs,
  weekDaysISO
} from '../lib/dates';
import {
  computeDailySeries,
  computeSmoothedTDEE,
  computeWeeklySummaries,
  formatNum,
  parseNum,
  suggestNextSession
} from '../lib/metrics';

interface HoyViewProps {
  selectedDate: string;
  onSelectDate: (iso: string) => void;
  diario: DiarioRow[];
  seriesGym: GymSeriesRow[];
  actividadFisica: ActividadRow[];
  config: AppConfig;
  onSaveDiario: (row: DiarioRow) => void;
  onNavigate: (section: NavSection) => void;
}

export const HoyView: React.FC<HoyViewProps> = ({
  selectedDate,
  onSelectDate,
  diario,
  seriesGym,
  actividadFisica,
  config,
  onSaveDiario,
  onNavigate
}) => {
  const today = todayISO();
  const weekDays = useMemo(() => weekDaysISO(selectedDate), [selectedDate]);

  const existingRow = useMemo(
    () => diario.find((r) => r.Fecha === selectedDate),
    [diario, selectedDate]
  );

  const [peso, setPeso] = useState('');
  const [kcal, setKcal] = useState('');
  const [pasos, setPasos] = useState('');
  const [creatina, setCreatina] = useState(false);
  const [proteinas, setProteinas] = useState('');
  const [carbos, setCarbos] = useState('');
  const [grasas, setGrasas] = useState('');
  const [suplementosExtra, setSuplementosExtra] = useState('');
  const [notas, setNotas] = useState('');
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  useEffect(() => {
    setPeso(existingRow?.Peso_Kg ?? '');
    setKcal(existingRow?.Kcal ?? '');
    setPasos(existingRow?.Pasos ?? '');
    setCreatina(existingRow?.Creatina?.toUpperCase() === 'SI');
    setProteinas(existingRow?.Proteinas_g ?? '');
    setCarbos(existingRow?.Carbos_g ?? '');
    setGrasas(existingRow?.Grasas_g ?? '');
    setSuplementosExtra(existingRow?.Suplementos_Extra ?? '');
    setNotas(existingRow?.Notas ?? '');
    setSavedBanner(null);
  }, [selectedDate, existingRow]);

  const activeStage = stageForDate(selectedDate);
  const stageDiario = useMemo(
    () => diario.filter((d) => d.Etapa === activeStage),
    [diario, activeStage]
  );
  const stageGym = useMemo(
    () => seriesGym.filter((g) => g.Etapa === activeStage),
    [seriesGym, activeStage]
  );
  const stageAct = useMemo(
    () => actividadFisica.filter((a) => a.Etapa === activeStage),
    [actividadFisica, activeStage]
  );

  const dailySeries = useMemo(() => computeDailySeries(stageDiario), [stageDiario]);
  const weeklySummaries = useMemo(
    () => computeWeeklySummaries(stageDiario, stageGym, stageAct),
    [stageDiario, stageGym, stageAct]
  );
  const smoothedTdee = useMemo(() => computeSmoothedTDEE(weeklySummaries), [weeklySummaries]);

  const currentWeekMonday = weekDays[0];
  const currentWeekSummary = useMemo(
    () => weeklySummaries.find((w) => w.mondayISO === currentWeekMonday) || null,
    [weeklySummaries, currentWeekMonday]
  );

  const latestMovingAvg = useMemo(() => {
    const upToSelected = dailySeries.filter((d) => d.fecha <= selectedDate && d.mediaMovil7d !== null);
    return upToSelected.length > 0 ? upToSelected[upToSelected.length - 1] : null;
  }, [dailySeries, selectedDate]);

  const yesterdayWeight = useMemo(() => {
    const yIso = addDaysISO(selectedDate, -1);
    const yRow = diario.find((d) => d.Fecha === yIso);
    return parseNum(yRow?.Peso_Kg);
  }, [diario, selectedDate]);

  const nextSession = useMemo(
    () => suggestNextSession(seriesGym, selectedDate),
    [seriesGym, selectedDate]
  );
  const todayGymCount = useMemo(
    () => seriesGym.filter((g) => g.Fecha === selectedDate).length,
    [seriesGym, selectedDate]
  );
  const todayActCount = useMemo(
    () => actividadFisica.filter((a) => a.Fecha === selectedDate).length,
    [actividadFisica, selectedDate]
  );

  const kcalGoal = parseNum(config.kcal_objetivo) ?? 2200;
  const currentKcalNum = parseNum(kcal);
  const kcalDiff = currentKcalNum !== null ? Math.round(currentKcalNum - kcalGoal) : null;

  const calculatedMacroKcal = useMemo(() => {
    const p = parseNum(proteinas) ?? 0;
    const c = parseNum(carbos) ?? 0;
    const g = parseNum(grasas) ?? 0;
    const total = Math.round(p * 4 + c * 4 + g * 9);
    return total > 0 ? total : null;
  }, [proteinas, carbos, grasas]);

  const handleMorningSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveDiario({
      Fecha: selectedDate,
      Etapa: stageForDate(selectedDate),
      Peso_Kg: peso.trim().replace(',', '.'),
      Kcal: existingRow?.Kcal ?? kcal.trim().replace(',', '.'),
      Proteinas_g: existingRow?.Proteinas_g ?? proteinas.trim().replace(',', '.'),
      Carbos_g: existingRow?.Carbos_g ?? carbos.trim().replace(',', '.'),
      Grasas_g: existingRow?.Grasas_g ?? grasas.trim().replace(',', '.'),
      Creatina: existingRow?.Creatina ?? (creatina ? 'SI' : 'NO'),
      Suplementos_Extra: existingRow?.Suplementos_Extra ?? suplementosExtra.trim(),
      Pasos: existingRow?.Pasos ?? pasos.trim(),
      Dolor_Rodilla_0_10: '',
      Notas: existingRow?.Notas ?? notas.trim(),
      Actualizado: new Date().toISOString()
    });
    setSavedBanner('Peso al despertar guardado.');
  };

  const handleEveningSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveDiario({
      Fecha: selectedDate,
      Etapa: stageForDate(selectedDate),
      Peso_Kg: peso.trim().replace(',', '.') || existingRow?.Peso_Kg || '',
      Kcal: kcal.trim().replace(',', '.'),
      Proteinas_g: proteinas.trim().replace(',', '.'),
      Carbos_g: carbos.trim().replace(',', '.'),
      Grasas_g: grasas.trim().replace(',', '.'),
      Creatina: creatina ? 'SI' : 'NO',
      Suplementos_Extra: suplementosExtra.trim(),
      Pasos: pasos.trim(),
      Dolor_Rodilla_0_10: '',
      Notas: notas.trim(),
      Actualizado: new Date().toISOString()
    });
    setSavedBanner('Cierre del día (calorías, pasos y creatina) guardado.');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
      {/* Selector semanal Lun-Dom */}
      <section className="card" aria-label="Selector de fecha y semana">
        <div className="card-header">
          <div>
            <h1 className="card-title" style={{ fontSize: '1.2rem' }}>
              <Calendar size={20} aria-hidden="true" />
              {formatHumanDateHeaderEs(selectedDate)}
              {selectedDate === today && <span className="badge badge-emerald">Hoy</span>}
            </h1>
            <p className="card-desc">
              Semana del {formatShortDateEs(weekDays[0])} al {formatShortDateEs(weekDays[6])} · Tocá cualquier día para cargar o revisar
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => onSelectDate(addDaysISO(selectedDate, -7))}
              aria-label="Semana anterior"
            >
              <ChevronLeft size={16} aria-hidden="true" />
              Sem. ant.
            </button>
            {selectedDate !== today && (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => onSelectDate(today)}
              >
                Ir a Hoy
              </button>
            )}
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => onSelectDate(addDaysISO(selectedDate, 7))}
              aria-label="Semana siguiente"
            >
              Sem. sig.
              <ChevronRight size={16} aria-hidden="true" />
            </button>
            <label className="visually-hidden" htmlFor="hoy-date-picker">
              Elegir fecha exacta
            </label>
            <input
              id="hoy-date-picker"
              name="selectedDate"
              type="date"
              value={selectedDate}
              onChange={(e) => e.target.value && onSelectDate(e.target.value)}
              style={{ width: 'auto', padding: '0.35rem 0.55rem', fontSize: '0.85rem' }}
            />
          </div>
        </div>

        <div className="week-strip" role="group" aria-label="Días de la semana seleccionada">
          {weekDays.map((iso) => {
            const dRow = diario.find((r) => r.Fecha === iso);
            const hasWeight = parseNum(dRow?.Peso_Kg) !== null;
            const hasKcal = parseNum(dRow?.Kcal) !== null;
            const dayGym = seriesGym.filter((g) => g.Fecha === iso);
            const dayAct = actividadFisica.filter((a) => a.Fecha === iso);
            const hasWorkout = dayGym.length > 0 || dayAct.length > 0;
            const dayNum = plainDateFromISO(iso).day;
            const isSelected = iso === selectedDate;
            const shortTag =
              dayGym.length > 0
                ? dayGym[0].Dia_Rutina.replace('Sesión ', 'Gym ')
                : dayAct.length > 0
                ? dayAct[0].Tipo.slice(0, 5)
                : '';

            return (
              <button
                key={iso}
                type="button"
                className="week-day-btn tabular"
                aria-pressed={isSelected}
                onClick={() => onSelectDate(iso)}
              >
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  {weekdayShortEs(iso)}
                </span>
                <span style={{ fontSize: '0.98rem', fontWeight: 750 }}>{dayNum}</span>
                <span className="week-dots" aria-hidden="true">
                  {hasWeight && <span className="dot" style={{ background: 'var(--brand)' }} />}
                  {hasKcal && <span className="dot" style={{ background: 'var(--blue)' }} />}
                  {hasWorkout && <span className="dot" style={{ background: 'var(--amber)' }} />}
                </span>
                {shortTag && (
                  <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--amber)' }}>
                    {shortTag}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => onNavigate('gimnasio')}
          >
            <Dumbbell size={15} aria-hidden="true" />
            {todayGymCount > 0
              ? `Gimnasio hoy (${todayGymCount} ej. cargados)`
              : `Entrenar hoy · Toca ${nextSession}`}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => onNavigate('actividad')}
          >
            <Activity size={15} aria-hidden="true" />
            {todayActCount > 0
              ? `Actividad hoy (${todayActCount} cargada)`
              : 'Cargar Pádel / Cardio'}
          </button>
        </div>
      </section>

      {savedBanner && (
        <div className="alert-banner alert-ok" role="status" aria-live="polite">
          <CheckCircle2 size={18} style={{ color: 'var(--brand)', flex: 'none' }} aria-hidden="true" />
          <span style={{ fontSize: '0.86rem', fontWeight: 650 }}>{savedBanner}</span>
        </div>
      )}

      {/* ARRIBA: Panel 1 (Al despertar) y Panel 2 (Cierre del día) */}
      <div className="grid-2">
        {/* Panel 1: Solo peso al despertar */}
        <form
          className="card"
          method="POST"
          action="#guardar-manana"
          aria-labelledby="form-manana-title"
          onSubmit={handleMorningSubmit}
        >
          <div className="card-header">
            <div>
              <h2 id="form-manana-title" className="card-title">
                <Sun size={20} style={{ color: 'var(--amber)' }} aria-hidden="true" />
                1. Al despertar
              </h2>
              <p className="card-desc">
                En ayunas después de ir al baño ·{' '}
                {yesterdayWeight !== null
                  ? `Ayer: ${formatNum(yesterdayWeight, 2)} kg`
                  : 'Cargá tu peso del día'}
              </p>
            </div>
            {parseNum(existingRow?.Peso_Kg) !== null && (
              <span className="badge badge-emerald">
                <CheckCircle2 size={13} aria-hidden="true" /> Cargado
              </span>
            )}
          </div>

          <div className="field">
            <label htmlFor="input-peso">Peso corporal (kg)</label>
            <input
              id="input-peso"
              name="peso_kg"
              type="text"
              inputMode="decimal"
              enterKeyHint="done"
              placeholder="Ej. 76.15"
              value={peso}
              onChange={(e) => setPeso(e.target.value)}
              aria-describedby="peso-help"
              className="tabular"
              style={{ fontSize: '1.35rem', fontWeight: 750 }}
            />
            <span id="peso-help" className="field-hint">
              Acepta punto o coma decimal (ej. 76.15 o 76,15).
            </span>
          </div>

          <button type="submit" className="btn btn-primary" style={{ marginTop: 'auto' }}>
            <Scale size={17} aria-hidden="true" />
            Guardar peso al despertar
          </button>
        </form>

        {/* Panel 2: Cierre del día (Calorías + Pasos + Creatina + Macros opc.) */}
        <form
          className="card"
          method="POST"
          action="#guardar-noche"
          aria-labelledby="form-noche-title"
          onSubmit={handleEveningSubmit}
        >
          <div className="card-header">
            <div>
              <h2 id="form-noche-title" className="card-title">
                <Moon size={20} style={{ color: 'var(--blue)' }} aria-hidden="true" />
                2. Cierre del día
              </h2>
              <p className="card-desc">
                Antes de acostarte · Meta diaria: {kcalGoal} kcal
              </p>
            </div>
            {(parseNum(existingRow?.Kcal) !== null || parseNum(existingRow?.Pasos) !== null) && (
              <span className="badge badge-blue">
                <CheckCircle2 size={13} aria-hidden="true" /> Cargado
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.75rem' }}>
            <div className="field">
              <label htmlFor="input-kcal">Calorías del día (kcal)</label>
              <input
                id="input-kcal"
                name="kcal"
                type="text"
                inputMode="numeric"
                enterKeyHint="next"
                placeholder={`Ej. ${kcalGoal}`}
                value={kcal}
                onChange={(e) => setKcal(e.target.value)}
                aria-describedby="kcal-help"
                className="tabular"
                style={{ fontSize: '1.2rem', fontWeight: 750 }}
              />
            </div>

            <div className="field">
              <label htmlFor="input-pasos">Pasos del día</label>
              <input
                id="input-pasos"
                name="pasos"
                type="text"
                inputMode="numeric"
                enterKeyHint="done"
                placeholder={`Meta ${config.pasos_objetivo || '8000'}`}
                value={pasos}
                onChange={(e) => setPasos(e.target.value)}
                className="tabular"
                style={{ fontSize: '1.2rem', fontWeight: 700 }}
              />
            </div>
          </div>

          <span id="kcal-help" className="field-hint" style={{ marginTop: '-0.4rem' }}>
            {kcalDiff !== null ? (
              kcalDiff === 0 ? (
                'Clavado en tu objetivo calórico diario.'
              ) : kcalDiff < 0 ? (
                `${Math.abs(kcalDiff)} kcal por debajo de tu meta diaria (${kcalGoal} kcal).`
              ) : (
                `+${kcalDiff} kcal por encima de tu meta diaria (${kcalGoal} kcal).`
              )
            ) : (
              'Ingresá tus calorías totales y los pasos realizados hoy.'
            )}
          </span>

          <div>
            <label className="check-pill" htmlFor="check-creatina">
              <input
                id="check-creatina"
                name="creatina"
                type="checkbox"
                className="brand-check"
                checked={creatina}
                onChange={(e) => setCreatina(e.target.checked)}
              />
              <span>Tomé la creatina hoy (5 g)</span>
            </label>
          </div>

          <details className="card-elevated">
            <summary style={{ cursor: 'pointer', fontWeight: 650, fontSize: '0.86rem' }}>
              Macros opcionales, suplementos extra y notas
            </summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.8rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                <div className="field">
                  <label htmlFor="input-prot">Proteínas (g)</label>
                  <input
                    id="input-prot"
                    name="proteinas_g"
                    type="text"
                    inputMode="decimal"
                    placeholder={config.proteinas_objetivo_g || '160'}
                    value={proteinas}
                    onChange={(e) => setProteinas(e.target.value)}
                    className="tabular"
                  />
                </div>
                <div className="field">
                  <label htmlFor="input-carb">Carbos (g)</label>
                  <input
                    id="input-carb"
                    name="carbos_g"
                    type="text"
                    inputMode="decimal"
                    placeholder={config.carbos_objetivo_g || '230'}
                    value={carbos}
                    onChange={(e) => setCarbos(e.target.value)}
                    className="tabular"
                  />
                </div>
                <div className="field">
                  <label htmlFor="input-gras">Grasas (g)</label>
                  <input
                    id="input-gras"
                    name="grasas_g"
                    type="text"
                    inputMode="decimal"
                    placeholder={config.grasas_objetivo_g || '70'}
                    value={grasas}
                    onChange={(e) => setGrasas(e.target.value)}
                    className="tabular"
                  />
                </div>
              </div>

              {calculatedMacroKcal !== null && (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setKcal(String(calculatedMacroKcal))}
                >
                  Usar {calculatedMacroKcal} kcal calculadas de macros (4P + 4C + 9G)
                </button>
              )}

              <div className="field">
                <label htmlFor="input-supp-extra">Otros suplementos (opcional)</label>
                <input
                  id="input-supp-extra"
                  name="suplementos_extra"
                  type="text"
                  placeholder="Ej. Vitamina D, Magnesio, Cafeína"
                  value={suplementosExtra}
                  onChange={(e) => setSuplementosExtra(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="input-notas-dia">Notas del día</label>
                <textarea
                  id="input-notas-dia"
                  name="notas"
                  rows={2}
                  placeholder="Ej. Cena libre, buen descanso, mucha energía..."
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                />
              </div>
            </div>
          </details>

          <button type="submit" className="btn btn-primary" style={{ marginTop: 'auto' }}>
            <Flame size={17} aria-hidden="true" />
            Guardar cierre del día
          </button>
        </form>
      </div>

      {/* ABAJO: Resumen semanal en vivo (Kg, Media 7d, Prom Kcal y TDEE) */}
      <section aria-label="Métricas semanales en tiempo real" className="grid-stats">
        <div className="stat-tile">
          <span className="stat-label">Prom. Peso Semanal</span>
          <span className="stat-value">
            {currentWeekSummary?.promPeso ? `${formatNum(currentWeekSummary.promPeso, 2)} kg` : '—'}
          </span>
          <span className="stat-meta">
            {currentWeekSummary?.deficitGramosSem !== null &&
            currentWeekSummary?.deficitGramosSem !== undefined ? (
              currentWeekSummary.deficitGramosSem >= 0 ? (
                <span style={{ color: 'var(--brand)', fontWeight: 650 }}>
                  ↓ {currentWeekSummary.deficitGramosSem} g vs sem. ant.
                </span>
              ) : (
                <span style={{ color: 'var(--amber)', fontWeight: 650 }}>
                  ↑ +{Math.abs(currentWeekSummary.deficitGramosSem)} g vs sem. ant.
                </span>
              )
            ) : (
              `${currentWeekSummary?.diasPesados ?? 0}/7 días pesados`
            )}
          </span>
        </div>

        <div className="stat-tile">
          <span className="stat-label">Media Móvil 7 Días</span>
          <span className="stat-value">
            {latestMovingAvg?.mediaMovil7d
              ? `${formatNum(latestMovingAvg.mediaMovil7d, 2)} kg`
              : '—'}
          </span>
          <span className="stat-meta">
            Meta etapa: {config.peso_objetivo_kg || '74.0'} kg
          </span>
        </div>

        <div className="stat-tile">
          <span className="stat-label">Prom. Kcal / Día</span>
          <span className="stat-value">
            {currentWeekSummary?.promKcal ? `${currentWeekSummary.promKcal} kcal` : '—'}
          </span>
          <span className="stat-meta">
            Objetivo: {kcalGoal} kcal ({currentWeekSummary?.diasKcal ?? 0}/7 días)
          </span>
        </div>

        <div className="stat-tile">
          <span className="stat-label">TDEE Real Estimado</span>
          <span className="stat-value">
            {smoothedTdee.tdee ? `${smoothedTdee.tdee} kcal` : 'En calibración'}
          </span>
          <span className="stat-meta">
            {smoothedTdee.tdee
              ? `Base ${smoothedTdee.weeksUsed} sem. (${formatNum(smoothedTdee.avgWeeklyDeltaKg, 2)} kg/sem)`
              : 'Requiere ≥2 semanas seguidas'}
          </span>
        </div>
      </section>
    </div>
  );
};
