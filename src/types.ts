export type EtapaType = '2026-Actual' | '2021-Historico' | 'Todas';

export interface DiarioRow {
  Fecha: string; // YYYY-MM-DD
  Etapa: string;
  Peso_Kg: string;
  Kcal: string;
  Proteinas_g: string;
  Carbos_g: string;
  Grasas_g: string;
  Creatina: string; // 'SI' | 'NO' | ''
  Suplementos_Extra: string;
  Pasos: string;
  Dolor_Rodilla_0_10: string;
  Notas: string;
  Actualizado: string;
}

export interface GymSeriesRow {
  ID: string;
  Fecha: string;
  Etapa: string;
  Dia_Rutina: string;
  Ejercicio: string;
  Patron_Movimiento: string;
  Es_Peso_Corporal: string;
  Serie_1_Reps: string;
  Serie_1_Kg: string;
  Serie_2_Reps: string;
  Serie_2_Kg: string;
  Serie_3_Reps: string;
  Serie_3_Kg: string;
  Serie_4_Reps: string;
  Serie_4_Kg: string;
  Serie_5_Reps: string;
  Serie_5_Kg: string;
  Serie_6_Reps: string;
  Serie_6_Kg: string;
  RPE_Real: string;
  Dolor_Rodilla_0_10: string;
  Total_Series: string;
  Total_Reps: string;
  Tonelaje_Kg: string;
  Mejor_1RM_Est: string;
  Notas: string;
}

export interface ActividadRow {
  ID: string;
  Fecha: string;
  Etapa: string;
  Tipo: string; // 'Pádel' | 'Caminata' | 'Running' | 'Ciclismo' | 'Fútbol' | 'Movilidad / Rehab' | 'Otro'
  Duracion_Min: string;
  RPE_1_10: string;
  Distancia_Km: string;
  Kcal_Est: string;
  Dolor_Rodilla_0_10: string;
  Dolor_24h_0_10: string;
  Notas: string;
}

export interface RutinaPlanRow {
  ID: string;
  Dia: string;
  Orden: string;
  Ejercicio: string;
  Patron_Movimiento: string;
  Es_Isometrico: string;
  Es_Peso_Corporal: string;
  Series_Obj: string;
  Reps_Obj: string;
  Descanso_Seg: string;
  RPE_Obj: string;
  Notas_Tecnicas: string;
}

export interface AppConfig {
  kcal_objetivo: string;
  proteinas_objetivo_g: string;
  carbos_objetivo_g: string;
  grasas_objetivo_g: string;
  peso_objetivo_kg: string;
  pasos_objetivo: string;
  etapa_activa: string;
  dias_gimnasio: string;
  dias_padel: string;
  umbral_dolor_rodilla: string;
  [key: string]: string;
}

export interface AppSnapshot {
  spreadsheetId: string;
  spreadsheetUrl: string;
  syncedAt: string;
  diario: DiarioRow[];
  seriesGym: GymSeriesRow[];
  actividadFisica: ActividadRow[];
  rutinaPlan: RutinaPlanRow[];
  config: AppConfig;
}

export type SyncMutation =
  | { type: 'upsertDiario'; payload: DiarioRow }
  | { type: 'upsertGym'; payload: GymSeriesRow }
  | { type: 'deleteGym'; id: string }
  | { type: 'upsertActividad'; payload: ActividadRow }
  | { type: 'deleteActividad'; id: string }
  | { type: 'upsertRutina'; payload: RutinaPlanRow }
  | { type: 'deleteRutina'; id: string }
  | { type: 'upsertConfig'; payload: Partial<AppConfig> };

export interface SyncSettings {
  spreadsheetId: string;
  appsScriptUrl: string;
  pin: string;
}

export interface SyncState {
  status: 'synced' | 'syncing' | 'offline-queued' | 'error';
  mode: 'local-cli' | 'apps-script' | 'local-cache';
  pendingCount: number;
  lastSyncedAt: string;
  lastError?: string;
}

export type NavSection = 'hoy' | 'gimnasio' | 'actividad' | 'progreso';
