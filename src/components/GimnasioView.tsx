import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Award,
  CheckCircle2,
  Copy,
  Dumbbell,
  Edit3,
  History,
  Plus,
  RefreshCw,
  Timer,
  Trash2,
  X
} from 'lucide-react';
import type { AppConfig, DiarioRow, GymSeriesRow, RutinaPlanRow } from '../types';
import {
  addDaysISO,
  formatDateWithYearEs,
  formatHumanDateHeaderEs,
  formatShortDateEs,
  stageForDate,
  todayISO,
  weekdayShortEs,
  weekDaysISO,
  weekMondayISO
} from '../lib/dates';
import {
  computeGymTotals,
  computeWeeklyPatternVolume,
  extractSets,
  findLastExerciseLogs,
  formatNum,
  parseNum,
  suggestNextSession
} from '../lib/metrics';

type SessionKey = 'Sesión A' | 'Sesión B' | 'Sesión C' | 'Libre';

const PATTERN_OPTIONS = [
  'Empuje tren inferior',
  'Traccion tren inferior',
  'Empuje tren superior',
  'Traccion tren superior',
  'Aislados brazo',
  'Core / Abdominales'
];

interface GimnasioViewProps {
  selectedDate: string;
  onSelectDate: (iso: string) => void;
  diario: DiarioRow[];
  seriesGym: GymSeriesRow[];
  rutinaPlan: RutinaPlanRow[];
  config: AppConfig;
  onSaveGymRow: (row: GymSeriesRow) => void;
  onDeleteGymRow: (id: string) => void;
  onSaveRutinaRow: (row: RutinaPlanRow) => void;
  onDeleteRutinaRow: (id: string) => void;
  onSaveConfig: (partial: Partial<AppConfig>) => void;
  onStartTimer: (seconds: number, label: string) => void;
}

interface ExerciseCardEditorProps {
  planItem: RutinaPlanRow;
  isFirst: boolean;
  isLast: boolean;
  selectedDate: string;
  existingTodayRow: GymSeriesRow | undefined;
  allGymRows: GymSeriesRow[];
  knownExerciseNames: string[];
  latestBodyWeight: number | null;
  onSaveGym: (row: GymSeriesRow) => void;
  onSaveRutina: (row: RutinaPlanRow) => void;
  onDeleteRutina: (id: string) => void;
  onMoveOrder: (direction: 'up' | 'down') => void;
  onStartTimer: (seconds: number, label: string) => void;
}

