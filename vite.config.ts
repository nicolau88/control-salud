import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const execFileAsync = promisify(execFile);

const DEFAULT_SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID || '';

const HEADERS: Record<string, string[]> = {
  Diario: [
    'Fecha', 'Etapa', 'Peso_Kg', 'Kcal', 'Proteinas_g', 'Carbos_g', 'Grasas_g',
    'Creatina', 'Suplementos_Extra', 'Pasos', 'Dolor_Rodilla_0_10', 'Notas', 'Actualizado'
  ],
  Series_Gym: [
    'ID', 'Fecha', 'Etapa', 'Dia_Rutina', 'Ejercicio', 'Patron_Movimiento', 'Es_Peso_Corporal',
    'Serie_1_Reps', 'Serie_1_Kg', 'Serie_2_Reps', 'Serie_2_Kg', 'Serie_3_Reps', 'Serie_3_Kg',
    'Serie_4_Reps', 'Serie_4_Kg', 'Serie_5_Reps', 'Serie_5_Kg', 'Serie_6_Reps', 'Serie_6_Kg',
    'RPE_Real', 'Dolor_Rodilla_0_10', 'Total_Series', 'Total_Reps', 'Tonelaje_Kg', 'Mejor_1RM_Est', 'Notas'
  ],
  Actividad_Fisica: [
    'ID', 'Fecha', 'Etapa', 'Tipo', 'Duracion_Min', 'RPE_1_10',
    'Distancia_Km', 'Kcal_Est', 'Dolor_Rodilla_0_10', 'Dolor_24h_0_10', 'Notas'
  ],
  Rutina_Plan: [
    'ID', 'Dia', 'Orden', 'Ejercicio', 'Patron_Movimiento', 'Es_Isometrico',
    'Es_Peso_Corporal', 'Series_Obj', 'Reps_Obj', 'Descanso_Seg', 'RPE_Obj', 'Notas_Tecnicas'
  ],
  Config: ['Clave', 'Valor', 'Descripcion']
};

function parseReadAllOutput(raw: string) {
  const parts = raw.split(/--- (.+?) ---\r?\n/);
  const sections: Record<string, string[][]> = {};
  for (let i = 1; i < parts.length; i += 2) {
    const title = parts[i].trim();
    const body = (parts[i + 1] || '').trim();
    try {
      sections[title] = body ? JSON.parse(body) : [];
    } catch {
      sections[title] = [];
    }
  }
  return sections;
}

function rowsToObjects(sheetName: string, rows: string[][]) {
  const cols = HEADERS[sheetName];
  if (!rows || rows.length <= 1) return [];
  const out: Record<string, string>[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if (r.every((c) => String(c ?? '').trim() === '')) continue;
    const obj: Record<string, string> = {};
    for (let c = 0; c < cols.length; c++) {
      obj[cols[c]] = r[c] !== undefined && r[c] !== null ? String(r[c]) : '';
    }
    out.push(obj);
  }
  return out;
}

function colLetter(n: number): string {
  let s = '';
  let num = n;
  while (num > 0) {
    const mod = (num - 1) % 26;
    s = String.fromCharCode(65 + mod) + s;
    num = Math.floor((num - 1) / 26);
  }
  return s;
}

async function runGsheets(args: string[]) {
  const { stdout } = await execFileAsync('gsheets', args, { maxBuffer: 25 * 1024 * 1024 });
  return stdout;
}

async function readFullSnapshot(spreadsheetId: string) {
  const raw = await runGsheets(['readonly', 'read-all', spreadsheetId, '--json']);
  const sections = parseReadAllOutput(raw);
  const configArr = rowsToObjects('Config', sections['Config'] || []);
  const configMap: Record<string, string> = {};
  for (const row of configArr) {
    if (row.Clave) configMap[row.Clave] = row.Valor ?? '';
  }
  return {
    ok: true,
    mode: 'local-gsheets-cli',
    spreadsheetId,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    syncedAt: new Date().toISOString(),
    diario: rowsToObjects('Diario', sections['Diario'] || []),
    seriesGym: rowsToObjects('Series_Gym', sections['Series_Gym'] || []),
    actividadFisica: rowsToObjects('Actividad_Fisica', sections['Actividad_Fisica'] || []),
    rutinaPlan: rowsToObjects('Rutina_Plan', sections['Rutina_Plan'] || []),
    config: configMap,
    _rawSections: sections
  };
}

