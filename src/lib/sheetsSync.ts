import seedJson from '../data/initialSeed.json';
import appsScriptSource from '../../google-apps-script/Code.gs?raw';
import type { AppSnapshot, SyncMutation, SyncSettings } from '../types';

const SNAPSHOT_KEY = 'cs_snapshot_v3';
const QUEUE_KEY = 'cs_sync_queue_v3';
const SETTINGS_KEY = 'cs_sync_settings_v3';
const UNLOCKED_KEY = 'cs_unlocked_v3';

export const DEFAULT_SPREADSHEET_ID = '';
export const DEFAULT_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbzrO75A-oCorJ-h8W7dDxr8zUETpV-4AqpgTb8-VDwcZ_CWq3Rirf2m-3KnvS2Aab-DLA/exec';
export const APPS_SCRIPT_CODE = appsScriptSource;

export function isDeviceUnlocked(): boolean {
  try {
    return localStorage.getItem(UNLOCKED_KEY) === '1' && Boolean(loadSyncSettings().pin);
  } catch {
    return false;
  }
}

export function setDeviceUnlocked(unlocked: boolean): void {
  try {
    if (unlocked) {
      localStorage.setItem(UNLOCKED_KEY, '1');
    } else {
      localStorage.removeItem(UNLOCKED_KEY);
      localStorage.removeItem(SNAPSHOT_KEY);
      localStorage.removeItem(QUEUE_KEY);
      localStorage.removeItem(SETTINGS_KEY);
    }
  } catch {
    // ignore
  }
}

export function loadSyncSettings(): SyncSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        spreadsheetId: parsed.spreadsheetId || DEFAULT_SPREADSHEET_ID,
        appsScriptUrl: parsed.appsScriptUrl || DEFAULT_APPS_SCRIPT_URL,
        pin: parsed.pin || ''
      };
    }
  } catch {
    // ignore storage errors
  }
  return {
    spreadsheetId: DEFAULT_SPREADSHEET_ID,
    appsScriptUrl: DEFAULT_APPS_SCRIPT_URL,
    pin: ''
  };
}

export function saveSyncSettings(settings: SyncSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage errors
  }
}

export function loadInitialSnapshot(): AppSnapshot {
  try {
    if (isDeviceUnlocked()) {
      const cached = localStorage.getItem(SNAPSHOT_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as AppSnapshot;
        if (Array.isArray(parsed.diario) && Array.isArray(parsed.seriesGym)) {
          return parsed;
        }
      }
    }
  } catch {
    // fall back to empty template
  }
  return seedJson as unknown as AppSnapshot;
}

export function saveSnapshotCache(snapshot: AppSnapshot): void {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore quota errors
  }
}

export function loadPendingQueue(): SyncMutation[] {
  try {
    if (!isDeviceUnlocked()) return [];
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as SyncMutation[]) : [];
  } catch {
    return [];
  }
}

export function savePendingQueue(queue: SyncMutation[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // ignore
  }
}

export function applyMutationLocally(snap: AppSnapshot, mutation: SyncMutation): AppSnapshot {
  switch (mutation.type) {
    case 'upsertDiario': {
      const idx = snap.diario.findIndex((r) => r.Fecha === mutation.payload.Fecha);
      const next = [...snap.diario];
      if (idx >= 0) next[idx] = mutation.payload;
      else next.push(mutation.payload);
      next.sort((a, b) => a.Fecha.localeCompare(b.Fecha));
      return { ...snap, diario: next };
    }
    case 'upsertGym': {
      const idx = snap.seriesGym.findIndex((r) => r.ID === mutation.payload.ID);
      const next = [...snap.seriesGym];
      if (idx >= 0) next[idx] = mutation.payload;
      else next.push(mutation.payload);
      return { ...snap, seriesGym: next };
    }
    case 'deleteGym': {
      return { ...snap, seriesGym: snap.seriesGym.filter((r) => r.ID !== mutation.id) };
    }
    case 'upsertActividad': {
      const idx = snap.actividadFisica.findIndex((r) => r.ID === mutation.payload.ID);
      const next = [...snap.actividadFisica];
      if (idx >= 0) next[idx] = mutation.payload;
      else next.push(mutation.payload);
      next.sort((a, b) => a.Fecha.localeCompare(b.Fecha));
      return { ...snap, actividadFisica: next };
    }
    case 'deleteActividad': {
      return { ...snap, actividadFisica: snap.actividadFisica.filter((r) => r.ID !== mutation.id) };
    }
    case 'upsertRutina': {
      const idx = snap.rutinaPlan.findIndex((r) => r.ID === mutation.payload.ID);
      const next = [...snap.rutinaPlan];
      if (idx >= 0) next[idx] = mutation.payload;
      else next.push(mutation.payload);
      return { ...snap, rutinaPlan: next };
    }
    case 'deleteRutina': {
      return { ...snap, rutinaPlan: snap.rutinaPlan.filter((r) => r.ID !== mutation.id) };
    }
    case 'upsertConfig': {
      const nextCfg = { ...snap.config };
      for (const [k, v] of Object.entries(mutation.payload)) {
        if (v !== undefined) nextCfg[k] = v;
      }
      return { ...snap, config: nextCfg };
    }
  }
}

export async function syncWithGoogleSheets(
  settings: SyncSettings,
  pendingMutations: SyncMutation[]
): Promise<{
  ok: boolean;
  authError?: boolean;
  mode: 'apps-script' | 'local-cli' | 'local-cache';
  snapshot?: AppSnapshot;
  error?: string;
}> {
  const appsUrl = settings.appsScriptUrl.trim();
  const pin = settings.pin.trim();

  if (!pin) {
    return {
      ok: false,
      authError: true,
      mode: 'apps-script',
      error: 'Ingresá tu PIN personal para sincronizar.'
    };
  }

  if (appsUrl) {
    try {
      if (pendingMutations.length > 0) {
        const res = await fetch(appsUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'batchSync',
            pin,
            mutations: pendingMutations
          })
        });
        const data = await res.json();
        if (!data.ok) {
          const isAuth = String(data.error || '').toLowerCase().includes('pin');
          return {
            ok: false,
            authError: isAuth,
            mode: 'apps-script',
            error: data.error || 'Error en Apps Script'
          };
        }
        return { ok: true, mode: 'apps-script', snapshot: data.snapshot };
      } else {
        const sep = appsUrl.includes('?') ? '&' : '?';
        const res = await fetch(`${appsUrl}${sep}action=readAll&pin=${encodeURIComponent(pin)}`);
        const data = await res.json();
        if (!data.ok) {
          const isAuth = String(data.error || '').toLowerCase().includes('pin');
          return {
            ok: false,
            authError: isAuth,
            mode: 'apps-script',
            error: data.error || 'Error leyendo Apps Script'
          };
        }
        return { ok: true, mode: 'apps-script', snapshot: data };
      }
    } catch (err: any) {
      return {
        ok: false,
        mode: 'apps-script',
        error: err?.message || 'Sin conexión a internet (modo offline activo)'
      };
    }
  }

  return {
    ok: false,
    mode: 'local-cache',
    error: 'Modo caché local activo'
  };
}
