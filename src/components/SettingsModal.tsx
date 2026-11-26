import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, RefreshCw, Settings, X } from 'lucide-react';
import type { AppConfig, SyncSettings, SyncState } from '../types';
import { APPS_SCRIPT_CODE } from '../lib/sheetsSync';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  config: AppConfig;
  syncSettings: SyncSettings;
  syncState: SyncState;
  spreadsheetUrl: string;
  onSaveConfig: (next: Partial<AppConfig>) => void;
  onSaveSyncSettings: (next: SyncSettings) => void;
  onManualSync: () => void;
  onLockDevice: () => void;
}

type ColorSchemeChoice = 'system' | 'light' | 'dark';

function readStoredScheme(): ColorSchemeChoice {
  try {
    const v = localStorage.getItem('color-scheme');
    if (v === 'light' || v === 'dark') return v;
  } catch {
    // ignore
  }
  return 'system';
}

function applyColorSchemeChoice(choice: ColorSchemeChoice) {
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (choice === 'system') {
    try {
      localStorage.removeItem('color-scheme');
    } catch {}
    if (meta) meta.setAttribute('content', 'light dark');
  } else {
    try {
      localStorage.setItem('color-scheme', choice);
    } catch {}
    if (meta) meta.setAttribute('content', choice);
  }
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  onClose,
  config,
  syncSettings,
  syncState,
  spreadsheetUrl,
  onSaveConfig,
  onSaveSyncSettings,
  onManualSync,
  onLockDevice
}) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  const [kcalObj, setKcalObj] = useState(config.kcal_objetivo || '2200');
  const [pesoObj, setPesoObj] = useState(config.peso_objetivo_kg || '74.0');
  const [protObj, setProtObj] = useState(config.proteinas_objetivo_g || '160');
  const [pasosObj, setPasosObj] = useState(config.pasos_objetivo || '8000');

  const [appsUrl, setAppsUrl] = useState(syncSettings.appsScriptUrl);
  const [pin, setPin] = useState(syncSettings.pin);
  const [scheme, setScheme] = useState<ColorSchemeChoice>(readStoredScheme);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setKcalObj(config.kcal_objetivo || '2200');
    setPesoObj(config.peso_objetivo_kg || '74.0');
    setProtObj(config.proteinas_objetivo_g || '160');
    setPasosObj(config.pasos_objetivo || '8000');
  }, [config]);

  useEffect(() => {
    setAppsUrl(syncSettings.appsScriptUrl);
    setPin(syncSettings.pin);
  }, [syncSettings]);

  // Open / close native modal <dialog>
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      dlg.showModal();
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);

  // Fallback for browsers without native <dialog closedby="any"> support
  // (modern-web-guidance: light-dismiss-a-dialog)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onNativeClose = () => {
      dialog.returnValue = '';
      onClose();
    };
    dialog.addEventListener('close', onNativeClose);

    let cleanupClick: (() => void) | undefined;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const handleBackdropClick = (event: MouseEvent) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (isDialogContent) return;
        dialog.close();
      };
      dialog.addEventListener('click', handleBackdropClick);
      cleanupClick = () => dialog.removeEventListener('click', handleBackdropClick);
    }

    return () => {
      dialog.removeEventListener('close', onNativeClose);
      cleanupClick?.();
    };
  }, [onClose]);

  const handleSaveAll = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveConfig({
      kcal_objetivo: kcalObj.trim(),
      peso_objetivo_kg: pesoObj.trim().replace(',', '.'),
      proteinas_objetivo_g: protObj.trim(),
      pasos_objetivo: pasosObj.trim()
    });
    onSaveSyncSettings({
      spreadsheetId: syncSettings.spreadsheetId,
      appsScriptUrl: appsUrl.trim(),
      pin: pin.trim()
    });
    onClose();
  };

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(APPS_SCRIPT_CODE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // ignore
    }
  };

  return (
    <dialog
      ref={dialogRef}
      {...({ closedby: 'any' } as any)}
      aria-labelledby="settings-modal-title"
    >
      <div className="dialog-body">
        <div className="card-header">
          <h1 id="settings-modal-title" className="card-title" style={{ fontSize: '1.2rem' }}>
            <Settings size={20} aria-hidden="true" />
            Google Sheets, Metas y Apariencia
          </h1>
          <button
            type="button"
            className="btn btn-sm"
            onClick={onClose}
            aria-label="Cerrar configuración"
          >
            <X size={16} aria-hidden="true" />
            Cerrar
          </button>
        </div>

        {/* Estado y acceso directo a la planilla */}
        <div className="card-elevated" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 750, fontSize: '0.9rem' }}>
                Base de Datos Principal: Google Sheets
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Modo actual:{' '}
                <strong>
                  {syncState.mode === 'apps-script'
                    ? 'Apps Script Web App (Celular + PC)'
                    : syncState.mode === 'local-cli'
                    ? 'Puente directo Google Sheets activo'
                    : 'Caché Offline Local'}
                </strong>
                {syncState.pendingCount > 0 && ` · ${syncState.pendingCount} cambios en cola`}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-sm" onClick={onManualSync}>
                <RefreshCw size={14} aria-hidden="true" />
                Sincronizar
              </button>
              {spreadsheetUrl && (
                <a
                  href={spreadsheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-sm btn-primary"
                >
                  <ExternalLink size={14} aria-hidden="true" />
                  Abrir Planilla
                </a>
              )}
              <button type="button" className="btn btn-sm btn-danger" onClick={onLockDevice}>
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>

        <form
          method="POST"
          action="#guardar-ajustes"
          onSubmit={handleSaveAll}
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          {/* Metas nutricionales y físicas */}
          <fieldset className="radio-group" style={{ flexDirection: 'column' }}>
            <legend>Metas diarias</legend>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.65rem', width: '100%' }}>
              <div className="field">
                <label htmlFor="cfg-kcal">Calorías objetivo (kcal)</label>
                <input
                  id="cfg-kcal"
                  name="kcal_objetivo"
                  type="text"
                  inputMode="numeric"
                  value={kcalObj}
                  onChange={(e) => setKcalObj(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="cfg-peso">Peso objetivo (kg)</label>
                <input
                  id="cfg-peso"
                  name="peso_objetivo"
                  type="text"
                  inputMode="decimal"
                  value={pesoObj}
                  onChange={(e) => setPesoObj(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="cfg-prot">Proteínas objetivo (g)</label>
                <input
                  id="cfg-prot"
                  name="prot_objetivo"
                  type="text"
                  inputMode="numeric"
                  value={protObj}
                  onChange={(e) => setProtObj(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="cfg-pasos">Pasos diarios objetivo</label>
                <input
                  id="cfg-pasos"
                  name="pasos_objetivo"
                  type="text"
                  inputMode="numeric"
                  value={pasosObj}
                  onChange={(e) => setPasosObj(e.target.value)}
                />
              </div>
            </div>
          </fieldset>

          {/* Conexión avanzada (ya viene configurada de fábrica) */}
          <details className="card-elevated">
            <summary style={{ cursor: 'pointer', fontWeight: 650, fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
              Opciones avanzadas del conector Google Sheets (ya configurado)
            </summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginTop: '0.75rem', fontSize: '0.82rem' }}>
              <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                Tu app ya tiene integrada la URL de sincronización directa para celular y PC. Solo tocá estos campos si alguna vez creás un conector nuevo.
              </p>

              <div className="field">
                <label htmlFor="cfg-apps-url">URL de Aplicación Web (Apps Script)</label>
                <input
                  id="cfg-apps-url"
                  name="apps_script_url"
                  type="url"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  value={appsUrl}
                  onChange={(e) => setAppsUrl(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={handleCopyScript}
                >
                  {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                  {copied ? '¡Código copiado!' : 'Copiar respaldo de Code.gs'}
                </button>
              </div>
            </div>
          </details>

          {/* Selector de tema de 3 estados (modern-web-guidance: dark-mode-toggle) */}
          <fieldset className="radio-group">
            <legend>Apariencia de la aplicación</legend>
            {(
              [
                { id: 'system', label: 'Automático del sistema' },
                { id: 'dark', label: 'Modo oscuro' },
                { id: 'light', label: 'Modo claro' }
              ] as const
            ).map((opt) => (
              <label key={opt.id} className="check-pill" htmlFor={`theme-${opt.id}`}>
                <input
                  id={`theme-${opt.id}`}
                  type="radio"
                  name="color_scheme_pref"
                  value={opt.id}
                  checked={scheme === opt.id}
                  onChange={() => {
                    setScheme(opt.id);
                    applyColorSchemeChoice(opt.id);
                  }}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </fieldset>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button type="button" className="btn" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" autoFocus>
              Guardar configuración
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
};