const ExerciseCardEditor: React.FC<ExerciseCardEditorProps> = ({
  planItem,
  isFirst,
  isLast,
  selectedDate,
  existingTodayRow,
  allGymRows,
  knownExerciseNames,
  latestBodyWeight,
  onSaveGym,
  onSaveRutina,
  onDeleteRutina,
  onMoveOrder,
  onStartTimer
}) => {
  const isIso = planItem.Es_Isometrico?.toUpperCase() === 'SI';
  const isBw = planItem.Es_Peso_Corporal?.toUpperCase() === 'SI';

  // Optional "override exercise name ONLY for today" (machine occupied / temporary swap)
  const [swapTodayMode, setSwapTodayMode] = useState(false);
  const [todayOverrideName, setTodayOverrideName] = useState('');

  // Inline permanent routine editor state
  const [editingPlan, setEditingPlan] = useState(false);
  const [editName, setEditName] = useState(planItem.Ejercicio);
  const [editPattern, setEditPattern] = useState(planItem.Patron_Movimiento);
  const [editSeriesObj, setEditSeriesObj] = useState(planItem.Series_Obj);
  const [editRepsObj, setEditRepsObj] = useState(planItem.Reps_Obj);
  const [editRestSec, setEditRestSec] = useState(planItem.Descanso_Seg || '120');
  const [editRpeObj, setEditRpeObj] = useState(planItem.RPE_Obj);
  const [editNotes, setEditNotes] = useState(planItem.Notas_Tecnicas);

  useEffect(() => {
    setEditName(planItem.Ejercicio);
    setEditPattern(planItem.Patron_Movimiento);
    setEditSeriesObj(planItem.Series_Obj);
    setEditRepsObj(planItem.Reps_Obj);
    setEditRestSec(planItem.Descanso_Seg || '120');
    setEditRpeObj(planItem.RPE_Obj);
    setEditNotes(planItem.Notas_Tecnicas);
  }, [planItem]);

  const effectiveExerciseName =
    swapTodayMode && todayOverrideName.trim() ? todayOverrideName.trim() : planItem.Ejercicio;

  const defaultSeriesCount = useMemo(() => {
    const nums = planItem.Series_Obj.match(/\d+/g);
    const parsed = nums ? Number(nums[nums.length - 1]) : 3;
    return Math.min(6, Math.max(2, parsed));
  }, [planItem.Series_Obj]);

  const { latestCurrent, latestHistorical, best1RMAllTime } = useMemo(() => {
    const otherRows = allGymRows.filter((r) => r.ID !== existingTodayRow?.ID);
    return findLastExerciseLogs(effectiveExerciseName, otherRows);
  }, [effectiveExerciseName, allGymRows, existingTodayRow?.ID]);

  const referenceRow = latestCurrent || latestHistorical;
  const referenceSets = useMemo(
    () => (referenceRow ? extractSets(referenceRow) : []),
    [referenceRow]
  );

  const [sets, setSets] = useState<{ reps: string; kg: string }[]>(() =>
    Array.from({ length: 6 }, () => ({ reps: '', kg: '' }))
  );
  const [visibleSets, setVisibleSets] = useState(defaultSeriesCount);
  const [rpeReal, setRpeReal] = useState('');
  const [notas, setNotas] = useState('');
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (existingTodayRow) {
      const loaded = [
        { reps: existingTodayRow.Serie_1_Reps, kg: existingTodayRow.Serie_1_Kg },
        { reps: existingTodayRow.Serie_2_Reps, kg: existingTodayRow.Serie_2_Kg },
        { reps: existingTodayRow.Serie_3_Reps, kg: existingTodayRow.Serie_3_Kg },
        { reps: existingTodayRow.Serie_4_Reps, kg: existingTodayRow.Serie_4_Kg },
        { reps: existingTodayRow.Serie_5_Reps, kg: existingTodayRow.Serie_5_Kg },
        { reps: existingTodayRow.Serie_6_Reps, kg: existingTodayRow.Serie_6_Kg }
      ];
      setSets(loaded);
      const activeCount = loaded.reduce(
        (acc, s, idx) => (s.reps || s.kg ? idx + 1 : acc),
        defaultSeriesCount
      );
      setVisibleSets(Math.max(defaultSeriesCount, activeCount));
      setRpeReal(existingTodayRow.RPE_Real ?? '');
      setNotas(existingTodayRow.Notas ?? '');
    } else {
      const initialBw = isBw && !isIso && latestBodyWeight ? String(latestBodyWeight) : '';
      setSets(
        Array.from({ length: 6 }, (_, i) => ({
          reps: '',
          kg: i < defaultSeriesCount ? initialBw : ''
        }))
      );
      setVisibleSets(defaultSeriesCount);
      setRpeReal('');
      setNotas('');
    }
    setJustSaved(false);
  }, [existingTodayRow, selectedDate, defaultSeriesCount, isBw, isIso, latestBodyWeight]);

  const totals = useMemo(() => computeGymTotals(sets.slice(0, visibleSets)), [sets, visibleSets]);
  const isNewPR = totals.best1RM > 0 && best1RMAllTime > 0 && totals.best1RM > best1RMAllTime;
  const restSec = parseNum(planItem.Descanso_Seg) ?? 90;

  const copyFromPrevious = () => {
    if (!referenceSets.length) return;
    const next = Array.from({ length: 6 }, (_, idx) => {
      const ref = referenceSets[idx];
      if (!ref) return { reps: '', kg: '' };
      return { reps: String(ref.reps), kg: ref.kg > 0 ? String(ref.kg) : '' };
    });
    setSets(next);
    setVisibleSets(Math.max(defaultSeriesCount, referenceSets.length));
  };

  const handleSavePermanentPlan = () => {
    if (!editName.trim()) return;
    onSaveRutina({
      ...planItem,
      Ejercicio: editName.trim(),
      Patron_Movimiento: editPattern,
      Es_Isometrico: editRepsObj.toLowerCase().includes('seg') ? 'SI' : 'NO',
      Es_Peso_Corporal: editName.toLowerCase().includes('dominada') ? 'SI' : 'NO',
      Series_Obj: editSeriesObj.trim() || '3',
      Reps_Obj: editRepsObj.trim() || '8 - 10',
      Descanso_Seg: editRestSec.trim() || '120',
      RPE_Obj: editRpeObj.trim() || 'RPE 8',
      Notas_Tecnicas: editNotes.trim()
    });
    setEditingPlan(false);
  };

  const handleSaveSeries = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSets = sets.map((s, idx) =>
      idx < visibleSets
        ? { reps: s.reps.trim().replace(',', '.'), kg: s.kg.trim().replace(',', '.') }
        : { reps: '', kg: '' }
    );
    const calc = computeGymTotals(cleanSets);
    if (calc.totalSeries === 0) return;

    const id =
      existingTodayRow?.ID ||
      `gym-${selectedDate}-${planItem.ID}-${Math.random().toString(36).slice(2, 6)}`;

    onSaveGym({
      ID: id,
      Fecha: selectedDate,
      Etapa: stageForDate(selectedDate),
      Dia_Rutina: planItem.Dia,
      Ejercicio: effectiveExerciseName,
      Patron_Movimiento: planItem.Patron_Movimiento,
      Es_Peso_Corporal: effectiveExerciseName.toLowerCase().includes('dominada') ? 'SI' : 'NO',
      Serie_1_Reps: cleanSets[0].reps,
      Serie_1_Kg: cleanSets[0].kg,
      Serie_2_Reps: cleanSets[1].reps,
      Serie_2_Kg: cleanSets[1].kg,
      Serie_3_Reps: cleanSets[2].reps,
      Serie_3_Kg: cleanSets[2].kg,
      Serie_4_Reps: cleanSets[3].reps,
      Serie_4_Kg: cleanSets[3].kg,
      Serie_5_Reps: cleanSets[4].reps,
      Serie_5_Kg: cleanSets[4].kg,
      Serie_6_Reps: cleanSets[5].reps,
      Serie_6_Kg: cleanSets[5].kg,
      RPE_Real: rpeReal.trim(),
      Dolor_Rodilla_0_10: '',
      Total_Series: String(calc.totalSeries),
      Total_Reps: String(calc.totalReps),
      Tonelaje_Kg: String(calc.tonelaje),
      Mejor_1RM_Est: String(calc.best1RM),
      Notas: notas.trim()
    });
    setJustSaved(true);
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
            <span className="badge badge-blue">{planItem.Patron_Movimiento}</span>
            <span className="badge badge-emerald">
              {planItem.Series_Obj} × {planItem.Reps_Obj}
            </span>
            {planItem.RPE_Obj && <span className="badge badge-amber">{planItem.RPE_Obj}</span>}
            {existingTodayRow && <span className="badge badge-emerald">✓ Cargado hoy</span>}
            {isNewPR && (
              <span className="badge badge-amber">
                <Award size={13} aria-hidden="true" /> ¡Nuevo PR 1RM!
              </span>
            )}
          </div>
          <h3 className="card-title" style={{ fontSize: '1.08rem' }}>
            {planItem.Orden}. {effectiveExerciseName}
            {swapTodayMode && todayOverrideName.trim() && (
              <span className="badge badge-amber" style={{ marginLeft: 6 }}>
                Variante solo por hoy
              </span>
            )}
          </h3>
        </div>

        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => {
              setSwapTodayMode((v) => !v);
              setEditingPlan(false);
            }}
            title="Usar otra máquina solo hoy sin cambiar tu rutina fija"
          >
            <RefreshCw size={13} aria-hidden="true" />
            Solo hoy
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => {
              setEditingPlan((v) => !v);
              setSwapTodayMode(false);
            }}
          >
            <Edit3 size={13} aria-hidden="true" />
            Editar ejercicio
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => onStartTimer(restSec, `Descanso · ${effectiveExerciseName}`)}
          >
            <Timer size={14} aria-hidden="true" />
            {Math.floor(restSec / 60)}:{String(restSec % 60).padStart(2, '0')}
          </button>
        </div>
      </div>

      {/* Modo 1: Cambiar variante/máquina solo por hoy */}
      {swapTodayMode && (
        <div className="card-elevated" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: '0.84rem' }}>
              Sustituir máquina/variante únicamente en la sesión del {formatShortDateEs(selectedDate)}
            </strong>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => {
                setTodayOverrideName('');
                setSwapTodayMode(false);
              }}
            >
              <X size={14} aria-hidden="true" /> Cancelar
            </button>
          </div>
          <div className="field">
            <label htmlFor={`swap-${planItem.ID}`}>Ejercicio realizado hoy</label>
            <input
              id={`swap-${planItem.ID}`}
              type="text"
              list="known-exercises-datalist"
              placeholder={`Reemplazo temporal de ${planItem.Ejercicio}...`}
              value={todayOverrideName}
              onChange={(e) => setTodayOverrideName(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Modo 2: Editar permanentemente en la rutina fija (nombre, series, orden o eliminar) */}
      {editingPlan && (
        <div className="card-elevated" style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
            <strong style={{ fontSize: '0.88rem' }}>
              Editar ejercicio en tu rutina fija ({planItem.Dia})
            </strong>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <button
                type="button"
                className="btn btn-sm"
                disabled={isFirst}
                onClick={() => onMoveOrder('up')}
                aria-label="Subir ejercicio de orden"
              >
                <ArrowUp size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={isLast}
                onClick={() => onMoveOrder('down')}
                aria-label="Bajar ejercicio de orden"
              >
                <ArrowDown size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={() => onDeleteRutina(planItem.ID)}
              >
                <Trash2 size={14} aria-hidden="true" />
                Quitar del plan
              </button>
            </div>
          </div>

          <div className="grid-2">
            <div className="field">
              <label htmlFor={`edit-name-${planItem.ID}`}>Nombre del ejercicio / máquina</label>
              <input
                id={`edit-name-${planItem.ID}`}
                type="text"
                list="known-exercises-datalist"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor={`edit-pat-${planItem.ID}`}>Patrón de movimiento</label>
              <select
                id={`edit-pat-${planItem.ID}`}
                value={editPattern}
                onChange={(e) => setEditPattern(e.target.value)}
              >
                {PATTERN_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.5rem' }}>
            <div className="field">
              <label htmlFor={`edit-ser-${planItem.ID}`}>Series obj.</label>
              <input
                id={`edit-ser-${planItem.ID}`}
                type="text"
                value={editSeriesObj}
                onChange={(e) => setEditSeriesObj(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor={`edit-rep-${planItem.ID}`}>Reps obj.</label>
              <input
                id={`edit-rep-${planItem.ID}`}
                type="text"
                value={editRepsObj}
                onChange={(e) => setEditRepsObj(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor={`edit-rest-${planItem.ID}`}>Descanso (seg)</label>
              <input
                id={`edit-rest-${planItem.ID}`}
                type="text"
                inputMode="numeric"
                value={editRestSec}
                onChange={(e) => setEditRestSec(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor={`edit-rpe-${planItem.ID}`}>RPE / RIR</label>
              <input
                id={`edit-rpe-${planItem.ID}`}
                type="text"
                value={editRpeObj}
                onChange={(e) => setEditRpeObj(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor={`edit-notes-${planItem.ID}`}>Nota técnica (opcional)</label>
            <input
              id={`edit-notes-${planItem.ID}`}
              type="text"
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-sm" onClick={() => setEditingPlan(false)}>
              Cancelar
            </button>
            <button type="button" className="btn btn-sm btn-primary" onClick={handleSavePermanentPlan}>
              Guardar en mi rutina fija
            </button>
          </div>
        </div>
      )}

      {planItem.Notas_Tecnicas && !editingPlan && (
        <p className="card-desc" style={{ margin: 0 }}>
          {planItem.Notas_Tecnicas}
        </p>
      )}

      {/* Referencia de última sesión */}
      {referenceRow && referenceSets.length > 0 && (
        <div
          className="card-elevated"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.6rem',
            flexWrap: 'wrap',
            padding: '0.6rem 0.8rem'
          }}
        >
          <div style={{ fontSize: '0.81rem' }}>
            <History size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} aria-hidden="true" />
            <strong>
              Última vez ({formatDateWithYearEs(referenceRow.Fecha)}
              {referenceRow.Etapa === '2021-Historico' ? ' · 2021' : ''}):
            </strong>{' '}
            <span className="tabular">
              {referenceSets.map((s) => `${s.reps}×${s.kg}kg`).join(' · ')}
            </span>
            {best1RMAllTime > 0 && (
              <span style={{ color: 'var(--text-secondary)' }}>
                {' '}
                (Mejor 1RM: {formatNum(best1RMAllTime, 1)} kg)
              </span>
            )}
          </div>
          <button type="button" className="btn btn-sm" onClick={copyFromPrevious}>
            <Copy size={13} aria-hidden="true" />
            Copiar pesos
          </button>
        </div>
      )}

      {/* Formulario de series */}
      <form
        method="POST"
        action="#guardar-series"
        onSubmit={handleSaveSeries}
        style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          <div
            className="series-grid"
            style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-secondary)' }}
          >
            <span>#</span>
            <span>{isIso ? 'Segundos' : 'Repeticiones'}</span>
            <span>{isBw ? 'Peso corp. + lastre (kg)' : 'Carga (kg)'}</span>
            <span>Timer</span>
          </div>

          {Array.from({ length: visibleSets }).map((_, idx) => {
            const repId = `rep-${planItem.ID}-${idx}`;
            const kgId = `kg-${planItem.ID}-${idx}`;
            return (
              <div key={idx} className="series-grid">
                <span className="series-num tabular">{idx + 1}</span>
                <div>
                  <label className="visually-hidden" htmlFor={repId}>
                    Serie {idx + 1} {isIso ? 'segundos' : 'repeticiones'} de {effectiveExerciseName}
                  </label>
                  <input
                    id={repId}
                    name={`s${idx + 1}_reps`}
                    type="text"
                    inputMode="numeric"
                    placeholder={isIso ? '60' : '8'}
                    value={sets[idx]?.reps ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSets((prev) =>
                        prev.map((it, i) => (i === idx ? { ...it, reps: val } : it))
                      );
                    }}
                    className="tabular"
                  />
                </div>
                <div>
                  <label className="visually-hidden" htmlFor={kgId}>
                    Serie {idx + 1} peso en kg de {effectiveExerciseName}
                  </label>
                  <input
                    id={kgId}
                    name={`s${idx + 1}_kg`}
                    type="text"
                    inputMode="decimal"
                    placeholder={isIso ? '0 (opc.)' : 'Kg'}
                    value={sets[idx]?.kg ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSets((prev) =>
                        prev.map((it, i) => (i === idx ? { ...it, kg: val } : it))
                      );
                    }}
                    className="tabular"
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => onStartTimer(restSec, `S${idx + 1} lista · ${effectiveExerciseName}`)}
                  aria-label={`Iniciar descanso tras serie ${idx + 1} de ${effectiveExerciseName}`}
                >
                  <Timer size={14} aria-hidden="true" />
                </button>
              </div>
            );
          })}

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {visibleSets < 6 && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  const prevKg = sets[visibleSets - 1]?.kg || '';
                  setSets((prev) =>
                    prev.map((it, i) => (i === visibleSets && !it.kg ? { ...it, kg: prevKg } : it))
                  );
                  setVisibleSets((v) => Math.min(6, v + 1));
                }}
              >
                <Plus size={14} aria-hidden="true" />
                Agregar serie ({visibleSets}/6)
              </button>
            )}
            {totals.totalSeries > 0 && (
              <span className="tabular" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {totals.totalSeries} series · {totals.totalReps} {isIso ? 'seg' : 'repes'}
                {totals.tonelaje > 0 && ` · Tonelaje: ${totals.tonelaje} kg`}
                {totals.best1RM > 0 && ` · 1RM est.: ${totals.best1RM} kg`}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '9rem 1fr', gap: '0.6rem' }}>
          <div className="field">
            <label htmlFor={`rpe-${planItem.ID}`}>RPE real (opc.)</label>
            <input
              id={`rpe-${planItem.ID}`}
              name="rpe_real"
              type="text"
              inputMode="decimal"
              placeholder="Ej. 8"
              value={rpeReal}
              onChange={(e) => setRpeReal(e.target.value)}
              className="tabular"
            />
          </div>
          <div className="field">
            <label htmlFor={`note-${planItem.ID}`}>Notas (opcional)</label>
            <input
              id={`note-${planItem.ID}`}
              name="notas"
              type="text"
              placeholder="Ej. Subir +2.5kg la próxima vez, ajuste de asiento..."
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem' }}>
          <button type="submit" className="btn btn-primary" disabled={totals.totalSeries === 0}>
            <CheckCircle2 size={16} aria-hidden="true" />
            {existingTodayRow ? 'Actualizar series' : 'Guardar ejercicio'}
          </button>
          {justSaved && (
            <span style={{ fontSize: '0.8rem', color: 'var(--brand)', fontWeight: 650 }} role="status">
              ✓ Guardado
            </span>
          )}
        </div>
      </form>
    </div>
  );
};

