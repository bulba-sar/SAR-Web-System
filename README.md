# SAR-Web-System: CALABARZON LULC Analysis & Crop Suitability Platform

A web-based system for Land Use/Land Cover (LULC) classification and agricultural analysis in the CALABARZON region (Philippines) using Sentinel-1 SAR and Sentinel-2 optical data from Google Earth Engine.

---

## 📋 System Overview

**Architecture:** FastAPI backend + React frontend  
**Data Sources:** Google Earth Engine (GEE) + Local GeoTIFF files  
**Primary Users:** Researchers, Government Officials, Farmers  
**Key Capabilities:**
- Real-time LULC mapping (5 classes: Water, Urban, Forest, Cropland, Agroforestry)
- Crop suitability analysis based on elevation, soil, NDVI, and climate data
- Crop intensity analysis (cropping cycles, SAR/NDVI timelines)
- Crop area coverage estimation
- Animated time-series comparison (2021–2025)

---

## 📁 Project Structure & File Communication

```
SAR-Web-System/
├── backend/                    # FastAPI Python server
│   ├── main.py                # Core API endpoints (50+) — tiles, analytics, auth, admin
│   ├── models.py              # SQLAlchemy database models (User, TileCache, AdminAOI, etc.)
│   ├── database.py            # PostgreSQL connection & initialization
│   ├── auth.py                # JWT tokens, bcrypt hashing, Google Sign-In, password reset
│   ├── admin.py               # Admin role management & feature permissions
│   ├── validation.py          # Pydantic request/response schemas
│   ├── compute_model_metrics.py   # Background job: compute RF model performance metrics
│   ├── reclassify_tif.py      # Utility: remap GEE class values → 0-4 standard indices
│   ├── clean_basemap.py       # Utility: process Sentinel-2 basemap → 4-band RGBA
│   ├── requirements.txt        # Python dependencies
│   ├── credentials.json        # Google Earth Engine service account (git-ignored)
│   ├── .env                    # Backend environment variables (git-ignored)
│   ├── tif/                    # LULC GeoTIFF files (2021–2025, 10m resolution)
│   │   └── backup/            # Auto-backup of originals before reclassification
│   ├── basemap/                # Sentinel-2 RGB basemap GeoTIFF
│   └── model_metrics.json      # Pre-computed RF model accuracy metrics
│
├── frontend/                   # React web application
│   ├── src/
│   │   ├── App.js             # Root component: state management & route dispatch
│   │   ├── index.js           # React entry point
│   │   ├── components/
│   │   │   ├── map.jsx        # Leaflet map: tile layers, drawing, navigation
│   │   │   ├── sidebar.jsx    # Top nav bar: auth, dark mode, menu tabs
│   │   │   ├── filter-panel.jsx   # Dataset & layer selection controls
│   │   │   ├── analysis.jsx   # Analytics UI: LULC change, crop intensity forms & charts
│   │   │   ├── profile.jsx    # User account & AOI management
│   │   │   └── admin.jsx      # Admin-only: permissions editor, metrics job status
│   │   ├── App.css            # Global styles (Tailwind overrides)
│   │   └── index.css          # Tailwind CSS base setup
│   ├── public/                # Static assets (logos, favicon)
│   ├── build/                 # Production build output
│   ├── package.json           # npm dependencies & scripts
│   ├── tailwind.config.js     # Tailwind CSS configuration
│   ├── .env, .env.production  # Frontend environment variables (git-ignored)
│   └── vercel.json            # Vercel deployment configuration
│
├── compute_model_metrics.py    # Standalone script for RF model evaluation
└── README.md                   # This file
```

---

## 🔄 Data Flow & Component Communication

### **1. LULC Tile Pipeline (Fastest: No GEE Latency)**

```
GEE Export → reclassify_tif.py (one-time)
  ↓
backend/tif/2024-Jan-Jun.tif (classes 0-4, uint8)
  ↓
main.py:/lulc-tiles/{year}/{period}/{z}/{x}/{y}.png
  ↓ (rio-tiler: 256×256 PNG tiles)
Frontend map.jsx (Leaflet layer)
```

