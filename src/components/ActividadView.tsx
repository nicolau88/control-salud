import React, { useMemo, useState } from 'react';
import { Activity, Footprints, Plus, Trash2, Zap } from 'lucide-react';
import type { ActividadRow, AppConfig, DiarioRow, GymSeriesRow } from '../types';
import {
  formatDateWithYearEs,
  formatHumanDateHeaderEs,
  formatShortDateEs,
  stageForDate,
  weekdayNameEs,
  weekDaysISO
} from '../lib/dates';
import { formatNum, parseNum } from '../lib/metrics';

interface ActividadViewProps {
  selectedDate: string;
  onSelectDate: (iso: string) => void;
  diario: DiarioRow[];
  seriesGym: GymSeriesRow[];
  actividadFisica: ActividadRow[];
  config: AppConfig;
  onSaveActividad: (row: ActividadRow) => void;
  onDeleteActividad: (id: string) => void;
  onSaveDiario: (row: DiarioRow) => void;
}

const MET_BY_TYPE: Record<string, number> = {
  Pádel: 7.0,
  Caminata: 3.8,
  Running: 9.5,
  Ciclismo: 7.5,
  Fútbol: 8.5,
  Otro: 5.0
};

export const ActividadView: React.FC<ActividadViewProps> = ({
  selectedDate,
  onSelectDate,
  diario,
  seriesGym,
  actividadFisica,
  config,
  onSaveActividad,
  onDeleteActividad,
  onSaveDiario
}) => {
  const [tipo, setTipo] = useState('Pádel');
  const [duracion, setDuracion] = useState('90');
  const [rpe, setRpe] = useState('7');
  const [distancia, setDistancia] = useState('');
  const [kcalEst, setKcalEst] = useState('');
  const [notas, setNotas] = useState('');

  const todayDiario = useMemo(
    () => diario.find((d) => d.Fecha === selectedDate),
    [diario, selectedDate]
  );
  const [quickSteps, setQuickSteps] = useState(todayDiario?.Pasos ?? '');

  React.useEffect(() => {
    setQuickSteps(todayDiario?.Pasos ?? '');
  }, [todayDiario, selectedDate]);

  const latestWeight = useMemo(() => {
    const sorted = [...diario]
      .filter((d) => parseNum(d.Peso_Kg) !== null)
      .sort((a, b) => b.Fecha.localeCompare(a.Fecha));
    return sorted.length > 0 ? parseNum(sorted[0].Peso_Kg) ?? 76 : 76;
  }, [diario]);

  const autoEstimatedKcal = useMemo(() => {
    const mins = parseNum(duracion);
    if (!mins || mins <= 0) return null;
    const met = MET_BY_TYPE[tipo] ?? 5.5;
    return Math.round(((met * 3.5 * latestWeight) / 200) * mins);
  }, [tipo, duracion, latestWeight]);

  const sessionLoadSRPE = useMemo(() => {
    const mins = parseNum(duracion);
    const r = parseNum(rpe);
    if (mins && r) return Math.round(mins * r);
    return null;
  }, [duracion, rpe]);

  const weekDays = useMemo(() => weekDaysISO(selectedDate), [selectedDate]);
  const stepsGoal = parseNum(config.pasos_objetivo) ?? 8000;
  const currentStepsNum = parseNum(quickSteps) ?? 0;

  const handleActivitySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const mins = parseNum(duracion);
    if (!mins || mins <= 0) return;

    onSaveActividad({
      ID: `act-${selectedDate}-${Date.now().toString(36)}`,
      Fecha: selectedDate,
      Etapa: stageForDate(selectedDate),
      Tipo: tipo,
      Duracion_Min: duracion.trim(),
      RPE_1_10: rpe.trim(),
      Distancia_Km: distancia.trim().replace(',', '.'),
      Kcal_Est: kcalEst.trim() || (autoEstimatedKcal ? String(autoEstimatedKcal) : ''),
      Dolor_Rodilla_0_10: '',
      Dolor_24h_0_10: '',
      Notas: notas.trim()
    });

    setDistancia('');
    setKcalEst('');
    setNotas('');
  };

  const handleStepsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveDiario({
      Fecha: selectedDate,
      Etapa: todayDiario?.Etapa || stageForDate(selectedDate),
      Peso_Kg: todayDiario?.Peso_Kg ?? '',
      Kcal: todayDiario?.Kcal ?? '',
      Proteinas_g: todayDiario?.Proteinas_g ?? '',
      Carbos_g: todayDiario?.Carbos_g ?? '',
      Grasas_g: todayDiario?.Grasas_g ?? '',
      Creatina: todayDiario?.Creatina ?? 'SI',
      Suplementos_Extra: todayDiario?.Suplementos_Extra ?? '',
      Pasos: quickSteps.trim(),
      Dolor_Rodilla_0_10: '',
      Notas: todayDiario?.Notas ?? '',
      Actualizado: new Date().toISOString()
    });
  };

  const recentActivities = useMemo(
    () => [...actividadFisica].sort((a, b) => b.Fecha.localeCompare(a.Fecha)).slice(0, 20),
    [actividadFisica]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
      <div className="grid-2">
        {/* Formulario Pádel / Cardio / Deporte */}
        <form
          className="card"
          method="POST"
          action="#guardar-actividad"
          aria-labelledby="act-form-heading"
          onSubmit={handleActivitySubmit}
        >
          <div className="card-header">
            <div>
              <h1 id="act-form-heading" className="card-title" style={{ fontSize: '1.15rem' }}>
                <Activity size={20} aria-hidden="true" />
                Registrar Pádel o Actividad Física
              </h1>
              <p className="card-desc">{formatHumanDateHeaderEs(selectedDate)}</p>
            </div>
            <div>
              <label className="visually-hidden" htmlFor="act-date-picker">
                Fecha de la actividad
              </label>
              <input
                id="act-date-picker"
                name="fecha"
                type="date"
                value={selectedDate}
                onChange={(e) => e.target.value && onSelectDate(e.target.value)}
                style={{ width: 'auto', padding: '0.35rem 0.55rem', fontSize: '0.85rem' }}
              />
            </div>
          </div>

          <fieldset className="radio-group">
            <legend>Tipo de actividad</legend>
            {['Pádel', 'Caminata', 'Running', 'Ciclismo', 'Fútbol', 'Otro'].map((opt) => (
              <label key={opt} className="check-pill" htmlFor={`tipo-${opt}`}>
                <input
                  id={`tipo-${opt}`}
                  type="radio"
                  name="tipo_actividad"
                  value={opt}
                  checked={tipo === opt}
                  onChange={() => setTipo(opt)}
                />
                <span>{opt}</span>
              </label>
            ))}
          </fieldset>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="field">
              <label htmlFor="act-duracion">Duración (minutos)</label>
              <input
                id="act-duracion"
                name="duracion_min"
                type="text"
                inputMode="numeric"
                required
                placeholder="Ej. 90"
                value={duracion}
                onChange={(e) => setDuracion(e.target.value)}
                className="tabular"
              />
            </div>

            <div className="field">
              <label htmlFor="act-rpe">Intensidad RPE (1–10)</label>
              <input
                id="act-rpe"
                name="rpe"
                type="text"
                inputMode="decimal"
                placeholder="Ej. 7"
                value={rpe}
                onChange={(e) => setRpe(e.target.value)}
                className="tabular"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="field">
              <label htmlFor="act-kcal">Gasto estimado (kcal)</label>
              <input
                id="act-kcal"
                name="kcal_est"
                type="text"
                inputMode="numeric"
                placeholder={autoEstimatedKcal ? `Auto: ~${autoEstimatedKcal} kcal` : 'Opcional'}
                value={kcalEst}
                onChange={(e) => setKcalEst(e.target.value)}
                className="tabular"
              />
            </div>

            <div className="field">
              <label htmlFor="act-dist">Distancia km (opcional)</label>
              <input
                id="act-dist"
                name="distancia_km"
                type="text"
                inputMode="decimal"
                placeholder="Ej. 5.2"
                value={distancia}
                onChange={(e) => setDistancia(e.target.value)}
                className="tabular"
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="act-notas">Notas (partido, ritmo, sensaciones)</label>
            <input
              id="act-notas"
              name="notas"
              type="text"
              placeholder="Ej. Partido de 3 sets, muy buen ritmo..."
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
          </div>

          {sessionLoadSRPE !== null && (
            <div className="field-hint tabular">
              <Zap size={13} style={{ verticalAlign: '-2px' }} aria-hidden="true" /> Carga de sesión sRPE:{' '}
              <strong>{sessionLoadSRPE} UA</strong> · Gasto MET est. ({formatNum(latestWeight, 1)} kg):{' '}
              <strong>~{autoEstimatedKcal ?? 0} kcal</strong>
            </div>
          )}

          <button type="submit" className="btn btn-primary" style={{ marginTop: 'auto' }}>
            <Plus size={16} aria-hidden="true" />
            Guardar actividad
          </button>
        </form>

        {/* Columna derecha: Pasos diarios + Semana real */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <form
            className="card"
            method="POST"
            action="#guardar-pasos"
            aria-labelledby="steps-form-heading"
            onSubmit={handleStepsSubmit}
          >
            <div className="card-header">
              <div>
                <h2 id="steps-form-heading" className="card-title">
                  <Footprints size={20} style={{ color: 'var(--brand)' }} aria-hidden="true" />
                  NEAT · Pasos Diarios
                </h2>
                <p className="card-desc">
                  Movimiento diario fuera del entrenamiento ({formatShortDateEs(selectedDate)})
                </p>
              </div>
              <span className="badge badge-emerald tabular">
                {currentStepsNum} / {stepsGoal}
              </span>
            </div>

            <progress
              max={stepsGoal}
              value={Math.min(stepsGoal, currentStepsNum)}
              style={{ width: '100%', height: '0.65rem' }}
              aria-label="Progreso hacia meta diaria de pasos"
            />

            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-end' }}>
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="steps-only-input">Pasos acumulados</label>
                <input
                  id="steps-only-input"
                  name="pasos"
                  type="text"
                  inputMode="numeric"
                  placeholder={`Ej. ${stepsGoal}`}
                  value={quickSteps}
                  onChange={(e) => setQuickSteps(e.target.value)}
                  className="tabular"
                />
              </div>
              <button type="submit" className="btn btn-primary">
                Guardar pasos
              </button>
            </div>
          </form>

          {/* Resumen semanal real (Lun-Dom) */}
          <section className="card" aria-labelledby="weekly-load-map">
            <div>
              <h2 id="weekly-load-map" className="card-title">
                Semana Real de Actividad (Lun – Dom)
              </h2>
              <p className="card-desc">
                Refleja exactamente los días en que entrenaste en el gimnasio o hiciste deporte esta semana.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {weekDays.map((iso) => {
                const gymExs = seriesGym.filter((g) => g.Fecha === iso);
                const acts = actividadFisica.filter((a) => a.Fecha === iso);
                const dRow = diario.find((d) => d.Fecha === iso);
                const daySteps = parseNum(dRow?.Pasos);
                return (
                  <div
                    key={iso}
                    className="card-elevated"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.55rem 0.75rem',
                      flexWrap: 'wrap'
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectDate(iso)}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        color: 'inherit',
                        font: 'inherit',
                        fontWeight: 700,
                        cursor: 'pointer',
                        minBlockSize: 'auto',
                        minInlineSize: 'auto'
                      }}
                    >
                      {weekdayNameEs(iso)} {formatShortDateEs(iso)}
                    </button>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      {gymExs.length > 0 && (
                        <span className="badge badge-blue">
                          {gymExs[0].Dia_Rutina} ({gymExs.length} ej.)
                        </span>
                      )}
                      {acts.map((a) => (
                        <span key={a.ID} className="badge badge-amber">
                          {a.Tipo} {a.Duracion_Min}m
                        </span>
                      ))}
                      {daySteps !== null && (
                        <span className="badge badge-emerald tabular">{daySteps} pasos</span>
                      )}
                      {gymExs.length === 0 && acts.length === 0 && daySteps === null && (
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          Descanso
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      {/* Historial de sesiones de actividad física */}
      {recentActivities.length > 0 && (
        <section className="card" aria-labelledby="act-history-heading">
          <h2 id="act-history-heading" className="card-title">
            Actividades registradas ({actividadFisica.length})
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {recentActivities.map((act) => (
              <div
                key={act.ID}
                className="card-elevated"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.75rem',
                  flexWrap: 'wrap'
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>
                    {act.Tipo} · {formatDateWithYearEs(act.Fecha)} ({act.Duracion_Min} min)
                  </div>
                  <div className="tabular" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    RPE {act.RPE_1_10 || '—'}
                    {act.Kcal_Est ? ` · ~${act.Kcal_Est} kcal` : ''}
                    {act.Distancia_Km ? ` · ${act.Distancia_Km} km` : ''}
                    {act.Notas ? ` — ${act.Notas}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  onClick={() => onDeleteActividad(act.ID)}
                  aria-label={`Eliminar actividad ${act.Tipo} del ${act.Fecha}`}
                >
                  <Trash2 size={14} aria-hidden="true" />
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