export const GimnasioView: React.FC<GimnasioViewProps> = ({
  selectedDate,
  onSelectDate,
  diario,
  seriesGym,
  rutinaPlan,
  config,
  onSaveGymRow,
  onDeleteGymRow,
  onSaveRutinaRow,
  onDeleteRutinaRow,
  onSaveConfig,
  onStartTimer
}) => {
  const suggestedSession = useMemo(
    () => suggestNextSession(seriesGym, selectedDate),
    [seriesGym, selectedDate]
  );

  const [activeSession, setActiveSession] = useState<SessionKey>(suggestedSession);
  const [editingSessionTitle, setEditingSessionTitle] = useState(false);
  const [sessionTitleDraft, setSessionTitleDraft] = useState('');

  useEffect(() => {
    setActiveSession(suggestNextSession(seriesGym, selectedDate));
  }, [selectedDate, seriesGym]);

  const sessionLabels: Record<'Sesión A' | 'Sesión B' | 'Sesión C', string> = {
    'Sesión A': config.sesion_a_nombre || 'Día 1 · Fuerza Base',
    'Sesión B': config.sesion_b_nombre || 'Día 2 · Tracción & Empuje',
    'Sesión C': config.sesion_c_nombre || 'Día 3 · Unilateral & Accesorios'
  };

  const weekDays = useMemo(() => weekDaysISO(selectedDate), [selectedDate]);
  const trainedDaysThisWeek = useMemo(() => {
    return weekDays
      .map((iso) => {
        const rows = seriesGym.filter((g) => g.Fecha === iso);
        if (rows.length === 0) return null;
        return {
          iso,
          dayShort: weekdayShortEs(iso),
          dateShort: formatShortDateEs(iso),
          session: rows[0].Dia_Rutina,
          count: rows.length
        };
      })
      .filter(Boolean) as {
      iso: string;
      dayShort: string;
      dateShort: string;
      session: string;
      count: number;
    }[];
  }, [weekDays, seriesGym]);

  const latestBodyWeight = useMemo(() => {
    const sorted = [...diario]
      .filter((d) => d.Fecha <= selectedDate && parseNum(d.Peso_Kg) !== null)
      .sort((a, b) => b.Fecha.localeCompare(a.Fecha));
    return sorted.length > 0 ? parseNum(sorted[0].Peso_Kg) : null;
  }, [diario, selectedDate]);

  const sessionPlanExercises = useMemo(
    () =>
      rutinaPlan
        .filter((r) => r.Dia === activeSession)
        .sort((a, b) => (parseNum(a.Orden) ?? 0) - (parseNum(b.Orden) ?? 0)),
    [rutinaPlan, activeSession]
  );

  const todayLogs = useMemo(
    () => seriesGym.filter((g) => g.Fecha === selectedDate),
    [seriesGym, selectedDate]
  );

  const knownExerciseNames = useMemo(() => {
    const names = new Set<string>();
    rutinaPlan.forEach((r) => names.add(r.Ejercicio));
    seriesGym.forEach((g) => names.add(g.Ejercicio));
    return Array.from(names).sort();
  }, [rutinaPlan, seriesGym]);

  // Add new exercise to active session form
  const [addingToRoutine, setAddingToRoutine] = useState(false);
  const [newExName, setNewExName] = useState('');
  const [newExPattern, setNewExPattern] = useState('Empuje tren superior');
  const [newExSeries, setNewExSeries] = useState('3');
  const [newExReps, setNewExReps] = useState('8 - 12');
  const [newExRest, setNewExRest] = useState('120');

  // Free exercise form
  const [freeName, setFreeName] = useState('');
  const [freePattern, setFreePattern] = useState('Empuje tren superior');
  const [freeSets, setFreeSets] = useState([
    { reps: '', kg: '' },
    { reps: '', kg: '' },
    { reps: '', kg: '' },
    { reps: '', kg: '' }
  ]);
  const [freeNotes, setFreeNotes] = useState('');

  const weekMon = weekMondayISO(selectedDate);
  const weeklyVolume = useMemo(
    () => computeWeeklyPatternVolume(seriesGym, weekMon),
    [seriesGym, weekMon]
  );

  const handleReorder = (idx: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= sessionPlanExercises.length) return;
    const current = sessionPlanExercises[idx];
    const neighbor = sessionPlanExercises[targetIdx];
    onSaveRutinaRow({ ...current, Orden: String(targetIdx + 1) });
    onSaveRutinaRow({ ...neighbor, Orden: String(idx + 1) });
  };

  const handleAddExerciseToPlan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExName.trim() || activeSession === 'Libre') return;
    onSaveRutinaRow({
      ID: `plan-${Date.now().toString(36)}`,
      Dia: activeSession,
      Orden: String(sessionPlanExercises.length + 1),
      Ejercicio: newExName.trim(),
      Patron_Movimiento: newExPattern,
      Es_Isometrico: newExReps.toLowerCase().includes('seg') ? 'SI' : 'NO',
      Es_Peso_Corporal: newExName.toLowerCase().includes('dominada') ? 'SI' : 'NO',
      Series_Obj: newExSeries.trim() || '3',
      Reps_Obj: newExReps.trim() || '8 - 12',
      Descanso_Seg: newExRest.trim() || '120',
      RPE_Obj: 'RPE 8 (2 RIR)',
      Notas_Tecnicas: ''
    });
    setNewExName('');
    setAddingToRoutine(false);
  };

  const handleSaveSessionTitle = () => {
    if (activeSession === 'Libre' || !sessionTitleDraft.trim()) return;
    const cfgKey =
      activeSession === 'Sesión A'
        ? 'sesion_a_nombre'
        : activeSession === 'Sesión B'
        ? 'sesion_b_nombre'
        : 'sesion_c_nombre';
    onSaveConfig({ [cfgKey]: sessionTitleDraft.trim() });
    setEditingSessionTitle(false);
  };

  const handleFreeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!freeName.trim()) return;
    const calc = computeGymTotals(freeSets);
    if (calc.totalSeries === 0) return;

    const padded = Array.from({ length: 6 }, (_, i) => ({
      reps: freeSets[i]?.reps?.trim().replace(',', '.') || '',
      kg: freeSets[i]?.kg?.trim().replace(',', '.') || ''
    }));

    onSaveGymRow({
      ID: `gym-free-${selectedDate}-${Date.now().toString(36)}`,
      Fecha: selectedDate,
      Etapa: stageForDate(selectedDate),
      Dia_Rutina: 'Libre',
      Ejercicio: freeName.trim(),
      Patron_Movimiento: freePattern,
      Es_Peso_Corporal: freeName.toLowerCase().includes('dominada') ? 'SI' : 'NO',
      Serie_1_Reps: padded[0].reps,
      Serie_1_Kg: padded[0].kg,
      Serie_2_Reps: padded[1].reps,
      Serie_2_Kg: padded[1].kg,
      Serie_3_Reps: padded[2].reps,
      Serie_3_Kg: padded[2].kg,
      Serie_4_Reps: padded[3].reps,
      Serie_4_Kg: padded[3].kg,
      Serie_5_Reps: padded[4].reps,
      Serie_5_Kg: padded[4].kg,
      Serie_6_Reps: padded[5].reps,
      Serie_6_Kg: padded[5].kg,
      RPE_Real: '8',
      Dolor_Rodilla_0_10: '',
      Total_Series: String(calc.totalSeries),
      Total_Reps: String(calc.totalReps),
      Tonelaje_Kg: String(calc.tonelaje),
      Mejor_1RM_Est: String(calc.best1RM),
      Notas: freeNotes.trim()
    });

    setFreeName('');
    setFreeSets([
      { reps: '', kg: '' },
      { reps: '', kg: '' },
      { reps: '', kg: '' },
      { reps: '', kg: '' }
    ]);
    setFreeNotes('');
  };

  const today = todayISO();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
      <datalist id="known-exercises-datalist">
        {knownExerciseNames.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      {/* Cabecera flexible: Fecha real en que fuiste + Sesión A/B/C */}
      <section className="card">
        <div className="card-header">
          <div>
            <h1 className="card-title" style={{ fontSize: '1.2rem' }}>
              <Dumbbell size={20} aria-hidden="true" />
              Gimnasio · {formatHumanDateHeaderEs(selectedDate)}
            </h1>
            <p className="card-desc">
              Elegí el día real en que entrenaste y qué sesión hiciste (los días pueden variar cada semana).
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => onSelectDate(addDaysISO(today, -1))}
            >
              Ayer
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => onSelectDate(today)}
            >
              Hoy
            </button>
            <label className="visually-hidden" htmlFor="gym-date-input">
              Fecha real del entrenamiento
            </label>
            <input
              id="gym-date-input"
              name="gymDate"
              type="date"
              value={selectedDate}
              onChange={(e) => e.target.value && onSelectDate(e.target.value)}
              style={{ width: 'auto', padding: '0.35rem 0.6rem', fontSize: '0.86rem' }}
            />
          </div>
        </div>

        {/* Tira rápida Lun-Dom para cambiar el día real en que fuiste esta semana */}
        <div className="week-strip" role="group" aria-label="Elegir día real de entrenamiento en la semana">
          {weekDays.map((iso) => {
            const logs = seriesGym.filter((g) => g.Fecha === iso);
            const isSel = iso === selectedDate;
            return (
              <button
                key={iso}
                type="button"
                className="week-day-btn tabular"
                aria-pressed={isSel}
                onClick={() => onSelectDate(iso)}
              >
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  {weekdayShortEs(iso)}
                </span>
                <span style={{ fontSize: '0.94rem', fontWeight: 750 }}>
                  {formatShortDateEs(iso).split(' ')[0]}
                </span>
                <span style={{ fontSize: '0.65rem', color: logs.length ? 'var(--brand)' : 'var(--text-secondary)' }}>
                  {logs.length ? logs[0].Dia_Rutina.replace('Sesión ', 'Ses. ') : '—'}
                </span>
              </button>
            );
          })}
        </div>

        {trainedDaysThisWeek.length > 0 && (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <strong>Días entrenados esta semana:</strong>{' '}
            {trainedDaysThisWeek
              .map((d) => `${d.dayShort} ${d.dateShort} (${d.session})`)
              .join(' · ')}
          </div>
        )}

        {/* Selector de Sesión A / B / C / Libre */}
        <fieldset className="radio-group">
          <legend>Sesión a realizar el {formatShortDateEs(selectedDate)}</legend>
          {(['Sesión A', 'Sesión B', 'Sesión C', 'Libre'] as const).map((tab) => (
            <label key={tab} className="check-pill" htmlFor={`tab-gym-${tab}`}>
              <input
                id={`tab-gym-${tab}`}
                type="radio"
                name="routine_session_tab"
                value={tab}
                checked={activeSession === tab}
                onChange={() => {
                  setActiveSession(tab);
                  setEditingSessionTitle(false);
                }}
              />
              <span>
                {tab === 'Libre' ? '+ Ejercicio Libre' : `${tab} (${sessionLabels[tab]})`}
                {tab === suggestedSession && (
                  <strong style={{ color: 'var(--brand)', marginLeft: 5 }}>· Sugerida</strong>
                )}
              </span>
            </label>
          ))}
        </fieldset>

        {activeSession !== 'Libre' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
            {!editingSessionTitle ? (
              <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                <strong>{activeSession}:</strong> {sessionLabels[activeSession]}
                {latestBodyWeight ? ` · Peso corp. ref.: ${formatNum(latestBodyWeight, 2)} kg` : ''}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flex: 1 }}>
                <label className="visually-hidden" htmlFor="edit-ses-title">
                  Nombre de {activeSession}
                </label>
                <input
                  id="edit-ses-title"
                  type="text"
                  value={sessionTitleDraft}
                  onChange={(e) => setSessionTitleDraft(e.target.value)}
                  placeholder="Ej. Día 1 · Pecho, Espalda y Cuádriceps"
                />
                <button type="button" className="btn btn-sm btn-primary" onClick={handleSaveSessionTitle}>
                  Guardar
                </button>
                <button type="button" className="btn btn-sm" onClick={() => setEditingSessionTitle(false)}>
                  Cancelar
                </button>
              </div>
            )}

            {!editingSessionTitle && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  setSessionTitleDraft(sessionLabels[activeSession]);
                  setEditingSessionTitle(true);
                }}
              >
                <Edit3 size={13} aria-hidden="true" />
                Renombrar {activeSession}
              </button>
            )}
          </div>
        )}
      </section>

      {/* Ejercicios de la sesión activa */}
      {activeSession !== 'Libre' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.95rem' }}>
          {sessionPlanExercises.map((item, idx) => {
            const existing = todayLogs.find(
              (l) =>
                l.Ejercicio.toLowerCase() === item.Ejercicio.toLowerCase() ||
                l.ID.includes(`-${item.ID}-`)
            );
            return (
              <ExerciseCardEditor
                key={item.ID}
                planItem={item}
                isFirst={idx === 0}
                isLast={idx === sessionPlanExercises.length - 1}
                selectedDate={selectedDate}
                existingTodayRow={existing}
                allGymRows={seriesGym}
                knownExerciseNames={knownExerciseNames}
                latestBodyWeight={latestBodyWeight}
                onSaveGym={onSaveGymRow}
                onSaveRutina={onSaveRutinaRow}
                onDeleteRutina={onDeleteRutinaRow}
                onMoveOrder={(dir) => handleReorder(idx, dir)}
                onStartTimer={onStartTimer}
              />
            );
          })}

          {/* Botón para sumar un ejercicio o máquina nueva a esta sesión */}
          {!addingToRoutine ? (
            <button
              type="button"
              className="btn"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => setAddingToRoutine(true)}
            >
              <Plus size={16} aria-hidden="true" />
              Agregar nuevo ejercicio o máquina a {activeSession}
            </button>
          ) : (
            <form
              className="card"
              method="POST"
              action="#nuevo-ejercicio-rutina"
              onSubmit={handleAddExerciseToPlan}
            >
              <h2 className="card-title">Agregar ejercicio fijo a {activeSession}</h2>
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="new-plan-ex-name">Nombre del ejercicio / máquina</label>
                  <input
                    id="new-plan-ex-name"
                    type="text"
                    list="known-exercises-datalist"
                    required
                    placeholder="Ej. Prensa Hack, Remo Hammer..."
                    value={newExName}
                    onChange={(e) => setNewExName(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="new-plan-ex-pat">Patrón de movimiento</label>
                  <select
                    id="new-plan-ex-pat"
                    value={newExPattern}
                    onChange={(e) => setNewExPattern(e.target.value)}
                  >
                    {PATTERN_OPTIONS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
                <div className="field">
                  <label htmlFor="new-plan-ser">Series objetivo</label>
                  <input
                    id="new-plan-ser"
                    type="text"
                    value={newExSeries}
                    onChange={(e) => setNewExSeries(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="new-plan-rep">Reps objetivo</label>
                  <input
                    id="new-plan-rep"
                    type="text"
                    value={newExReps}
                    onChange={(e) => setNewExReps(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="new-plan-rest">Descanso (seg)</label>
                  <input
                    id="new-plan-rest"
                    type="text"
                    inputMode="numeric"
                    value={newExRest}
                    onChange={(e) => setNewExRest(e.target.value)}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn" onClick={() => setAddingToRoutine(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Guardar en {activeSession}
                </button>
              </div>
            </form>
          )}
        </div>
      ) : (
        <form className="card" method="POST" action="#ejercicio-libre" onSubmit={handleFreeSubmit}>
          <h2 className="card-title">Cargar ejercicio suelto o extra</h2>
          <p className="card-desc">
            Para registrar un ejercicio puntual en el día seleccionado sin modificar tu plantilla fija.
          </p>

          <div className="grid-2">
            <div className="field">
              <label htmlFor="free-ex-name">Ejercicio</label>
              <input
                id="free-ex-name"
                name="ejercicio"
                list="known-exercises-datalist"
                required
                placeholder="Ej. Dominadas, Prensa 45°, Remo Pendlay..."
                value={freeName}
                onChange={(e) => setFreeName(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="free-ex-pattern">Patrón de movimiento</label>
              <select
                id="free-ex-pattern"
                name="patron"
                value={freePattern}
                onChange={(e) => setFreePattern(e.target.value)}
              >
                {PATTERN_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            {freeSets.map((s, idx) => (
              <div
                key={idx}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2.2rem 1fr 1fr',
                  gap: '0.5rem',
                  alignItems: 'center'
                }}
              >
                <span className="series-num tabular">{idx + 1}</span>
                <div>
                  <label className="visually-hidden" htmlFor={`free-rep-${idx}`}>
                    Serie {idx + 1} repeticiones
                  </label>
                  <input
                    id={`free-rep-${idx}`}
                    name={`free_rep_${idx}`}
                    type="text"
                    inputMode="numeric"
                    placeholder="Repes"
                    value={s.reps}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFreeSets((prev) =>
                        prev.map((it, i) => (i === idx ? { ...it, reps: val } : it))
                      );
                    }}
                    className="tabular"
                  />
                </div>
                <div>
                  <label className="visually-hidden" htmlFor={`free-kg-${idx}`}>
                    Serie {idx + 1} kg
                  </label>
                  <input
                    id={`free-kg-${idx}`}
                    name={`free_kg_${idx}`}
                    type="text"
                    inputMode="decimal"
                    placeholder="Kg"
                    value={s.kg}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFreeSets((prev) =>
                        prev.map((it, i) => (i === idx ? { ...it, kg: val } : it))
                      );
                    }}
                    className="tabular"
                  />
                </div>
              </div>
            ))}
            {freeSets.length < 6 && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                style={{ alignSelf: 'flex-start' }}
                onClick={() => setFreeSets((p) => [...p, { reps: '', kg: '' }])}
              >
                <Plus size={14} aria-hidden="true" /> Agregar serie
              </button>
            )}
          </div>

          <div className="field">
            <label htmlFor="free-notes">Notas</label>
            <input
              id="free-notes"
              name="notas"
              type="text"
              placeholder="Sensaciones o configuración de máquina"
              value={freeNotes}
              onChange={(e) => setFreeNotes(e.target.value)}
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
            Guardar ejercicio libre
          </button>
        </form>
      )}

      {/* Ejercicios cargados en la fecha seleccionada */}
      {todayLogs.length > 0 && (
        <section className="card" aria-labelledby="today-gym-logs-heading">
          <h2 id="today-gym-logs-heading" className="card-title">
            Ejercicios registrados el {formatDateWithYearEs(selectedDate)} ({todayLogs.length})
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {todayLogs.map((log) => {
              const sets = extractSets(log);
              return (
                <div
                  key={log.ID}
                  className="card-elevated"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    flexWrap: 'wrap'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>
                      {log.Ejercicio}{' '}
                      <span className="badge badge-blue" style={{ marginLeft: 4 }}>
                        {log.Dia_Rutina}
                      </span>
                    </div>
                    <div className="tabular" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      {sets.map((s) => `${s.reps}×${s.kg}kg`).join(' · ')} — Tonelaje: {log.Tonelaje_Kg} kg
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => onDeleteGymRow(log.ID)}
                    aria-label={`Eliminar registro de ${log.Ejercicio}`}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    Quitar
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Volumen semanal por patrón de movimiento */}
      <section className="card" aria-labelledby="vol-semanal-heading">
        <div>
          <h2 id="vol-semanal-heading" className="card-title">
            Volumen Semanal Efectivo por Patrón
          </h2>
          <p className="card-desc">
            Suma automática de todas las series que cargues entre lunes y domingo, sin importar qué días vayas.
          </p>
        </div>

        <div className="grid-2">
          {weeklyVolume.map((pv) => {
            const pct = Math.min(100, Math.round((pv.seriesEfectivas / pv.targetMax) * 100));
            const inSweetSpot =
              pv.seriesEfectivas >= pv.targetMin && pv.seriesEfectivas <= pv.targetMax;
            return (
              <div
                key={pv.patron}
                className="card-elevated"
                style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.85rem',
                    fontWeight: 700
                  }}
                >
                  <span>{pv.patron}</span>
                  <span
                    className="tabular"
                    style={{ color: inSweetSpot ? 'var(--brand)' : 'var(--text-secondary)' }}
                  >
                    {pv.seriesEfectivas} / {pv.targetMin}–{pv.targetMax} series
                  </span>
                </div>
                <progress
                  max={100}
                  value={pct}
                  style={{ width: '100%', height: '0.55rem' }}
                  aria-label={`Progreso de ${pv.patron}`}
                >
                  {pct}%
                </progress>
                <span className="tabular" style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                  Tonelaje acumulado en la semana: {pv.tonelajeTotal} kg
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