**Key Points:**
- Local TIFs are fastest (no GEE API calls)
- `reclassify_tif.py` standardizes any class values → 0-4
- `main.py` applies LULC_COLORMAP (0=blue, 1=red, 2=green, 3=yellow, 4=lightgreen)
- Optional `?layer=water|urban|forest|agriculture|agroforestry` filters by class

### **2. Basemap Pipeline (Sentinel-2 RGB)**

```
Sentinel-2 GeoTIFF (from GEE)
  ↓
clean_basemap.py (one-time):
  - Convert to 4-band RGBA
  - Mask pixels outside CALABARZON boundary
  - Remove black pixels (GEE artifacts)
  - Build image pyramids (overviews)
  ↓
backend/basemap/basemap.tif
  ↓
main.py:/basemap-tiles/{z}/{x}/{y}.png
  ↓ (rio-tiler: RGB PNG tiles)
Frontend map.jsx (Leaflet base layer)
```

### **3. Authentication & Authorization**

```
Frontend (profile.jsx) → POST /auth/register or /auth/login
  ↓
auth.py:
  - hash_password() [bcrypt]
  - create_token() [JWT RS256]
  - verify_password()
  ↓
models.User table (PostgreSQL)
  ↓
auth_module.get_current_user() (FastAPI Depends)
  ↓
Protected endpoints (role-gated):
  /profile/*, /api/v1/admin/*
```

**Roles & Permissions:**
- **Researcher** — View maps, run analysis
- **Government Official** — + Admin dashboard
- **Admin** — Full control (permissions, metrics, AOI management)

### **4. Analytics Pipeline (GEE Computation + Local TIF Extraction)**

```
Frontend (analysis.jsx) → POST /api/v1/analytics/lulc-change
  {geometry: Polygon, start_year: 2021, end_year: 2025}
  ↓
main.py logic:
  1. For each year/period:
     - Try local TIF first: _lulc_stats_from_tif_roi()
       ✓ Instant results, includes all 5 classes
     - Fallback to GEE: histogram reducer (for older assets without local TIF)
  2. Return pixel counts & percentages per class
  ↓
models.LulcStatsCache (optional: cache results)
  ↓
analysis.jsx renders charts
```

**Similar endpoints:**
- `/api/v1/analytics/crop-intensity` — Cropping cycles via NDVI peak detection
- `/api/v1/analytics/crop-area` — Agricultural % per year
- `/query-crop-suitability` — Elevation + soil + climate-based crop recommendations

### **5. Model Metrics Job (Background Process)**

```
Frontend admin.jsx → POST /api/v1/admin/run-model-metrics
  ↓
main.py spawns subprocess:
  subprocess.Popen([python, compute_model_metrics.py])
  ↓
compute_model_metrics.py:
  - Loads training data from GEE assets
  - Trains RF classifier
  - Computes accuracy, F1, kappa per year/semester
  ↓
Writes: backend/model_metrics.json
  ↓
GET /api/v1/analytics/model-performance → returns JSON
  ↓
admin.jsx displays metrics & logs

Status polling: GET /api/v1/admin/run-model-metrics/status
```

---

## 📋 Key Files & Responsibilities

### **Backend - Core API**

| File | Lines | Purpose |
|------|-------|---------|
| **main.py** | 1849 | FastAPI app: 50+ endpoints (tiles, analytics, auth, admin, LULC change, crop intensity, etc.) |
| **models.py** | ~200 | 7 SQLAlchemy models: User, TileCache, LulcStatsCache, AdminAOI, SavedAOI, RolePermission, etc. |
| **database.py** | ~50 | PostgreSQL engine setup, session factory |
| **auth.py** | ~200 | JWT creation/verification, bcrypt hashing, Google OAuth, password reset email |
| **admin.py** | ~100 | Admin router; feature permission definitions & role-based defaults |
| **validation.py** | ~50 | Pydantic schemas for request/response validation |

### **Backend - Utilities & Data Processing**

| File | Purpose |
|------|---------|
| **reclassify_tif.py** | One-time: Remap arbitrary GEE class values → standard 0-4 indices; creates `backend/tif/backup/` |
| **clean_basemap.py** | One-time: Convert Sentinel-2 GeoTIFF → 4-band RGBA; mask boundary & black pixels; build overviews |
| **compute_model_metrics.py** | Standalone script: Train RF on GEE assets; output metrics to `model_metrics.json` |

