# Micro-Credit Approval Engine

Full-stack, config-driven credit decisioning: Node.js/Express backend + React (Vite) frontend.
Every threshold, weight, band and rule lives in a runtime config object — the engine code contains
zero hardcoded policy values. The exact same engine runs on the server and in the browser
(mirrored byte-for-byte, proven by parity tests).

## Quick start

```powershell
# Backend (port 5001)
cd backend
npm install
npm run dev

# Frontend (port 5173)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173.

> Port note: the backend defaults to **5001** (5000 was occupied on this machine by another
> project). Change `backend/.env` `PORT` and `frontend/.env` `VITE_API_URL` together.

### MongoDB (optional)

Set `MONGODB_URI` in `backend/.env` (local MongoDB or Atlas). If MongoDB is unreachable the
server automatically falls back to an **in-memory store** — every feature still works, data
just does not survive a restart.

### PDF export

Server-side export uses `puppeteer-core` with a locally installed **Edge or Chrome**
(auto-detected; override with `PUPPETEER_EXECUTABLE_PATH` in `backend/.env`). If the server
cannot render, the frontend falls back to an in-browser summary PDF via `@react-pdf/renderer`.

## Engine pipeline (strict order)

1. **Input validation** — 9 field-level cases, blocks submission (income sanity cap is an overridable warning)
2. **Derived fields** — `dti = expense/income`, `affordability_buffer = (income−expense)/income`
3. **Hard reject engine** — collects *all* failures → `Rejected (pre-score)`, scoring skipped
4. **Base scoring** — 5 weighted components (DTI, history, defaults, loan burden, buffer), `lerp` interpolation, auto-normalised weights, mapped to 300–900
5. **Interaction rules** — AND / OR / MAJORITY condition sets, stacking penalties/offsets, fired *and* skipped rules reported
6. **Final score** — `clamp(300, 900, base + net adjustment)`
7. **Band lookup** — first match wins; gaps → `Undetermined/Conditional` + warning
8. **Reason engine** — every output carries Field → Value → Threshold → Impact → plain English
9. **Conditional resolver** — reverse-simulates expense/loan/income changes (plus combinations) through the real engine; ranks viable paths easiest-first (max 4) and explains ineffective changes

`runFullEngine(inputs, config)` is pure (no Express/DB/UI imports) and identical in
`backend/src/engine/` and `frontend/src/engine/`.

## API

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/evaluate` | Evaluate one applicant, persist, return result |
| POST | `/api/evaluate/batch` | Evaluate many (invalid rows skipped + flagged) |
| GET | `/api/portfolio` | All applicants + summary stats |
| GET | `/api/portfolio/:id` | One applicant with full result |
| POST | `/api/upload` | PDF/CSV/Excel → parsed fields (≤10MB) |
| POST | `/api/export/pdf` | 4-section PDF report (puppeteer, retry once) |
| GET/POST/PUT/DELETE | `/api/config…` | Rule config CRUD + `/active` + `/:id/activate` |

## Frontend panels

- **/** Applicant form — manual entry with live DTI/buffer, or drag-drop PDF/CSV/Excel with pre-fill, missing-field highlighting and batch detection
- **/config** Rule config — hard-reject table, weights (live sum + auto-normalise), thresholds, band editor with gap/overlap detection, interaction rule builder, save/activate/delete + JSON import/export
- **/result/:id** Result — animated 300–900 score meter, metric cards, component chart, interaction panel, layered reasons, EMI calculator (with affordability check), PDF export
- **/result/:id** (Conditional) — points gap, ranked suggestions, "what won't work", live what-if simulator running the mirrored engine on every keystroke
- **/portfolio** — summary cards, risk distribution chart, sortable/filterable table, batch upload, CSV download

## Tests

```powershell
cd backend
npm test   # 35 tests: engine behaviour + frontend/backend parity (deep-equal on full result objects)
```