async function applyMutationsViaCli(spreadsheetId: string, mutations: any[]) {
  const snap = await readFullSnapshot(spreadsheetId);
  const sections = snap._rawSections;
  const batchOps: any[] = [];
  const deleteRowRanges: { sheetName: string; row1Based: number }[] = [];

  for (const op of mutations) {
    const mapSheet: Record<string, string> = {
      upsertDiario: 'Diario',
      upsertGym: 'Series_Gym',
      deleteGym: 'Series_Gym',
      upsertActividad: 'Actividad_Fisica',
      deleteActividad: 'Actividad_Fisica',
      upsertRutina: 'Rutina_Plan',
      deleteRutina: 'Rutina_Plan'
    };

    if (op.type === 'upsertConfig') {
      const rows = sections['Config'] || [HEADERS.Config];
      for (const [k, v] of Object.entries(op.payload || {})) {
        const idx = rows.findIndex((r, i) => i > 0 && String(r[0] ?? '').trim() === k);
        if (idx > 0) {
          const existingDesc = rows[idx][2] ?? '';
          rows[idx] = [k, String(v ?? ''), existingDesc];
          batchOps.push({
            op: 'write',
            range: `Config!A${idx + 1}:C${idx + 1}`,
            data: [[k, String(v ?? ''), existingDesc]]
          });
        } else {
          rows.push([k, String(v ?? ''), '']);
          batchOps.push({
            op: 'append',
            range: 'Config!A1',
            data: [[k, String(v ?? ''), '']]
          });
        }
      }
      continue;
    }

    const sheetName = mapSheet[op.type];
    if (!sheetName) continue;
    const cols = HEADERS[sheetName];
    const endCol = colLetter(cols.length);
    const rows = sections[sheetName] || [cols];

    if (op.type.startsWith('delete')) {
      const idx = rows.findIndex((r, i) => i > 0 && String(r[0] ?? '').trim() === String(op.id ?? '').trim());
      if (idx > 0) {
        deleteRowRanges.push({ sheetName, row1Based: idx + 1 });
        rows.splice(idx, 1);
      }
      continue;
    }

    const rowData = cols.map((k) => (op.payload?.[k] !== undefined && op.payload?.[k] !== null ? String(op.payload[k]) : ''));
    const keyVal = rowData[0];
    const idx = rows.findIndex((r, i) => i > 0 && String(r[0] ?? '').trim() === String(keyVal).trim());
    if (idx > 0) {
      rows[idx] = rowData;
      batchOps.push({
        op: 'write',
        range: `${sheetName}!A${idx + 1}:${endCol}${idx + 1}`,
        data: [rowData]
      });
    } else {
      rows.push(rowData);
      batchOps.push({
        op: 'append',
        range: `${sheetName}!A1`,
        data: [rowData]
      });
    }
  }

  if (batchOps.length > 0) {
    const tmpFile = path.join(os.tmpdir(), `cs-batch-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    await writeFile(tmpFile, JSON.stringify(batchOps), 'utf-8');
    try {
      await runGsheets(['mutate', 'batch', spreadsheetId, '-f', tmpFile]);
    } finally {
      await unlink(tmpFile).catch(() => {});
    }
  }

  // Delete rows from bottom to top if requested explicitly
  deleteRowRanges.sort((a, b) => b.row1Based - a.row1Based);
  for (const del of deleteRowRanges) {
    await runGsheets(['mutate', 'delete-rows', spreadsheetId, '--range', `${del.sheetName}!${del.row1Based}:${del.row1Based}`]);
  }
}

function googleSheetsDevBridge(): Plugin {
  const handler = async (req: any, res: any, next: any) => {
    if (!req.url?.startsWith('/api/sheets')) return next();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    try {
      const urlObj = new URL(req.url, 'http://localhost');
      const spreadsheetId = urlObj.searchParams.get('spreadsheetId') || DEFAULT_SPREADSHEET_ID;
      const action = urlObj.searchParams.get('action') || 'readAll';

      if (req.method === 'GET') {
        if (action === 'status') {
          await runGsheets(['--version']);
          res.end(JSON.stringify({ ok: true, mode: 'local-gsheets-cli', spreadsheetId }));
          return;
        }
        const snap = await readFullSnapshot(spreadsheetId);
        const { _rawSections, ...clean } = snap;
        res.end(JSON.stringify(clean));
        return;
      }

      if (req.method === 'POST') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        const body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}');
        const targetId = body.spreadsheetId || spreadsheetId;
        const list = Array.isArray(body.mutations)
          ? body.mutations
          : body.mutation
          ? [body.mutation]
          : [];
        if (list.length > 0) {
          await applyMutationsViaCli(targetId, list);
        }
        const snap = await readFullSnapshot(targetId);
        const { _rawSections, ...clean } = snap;
        res.end(JSON.stringify({ ok: true, snapshot: clean }));
        return;
      }

      res.statusCode = 405;
      res.end(JSON.stringify({ ok: false, error: 'Método no soportado' }));
    } catch (err: any) {
      res.statusCode = 503;
      res.end(
        JSON.stringify({
          ok: false,
          unavailable: true,
          error: err?.message || 'Puente local no disponible; usá la URL de Apps Script en Ajustes.'
        })
      );
    }
  };

  return {
    name: 'google-sheets-dev-bridge',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), googleSheetsDevBridge()],
  build: {
    target: 'esnext'
  }
});