### **Frontend - Components**

| File | Purpose |
|------|---------|
| **App.js** | Root: manages global state (auth, year/period, layers, nav tab, drawn polygon) |
| **map.jsx** | Leaflet instance; tile layer manager; drawing tools; AOI GeoJSON rendering |
| **filter-panel.jsx** | Year/period/layer/opacity selectors; layer toggle switches |
| **analysis.jsx** | LULC change, crop intensity, crop area forms; chart rendering (timelines, bars) |
| **profile.jsx** | Login/register form; user profile; AOI save/load |
| **admin.jsx** | Admin-only: job status monitor; permissions editor; metrics viewer |
| **sidebar.jsx** | Top nav: login button, dark mode toggle, tab navigation |

---

## 🔌 API Endpoints (Quick Reference)

### **Public (No Auth)**
- `GET /` — Status check
- `GET /health` — Backend readiness
- `GET /aois` — Admin-managed AOIs
- `GET /datasets/available` — List TIFs in `backend/tif/`
- `GET /get-sar-map/{year}/{period}` — LULC tile URL
- `GET /lulc-tiles/{z}/{x}/{y}.png` — PNG tile (rio-tiler)
- `GET /basemap-tiles/{z}/{x}/{y}.png` — Basemap PNG tile
- `POST /api/v1/analytics/lulc-change` — LULC stats for polygon
- `POST /api/v1/analytics/crop-intensity` — Crop cycles & SAR/NDVI timelines
- `POST /auth/register`, `/auth/login`, `/auth/google` — Auth

### **Authenticated (JWT Bearer)**
- `GET /profile/me` — Current user
- `GET /profile/aois` — Saved AOIs
- `POST /profile/aois`, `DELETE /profile/aois/{id}` — AOI CRUD
- `GET /profile/permissions` — Feature flags

### **Admin Only**
- `POST /api/v1/admin/run-model-metrics` — Start metrics job
- `GET /api/v1/admin/run-model-metrics/status` — Job status & logs
- `GET /api/v1/analytics/model-performance` — Model metrics JSON

---

## 💾 Database Schema (PostgreSQL)

Key tables (all via SQLAlchemy ORM):

| Table | Purpose |
|-------|---------|
| **users** | Email, name, role, password_hash, google_id, permissions (JSON) |
| **tile_cache** | GEE tile URLs with TTL (~5 hours) for caching |
| **lulc_stats_cache** | Pre-computed pixel counts per class; auto-invalidate if TIF changed |
| **saved_aoi** | User-drawn polygons (GeoJSON) for later analysis |
| **admin_aoi** | Public polygons created by admins; displayed on all user maps |
| **role_permission** | Feature flags per role (e.g., `can_export_data`, `can_manage_users`) |

---

## 🛠️ Development Workflow

### **Quick Start**

```bash
# Terminal 1: Backend
cd backend
python -m venv .venv
.venv\Scripts\activate  # Windows
source .venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
uvicorn main:app --reload  # Starts on http://localhost:8000

# Terminal 2: Frontend
cd frontend
npm install
npm start  # Starts on http://localhost:3000
```

### **Working with Local TIFs**

1. **Place GeoTIFF in `backend/tif/`**
   - Name: `{year}-{period}.tif` (e.g., `2024-Jan-Jun.tif`)
   - Must be single-band uint8; classes 0-4 + 255 (nodata)

2. **Reclassify to standard indices**
   ```bash
   cd backend
   python reclassify_tif.py
   ```
   - Defines `CLASS_MAP` with remapping (e.g., 27→Forest, 51→Agroforestry)
   - Auto-backs up original to `backend/tif/backup/`

3. **Verify**
   - Restart FastAPI: `uvicorn main:app --reload`
   - Frontend map: Select year/period → tiles auto-load

### **Processing New Basemap**

1. Export Sentinel-2 RGB from GEE; save as `backend/basemap/basemap.tif`
2. Process:
   ```bash
   cd backend
   python clean_basemap.py
   ```
3. Restart FastAPI; basemap tiles will render

### **Running Model Metrics Job**

