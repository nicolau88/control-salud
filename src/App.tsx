import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  CheckCircle2,
  CloudOff,
  Download,
  Dumbbell,
  ExternalLink,
  Home,
  Lock,
  Pause,
  Play,
  RefreshCw,
  Settings,
  X
} from 'lucide-react';
import type {
  ActividadRow,
  AppConfig,
  AppSnapshot,
  DiarioRow,
  GymSeriesRow,
  NavSection,
  RutinaPlanRow,
  SyncMutation,
  SyncSettings,
  SyncState
} from './types';
import { todayISO } from './lib/dates';
import {
  applyMutationLocally,
  isDeviceUnlocked,
  loadInitialSnapshot,
  loadPendingQueue,
  loadSyncSettings,
  savePendingQueue,
  saveSnapshotCache,
  saveSyncSettings,
  setDeviceUnlocked,
  syncWithGoogleSheets
} from './lib/sheetsSync';
import { HoyView } from './components/HoyView';
import { GimnasioView } from './components/GimnasioView';
import { ActividadView } from './components/ActividadView';
import { ProgresoView } from './components/ProgresoView';
import { SettingsModal } from './components/SettingsModal';

function playTimerChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes = [659.25, 880, 1046.5];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.14, ctx.currentTime + i * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.14 + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.14);
      osc.stop(ctx.currentTime + i * 0.14 + 0.26);
    });
  } catch {
    // ignore audio errors
  }
}

