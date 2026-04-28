# SAR-Web-System

## Thesis Structure
```
SAR-Web-System/
├── backend/
│   ├── tif/                        # SAR GeoTIFF files served as map tiles (named YYYY-Jan-Jun.tif / YYYY-Jul-Dec.tif)
│   ├── main.py                     # FastAPI app — all API routes (SAR tiles, LULC stats, auth, basemap)
│   ├── admin.py                    # Admin-only routes: AOI CRUD, GeoJSON/Shapefile upload, user management
│   ├── auth.py                     # JWT authentication, password hashing, token creation and verification
│   ├── build_overviews.py          # One-time script to build image pyramids into TIFs for faster tile serving
│   ├── database.py                 # SQLAlchemy engine and session setup (connects to Supabase via DATABASE_URL)
│   ├── fix_tif_nodata.py           # Patches nodata values and rebuilds overviews on raw exported TIFs
│   ├── models.py                   # SQLAlchemy ORM models (TileCache, LulcStatsCache, User, AOI, etc.)
│   ├── validation.py               # GeoTIFF upload validation — hard errors (reject) and soft warnings
│   ├── credentials.json            # Google service account credentials for Earth Engine authentication
│   ├── model_metrics.json          # Pre-computed RF classifier metrics (accuracy, kappa, F1) per year/semester
│   └── requirements.txt            # Python dependencies
├── frontend/                       
│   ├── src/
│       ├── components/
│       │   ├── admin.jsx           # Admin dashboard — manage AOIs, upload datasets, view registered users
│       │   ├── analysis.jsx        # LULC analysis panel — bar charts, AOI stats, CSV export, draw tools
│       │   ├── filter-panel.jsx    # Left sidebar controls — year/period selector, layer toggles, opacity sliders
│       │   ├── map.jsx             # Leaflet map — SAR tile overlay, AOI GeoJSON, basemap, fly-to navigation
│       │   ├── profile.jsx         # User profile page — view/edit account info, change password
│       │   └── sidebar.jsx         # Top navigation bar with About/Methodology modal
│       ├── App.css                 # Global styles and Tailwind base overrides
│       └── App.js                  # Root component — state management and layout wiring for all panels
├── compute_model_metrics.py        # Trains RF classifier on GEE composites and writes metrics to model_metrics.json
└── README.md                       # Project Documentation
```
## Get Started
### How to Push and Pull in Github

```bash
#----------------- PUSH ------------------
#Create repo on Github
#Then run:
cd SAR-Web-System
git remote add origin https://github.com/bulba-sar/SAR-Web-System.git #Only if you are not sure what repo you are pushing at
git add .
git commit -m "Comment"
git push
```
```bash
#----------------- PULL ------------------
#if you have changes in your local code but wants to pull the new updated code from github
git stash 
git pull
git stash pop
```

### How to Run Locally

```bash
# You will need 2 terminals for the backend and frontend

#----------------- TERMINAL 1  ------------------
# BACKEND
cd SAR-Web-System/backend
py -m venv .venv # skip is venv is already installed
.\.venv\Scripts\actvate
pip install -r requirements.txt # skip is python llibraries are already installed
uvicorn main:app --reload

#----------------- TERMINAL 2  ------------------
# FRONTEND
cd SAR-Web-System/frontend
py -m venv .venv # skip is venv is already installed / skip if venv is not used
.\.venv\Scripts\actvate # skip if venv is not used
npm start 
```

### Installing Git LFS (Large File Storage)
This is for the basedmap since the file is 400mb
**Download here:**  `git-lfs.com`

```bash
git lfs install
git lfs track "backend/tif/*.tif"
```

### ENV Configurations
| Secret Name | Description |
```
| `DATABASE_URL` | SUPABASE Url |
| `JWT_SECRET_KEY` | IDK This |
```

### Color Palette
#### White Mode
- #23432f
- #1d5e3a
- #3f7b56
- #77bb95
- #2a2a2a
- #000000

#### Dark Mode
- #308230
- #4a9e3a
- #6dc44a
- #a0d870
- #f7f7f7
- #ffffff