1. Admin dashboard → "Compute Model Metrics" button
2. Backend spawns `compute_model_metrics.py` subprocess
3. Monitor status via "Status" button
4. Outputs: `backend/model_metrics.json` with accuracy scores

---

## 🔐 Security & Secrets

**Files to Protect (git-ignored):**
- `backend/credentials.json` — GEE service account
- `backend/.env` — Database URL, email credentials
- `frontend/.env.production` — API keys

**In Production:**
- Use environment variables instead of files
- Set `GEE_CREDENTIALS_JSON` (env var) to raw JSON content
- Enable HTTPS + CORS restrictions
- JWT RS256 with proper key rotation
- Bcrypt password hashing (10 rounds, already implemented)

---

## 📊 LULC Class Definitions

| Index | Class | Color | Interpretation |
|-------|-------|-------|-----------------|
| 0 | Water | Blue (#1d4ed8) | Rivers, lakes, rice paddies (flooded) |
| 1 | Urban | Red (#dc2626) | Built-up areas, cities, roads |
| 2 | Forest | Green (#15803d) | High vegetation, tree cover |
| 3 | Cropland | Yellow (#ca8a04) | Agriculture, open fields |
| 4 | Agroforestry | Light Green (#7a9e3b) | Mixed tree-crop systems |
| 255 | NoData | Transparent | Outside CALABARZON boundary |

---

## 🎨 UI Theming

**White Mode Colors:**
- Primary green: #23432f, #1d5e3a
- Accent: #3f7b56, #77bb95

**Dark Mode Colors:**
- Primary green: #308230, #4a9e3a
- Accent: #6dc44a, #a0d870

Dark mode state persists to `localStorage['sar_dark']`.

---

## 🚀 Deployment Checklist

**Before Transfer to DENR:**

1. **Credentials & Secrets**
   - Replace `backend/credentials.json` with DENR's GEE service account
   - Update `DATABASE_URL` to DENR's PostgreSQL instance
   - Set `GOOGLE_CLIENT_ID` (for Google Sign-In, if used)

2. **Database Initialization**
   - Run `models.Base.metadata.create_all()` on first startup
   - Seed initial admin user in `users` table
   - Pre-populate `admin_aoi` with CALABARZON municipalities

3. **Frontend Configuration**
   - Update `REACT_APP_API_URL` env var (backend URL)
   - Customize logos in `frontend/public/`
   - Verify dark/light mode colors in `App.css`

4. **GeoTIFF Data**
   - Place all TIF files in `backend/tif/` (or download via `download_tifs.py` equivalent)
   - Run `reclassify_tif.py` if needed
   - Verify tiles render at `http://localhost:8000/datasets/available`

5. **Deployment**
   - Frontend: Vercel, Netlify, or static host
   - Backend: Render.com, Railway, or self-hosted
   - Database: Managed PostgreSQL (Supabase, Railway, Render)

---

## 📝 Code Comments & Documentation

**Philosophy:**
- Inline comments explain the **WHY**, not the WHAT
- Variable/function names are self-documenting
- Comments address hidden constraints, workarounds, or non-obvious logic
- Removed: comments stating what obvious code does

**Example:**
```python
# ✗ Bad: Explains what the code does
# Check if user is admin
if user.role == "Admin":

# ✓ Good: Explains why or context
# Admins bypass rate-limiting to enable quick metadata updates during deployment
if user.role == "Admin":
```

---

## 📞 Support & Troubleshooting

**Common Issues:**

1. **Map tiles not loading**
   - Ensure `backend/tif/*.tif` files exist for selected year/period
   - Check `GET /datasets/available` endpoint
   - Verify rio-tiler installation: `pip show rio-tiler`

2. **GEE authentication errors**
   - Verify `credentials.json` is valid (run `python -c "import ee; ee.Initialize()..."`)
   - Check `GEE_CREDENTIALS_JSON` env var (production)

3. **Basemap rendering issues**
   - Ensure `backend/basemap/basemap.tif` is 4-band RGBA
   - Run `clean_basemap.py` to reprocess

4. **Database connection failed**
   - Verify `DATABASE_URL` in `.env`
   - Check PostgreSQL is running: `psql -U postgres -h localhost`

---

**Last Updated:** 2026-05-16  
**System Version:** 1.0
