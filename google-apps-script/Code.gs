/**
 * Plantilla de conector Google Apps Script (Google Sheets <-> Control Salud PWA)
 * Reemplazar TU_SPREADSHEET_ID y TU_PIN_SECRETO al implementar en tu cuenta de Google.
 */

const SPREADSHEET_ID = 'TU_SPREADSHEET_ID';
const SECRET_PIN = 'TU_PIN_SECRETO';

function getTargetSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

const HEADERS = {
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

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function checkPin(pin) {
  if (!SECRET_PIN || String(pin || '').trim() !== SECRET_PIN) {
    throw new Error('PIN inválido');
  }
}

function ensureSheet(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(HEADERS[name]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function readSheetObjects(ss, name) {
  const sh = ensureSheet(ss, name);
  const values = sh.getDataRange().getDisplayValues();
  if (values.length <= 1) return [];
  const cols = HEADERS[name];
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (row.every((c) => String(c).trim() === '')) continue;
    const item = {};
    for (let c = 0; c < cols.length; c++) {
      item[cols[c]] = row[c] !== undefined ? String(row[c]) : '';
    }
    out.push(item);
  }
  return out;
}

function upsertRowByKey(ss, sheetName, keyColIndex, recordObj) {
  const sh = ensureSheet(ss, sheetName);
  const cols = HEADERS[sheetName];
  const rowValues = cols.map((k) => (recordObj[k] !== undefined && recordObj[k] !== null ? String(recordObj[k]) : ''));
  const targetKey = rowValues[keyColIndex];
  const data = sh.getDataRange().getDisplayValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][keyColIndex]).trim() === String(targetKey).trim()) {
      sh.getRange(i + 1, 1, 1, cols.length).setValues([rowValues]);
      return { updatedRow: i + 1 };
    }
  }
  sh.appendRow(rowValues);
  return { appended: true };
}

function deleteRowByKey(ss, sheetName, keyColIndex, keyValue) {
  const sh = ensureSheet(ss, sheetName);
  const data = sh.getDataRange().getDisplayValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][keyColIndex]).trim() === String(keyValue).trim()) {
      sh.deleteRow(i + 1);
      return { deleted: true };
    }
  }
  return { deleted: false };
}

function applyMutation(ss, op) {
  switch (op.type) {
    case 'upsertDiario':
      return upsertRowByKey(ss, 'Diario', 0, op.payload);
    case 'upsertGym':
      return upsertRowByKey(ss, 'Series_Gym', 0, op.payload);
    case 'deleteGym':
      return deleteRowByKey(ss, 'Series_Gym', 0, op.id);
    case 'upsertActividad':
      return upsertRowByKey(ss, 'Actividad_Fisica', 0, op.payload);
    case 'deleteActividad':
      return deleteRowByKey(ss, 'Actividad_Fisica', 0, op.id);
    case 'upsertRutina':
      return upsertRowByKey(ss, 'Rutina_Plan', 0, op.payload);
    case 'deleteRutina':
      return deleteRowByKey(ss, 'Rutina_Plan', 0, op.id);
    case 'upsertConfig': {
      const entries = Object.entries(op.payload || {});
      entries.forEach(([k, v]) => {
        upsertRowByKey(ss, 'Config', 0, { Clave: k, Valor: String(v), Descripcion: '' });
      });
      return { updatedConfig: entries.length };
    }
    default:
      throw new Error('Operación desconocida: ' + op.type);
  }
}

function readAllPayload(ss) {
  const configArr = readSheetObjects(ss, 'Config');
  const configMap = {};
  configArr.forEach((r) => {
    if (r.Clave) configMap[r.Clave] = r.Valor;
  });
  return {
    ok: true,
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    syncedAt: new Date().toISOString(),
    diario: readSheetObjects(ss, 'Diario'),
    seriesGym: readSheetObjects(ss, 'Series_Gym'),
    actividadFisica: readSheetObjects(ss, 'Actividad_Fisica'),
    rutinaPlan: readSheetObjects(ss, 'Rutina_Plan'),
    config: configMap
  };
}

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    checkPin(params.pin);
    const ss = getTargetSpreadsheet();
    if (params.action === 'status') {
      return jsonResponse({ ok: true, mode: 'apps-script', spreadsheetId: ss.getId(), title: ss.getName() });
    }
    return jsonResponse(readAllPayload(ss));
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    checkPin(body.pin);
    const ss = getTargetSpreadsheet();
    if (body.action === 'batchSync' && Array.isArray(body.mutations)) {
      const results = body.mutations.map((m) => applyMutation(ss, m));
      return jsonResponse({ ok: true, results, snapshot: readAllPayload(ss) });
    }
    if (body.mutation) {
      const res = applyMutation(ss, body.mutation);
      return jsonResponse({ ok: true, result: res });
    }
    return jsonResponse({ ok: false, error: 'Sin mutaciones válidas' });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err.message || err) });
  }
}
