# Control Salud · Peso, Calorías, Gimnasio & Actividad (PWA)

Aplicación web progresiva (PWA) offline-first con acceso protegido por PIN personal y sincronización hacia Google Sheets mediante Google Apps Script.

## Desarrollo local

```bash
npm install
npm run dev
```

## Estructura de pestañas en Google Sheets

- `Diario`: Peso en ayunas, calorías nocturnas, macronutrientes opcionales, suplementos y pasos.
- `Series_Gym`: Series individuales (1 a 6), repeticiones, carga en kg, tonelaje real y 1RM estimado.
- `Actividad_Fisica`: Sesiones deportivas y aeróbicas, duración, RPE y gasto estimado.
- `Rutina_Plan`: Plantilla editable de sesiones flexibles (`Sesión A`, `Sesión B`, `Sesión C`).
- `Config`: Parámetros y objetivos diarios.