export const App: React.FC = () => {
  const [unlocked, setUnlocked] = useState<boolean>(() => isDeviceUnlocked());
  const [pinInput, setPinInput] = useState('');
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const [activeNav, setActiveNav] = useState<NavSection>('hoy');
  const [selectedDate, setSelectedDate] = useState<string>(() => todayISO());
  const [snapshot, setSnapshot] = useState<AppSnapshot>(() => loadInitialSnapshot());
  const [syncSettings, setSyncSettings] = useState<SyncSettings>(() => loadSyncSettings());
  const [pendingQueue, setPendingQueue] = useState<SyncMutation[]>(() => loadPendingQueue());
  const [syncState, setSyncState] = useState<SyncState>(() => ({
    status: 'synced',
    mode: 'apps-script',
    pendingCount: loadPendingQueue().length,
    lastSyncedAt: loadInitialSnapshot().syncedAt
  }));
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [installPromptEvent, setInstallPromptEvent] = useState<any>(null);

  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerLabel, setTimerLabel] = useState('');

  const syncingRef = useRef(false);
  const queueRef = useRef(pendingQueue);
  queueRef.current = pendingQueue;
  const settingsRef = useRef(syncSettings);
  settingsRef.current = syncSettings;

  const triggerSync = useCallback(
    async (customQueue?: SyncMutation[], customSettings?: SyncSettings) => {
      if (syncingRef.current) return;
      const s = customSettings ?? settingsRef.current;
      if (!s.pin) return;

      syncingRef.current = true;
      const q = customQueue ?? queueRef.current;

      setSyncState((prev) => ({ ...prev, status: 'syncing', pendingCount: q.length }));

      const result = await syncWithGoogleSheets(s, q);
      if (result.ok && result.snapshot) {
        savePendingQueue([]);
        setPendingQueue([]);
        saveSnapshotCache(result.snapshot);
        setSnapshot(result.snapshot);
        setSyncState({
          status: 'synced',
          mode: result.mode,
          pendingCount: 0,
          lastSyncedAt: result.snapshot.syncedAt
        });
      } else if (result.authError) {
        setDeviceUnlocked(false);
        setUnlocked(false);
        setUnlockError('El PIN guardado ya no es válido. Volvé a ingresarlo.');
      } else {
        setSyncState((prev) => ({
          status: q.length > 0 ? 'offline-queued' : 'synced',
          mode: result.mode,
          pendingCount: q.length,
          lastSyncedAt: prev.lastSyncedAt,
          lastError: result.error
        }));
      }
      syncingRef.current = false;
    },
    []
  );

  useEffect(() => {
    if (!unlocked) return;
    triggerSync();
    const onOnline = () => triggerSync();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [unlocked, triggerSync]);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPromptEvent(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'color-scheme') {
        const meta = document.querySelector('meta[name="color-scheme"]');
        if (meta) meta.setAttribute('content', e.newValue ?? 'light dark');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (!timerRunning || timerSeconds === null) return;
    if (timerSeconds <= 0) {
      setTimerRunning(false);
      playTimerChime();
      return;
    }
    const id = window.setTimeout(() => {
      setTimerSeconds((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => window.clearTimeout(id);
  }, [timerRunning, timerSeconds]);

  const handleUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = pinInput.trim();
    if (!trimmed || unlockLoading) return;
    setUnlockLoading(true);
    setUnlockError(null);

    const candidateSettings: SyncSettings = {
      ...syncSettings,
      pin: trimmed
    };

    const res = await syncWithGoogleSheets(candidateSettings, []);
    setUnlockLoading(false);

    if (res.ok && res.snapshot) {
      saveSyncSettings(candidateSettings);
      setSyncSettings(candidateSettings);
      saveSnapshotCache(res.snapshot);
      setSnapshot(res.snapshot);
      setDeviceUnlocked(true);
      setUnlocked(true);
      setPinInput('');
      setSyncState({
        status: 'synced',
        mode: res.mode,
        pendingCount: 0,
        lastSyncedAt: res.snapshot.syncedAt
      });
    } else {
      setUnlockError(
        res.authError
          ? 'PIN incorrecto. Verificá tu código personal.'
          : res.error || 'No se pudo conectar con Google Sheets. Verificá tu conexión.'
      );
    }
  };

  const handleLockDevice = useCallback(() => {
    setDeviceUnlocked(false);
    setUnlocked(false);
    setSettingsOpen(false);
    setPendingQueue([]);
    setSnapshot(loadInitialSnapshot());
  }, []);

  const enqueueMutation = useCallback(
    (mutation: SyncMutation) => {
      setSnapshot((prev) => {
        const updated = applyMutationLocally(prev, mutation);
        saveSnapshotCache(updated);
        return updated;
      });
      const nextQueue = [...queueRef.current, mutation];
      setPendingQueue(nextQueue);
      savePendingQueue(nextQueue);
      triggerSync(nextQueue);
    },
    [triggerSync]
  );

  const handleSaveDiario = useCallback(
    (row: DiarioRow) => enqueueMutation({ type: 'upsertDiario', payload: row }),
    [enqueueMutation]
  );

  const handleSaveGym = useCallback(
    (row: GymSeriesRow) => enqueueMutation({ type: 'upsertGym', payload: row }),
    [enqueueMutation]
  );

  const handleDeleteGym = useCallback(
    (id: string) => enqueueMutation({ type: 'deleteGym', id }),
    [enqueueMutation]
  );

  const handleSaveRutina = useCallback(
    (row: RutinaPlanRow) => enqueueMutation({ type: 'upsertRutina', payload: row }),
    [enqueueMutation]
  );

  const handleDeleteRutina = useCallback(
    (id: string) => enqueueMutation({ type: 'deleteRutina', id }),
    [enqueueMutation]
  );

  const handleSaveActividad = useCallback(
    (row: ActividadRow) => enqueueMutation({ type: 'upsertActividad', payload: row }),
    [enqueueMutation]
  );

  const handleDeleteActividad = useCallback(
    (id: string) => enqueueMutation({ type: 'deleteActividad', id }),
    [enqueueMutation]
  );

  const handleSaveConfig = useCallback(
    (partial: Partial<AppConfig>) => enqueueMutation({ type: 'upsertConfig', payload: partial }),
    [enqueueMutation]
  );

  const handleSaveSyncSettings = useCallback(
    (next: SyncSettings) => {
      setSyncSettings(next);
      saveSyncSettings(next);
      triggerSync(queueRef.current, next);
    },
    [triggerSync]
  );

  const startTimer = useCallback((seconds: number, label: string) => {
    setTimerSeconds(seconds);
    setTimerLabel(label);
    setTimerRunning(true);
  }, []);

  if (!unlocked) {
    return (
      <div
        style={{
          minBlockSize: '100dvh',
          display: 'grid',
          placeItems: 'center',
          padding: '1.25rem'
        }}
      >
        <form
          className="card"
          method="POST"
          action="#desbloquear"
          aria-labelledby="unlock-heading"
          onSubmit={handleUnlockSubmit}
          style={{ width: '100%', maxInlineSize: '400px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="brand-badge" aria-hidden="true">
              <Lock size={20} />
            </div>
            <div>
              <h1 id="unlock-heading" style={{ fontSize: '1.2rem', fontWeight: 800 }}>
                Control Salud
              </h1>
              <p className="card-desc">Acceso privado sincronizado con Google Sheets</p>
            </div>
          </div>

          <div className="field">
            <label htmlFor="pin-unlock-input">Ingresá tu PIN personal</label>
            <input
              id="pin-unlock-input"
              name="pin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              enterKeyHint="done"
              required
              autoFocus
              placeholder="••••"
              value={pinInput}
              onChange={(e) => {
                setPinInput(e.target.value);
                if (unlockError) setUnlockError(null);
              }}
              aria-invalid={unlockError ? 'true' : undefined}
              aria-describedby="pin-unlock-hint"
              className="tabular"
              style={{ fontSize: '1.35rem', letterSpacing: '0.2em', textAlign: 'center' }}
            />
            <span id="pin-unlock-hint" className="field-hint">
              Se guarda automáticamente en este dispositivo para que no tengas que volver a escribirlo.
            </span>
          </div>

          {unlockError && (
            <div className="alert-banner alert-high" role="alert" style={{ padding: '0.65rem 0.8rem' }}>
              <span style={{ fontSize: '0.84rem', fontWeight: 650 }}>{unlockError}</span>
            </div>
          )}

          <button type="submit" className="btn btn-primary" disabled={unlockLoading}>
            {unlockLoading ? 'Verificando y descargando datos...' : 'Entrar'}
          </button>

          {installPromptEvent && (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={async () => {
                installPromptEvent.prompt();
                await installPromptEvent.userChoice;
                setInstallPromptEvent(null);
              }}
            >
              <Download size={14} aria-hidden="true" />
              Instalar App en este dispositivo
            </button>
          )}
        </form>
      </div>
    );
  }

  const navItems: { id: NavSection; label: string; icon: React.ReactNode }[] = [
    { id: 'hoy', label: 'Hoy', icon: <Home size={19} aria-hidden="true" /> },
    { id: 'gimnasio', label: 'Gimnasio', icon: <Dumbbell size={19} aria-hidden="true" /> },
    { id: 'actividad', label: 'Pádel / Cardio', icon: <Activity size={19} aria-hidden="true" /> },
    { id: 'progreso', label: 'Evolución', icon: <BarChart3 size={19} aria-hidden="true" /> }
  ];

  return (
    <div className="app-shell">
      <header className="top-header">
        <div className="top-header-inner">
          <div className="brand-lockup">
            <div className="brand-badge" aria-hidden="true">
              <Dumbbell size={20} />
            </div>
            <div>
              <div className="brand-title">Control Salud</div>
              <div className="brand-subtitle">Peso · Calorías · Gimnasio · Actividad</div>
            </div>
          </div>

          <nav className="desktop-nav" aria-label="Secciones principales">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className="nav-btn"
                aria-current={activeNav === item.id ? 'page' : undefined}
                onClick={() => setActiveNav(item.id)}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="header-actions">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => triggerSync()}
              title="Sincronizar con Google Sheets"
            >
              {syncState.status === 'syncing' ? (
                <RefreshCw size={14} aria-hidden="true" />
              ) : syncState.pendingCount > 0 ? (
                <CloudOff size={14} style={{ color: 'var(--amber)' }} aria-hidden="true" />
              ) : (
                <CheckCircle2 size={14} style={{ color: 'var(--brand)' }} aria-hidden="true" />
              )}
              <span>
                {syncState.status === 'syncing'
                  ? 'Sincronizando...'
                  : syncState.pendingCount > 0
                  ? `En cola (${syncState.pendingCount})`
                  : 'Sheets al día'}
              </span>
            </button>

            {snapshot.spreadsheetUrl && (
              <a
                href={snapshot.spreadsheetUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-sm btn-ghost"
              >
                <ExternalLink size={14} aria-hidden="true" />
                Sheets
              </a>
            )}

            {installPromptEvent && (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={async () => {
                  installPromptEvent.prompt();
                  await installPromptEvent.userChoice;
                  setInstallPromptEvent(null);
                }}
              >
                <Download size={14} aria-hidden="true" />
                Instalar App
              </button>
            )}

            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setSettingsOpen(true)}
              aria-label="Abrir ajustes"
            >
              <Settings size={15} aria-hidden="true" />
              Ajustes
            </button>
          </div>
        </div>
      </header>

      <main className="main-container">
        {activeNav === 'hoy' && (
          <HoyView
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            diario={snapshot.diario}
            seriesGym={snapshot.seriesGym}
            actividadFisica={snapshot.actividadFisica}
            config={snapshot.config}
            onSaveDiario={handleSaveDiario}
            onNavigate={setActiveNav}
          />
        )}

        {activeNav === 'gimnasio' && (
          <GimnasioView
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            diario={snapshot.diario}
            seriesGym={snapshot.seriesGym}
            rutinaPlan={snapshot.rutinaPlan}
            config={snapshot.config}
            onSaveGymRow={handleSaveGym}
            onDeleteGymRow={handleDeleteGym}
            onSaveRutinaRow={handleSaveRutina}
            onDeleteRutinaRow={handleDeleteRutina}
            onSaveConfig={handleSaveConfig}
            onStartTimer={startTimer}
          />
        )}

        {activeNav === 'actividad' && (
          <ActividadView
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            diario={snapshot.diario}
            seriesGym={snapshot.seriesGym}
            actividadFisica={snapshot.actividadFisica}
            config={snapshot.config}
            onSaveActividad={handleSaveActividad}
            onDeleteActividad={handleDeleteActividad}
            onSaveDiario={handleSaveDiario}
          />
        )}

        {activeNav === 'progreso' && (
          <ProgresoView
            diario={snapshot.diario}
            seriesGym={snapshot.seriesGym}
            actividadFisica={snapshot.actividadFisica}
            config={snapshot.config}
          />
        )}
      </main>

      {timerSeconds !== null && (
        <aside
          className="timer-dock"
          role="timer"
          aria-live="off"
          aria-label="Temporizador de entrenamiento"
        >
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 650 }}>
              {timerLabel}
            </div>
            <div className="tabular" style={{ fontSize: '1.35rem', fontWeight: 850 }}>
              {timerSeconds === 0
                ? '¡Listo!'
                : `${Math.floor(timerSeconds / 60)}:${String(timerSeconds % 60).padStart(2, '0')}`}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setTimerRunning((r) => !r)}
            aria-label={timerRunning ? 'Pausar temporizador' : 'Reanudar temporizador'}
          >
            {timerRunning ? (
              <Pause size={15} aria-hidden="true" />
            ) : (
              <Play size={15} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setTimerSeconds((s) => (s !== null ? s + 30 : 30))}
          >
            +30s
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setTimerRunning(false);
              setTimerSeconds(null);
            }}
            aria-label="Cerrar temporizador"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </aside>
      )}

      <nav className="bottom-nav" aria-label="Navegación móvil">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className="nav-btn"
            aria-current={activeNav === item.id ? 'page' : undefined}
            onClick={() => setActiveNav(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        config={snapshot.config}
        syncSettings={syncSettings}
        syncState={syncState}
        spreadsheetUrl={snapshot.spreadsheetUrl}
        onSaveConfig={handleSaveConfig}
        onSaveSyncSettings={handleSaveSyncSettings}
        onManualSync={() => triggerSync()}
        onLockDevice={handleLockDevice}
      />
    </div>
  );
};
