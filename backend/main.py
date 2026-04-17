import ee
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from google.oauth2 import service_account
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone

import database
import models
import auth as auth_module
import admin as admin_module
from database import get_db

app = FastAPI(title="Thesis Backend")
app.include_router(admin_module.router)

# --- LOCAL TIF TILE SERVER (rio-tiler, no GEE dependency) ---
# Drop exported GeoTIFFs into backend/tif/ named as:  2021-Jan-Jun.tif, 2021-Jul-Dec.tif, etc.
# /get-sar-map will automatically return a local tile URL when the TIF is present.
import pathlib
from io import BytesIO
try:
    from rio_tiler.io import Reader as RioReader
    from rio_tiler.errors import TileOutsideBounds
    _RIO_AVAILABLE = True
except ImportError:
    _RIO_AVAILABLE = False
    print("WARNING: rio-tiler not installed. Run: pip install rio-tiler")

_TIF_DIR = pathlib.Path(__file__).parent / "tif"
_TIF_DIR.mkdir(exist_ok=True)

# 256x256 fully-transparent PNG returned for tiles outside the image bounds
_EMPTY_PNG: bytes = b""
try:
    from PIL import Image as _PilImage
    _buf = BytesIO()
    _PilImage.new("RGBA", (256, 256), (0, 0, 0, 0)).save(_buf, format="PNG")
    _EMPTY_PNG = _buf.getvalue()
except Exception:
    pass


def _local_tile_url(year: int, period: str) -> str | None:
    """Return a local tile URL template if a TIF exists for this year/period, else None."""
    if not _RIO_AVAILABLE:
        return None
    tif = _TIF_DIR / f"{year}-{period}.tif"
    if not tif.exists():
        return None
    return f"http://127.0.0.1:8000/lulc-tiles/{year}/{period}/{{z}}/{{x}}/{{y}}.png"

# --- CREATE TABLES ON STARTUP ---
try:
    models.Base.metadata.create_all(bind=database.engine)
except Exception as e:
    print(f"WARNING: Could not connect to database on startup: {e}")
    print("Backend will still serve map/GEE endpoints. Login/profile features will be unavailable.")

# --- COLUMN MIGRATIONS (add new columns to existing tables safely) ---
_COLUMN_MIGRATIONS = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions TEXT;",
]

try:
    with database.engine.connect() as _conn:
        for _stmt in _COLUMN_MIGRATIONS:
            _conn.execute(database.text(_stmt))
        _conn.commit()
except Exception as e:
    print(f"WARNING: Column migration failed: {e}")

# --- CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- GLOBAL EXCEPTION HANDLER (ensures CORS headers are on all errors) ---
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": f"Server error: {str(exc)}"},
        headers={"Access-Control-Allow-Origin": "*"},
    )

# --- AUTHENTICATE GEE (Single Init) ---
KEY_FILE = 'credentials.json'
credentials = service_account.Credentials.from_service_account_file(KEY_FILE)
scoped_credentials = credentials.with_scopes(['https://www.googleapis.com/auth/earthengine'])

try:
    ee.Initialize(scoped_credentials, project='sar-calabarzon')
except Exception as e:
    print(f"Failed to initialize GEE with service account: {e}")

# === SHARED GEE ASSETS ===
calabarzon = ee.FeatureCollection("FAO/GAUL/2015/level2") \
    .filter(ee.Filter.inList('ADM2_NAME', ['Batangas', 'Cavite', 'Laguna', 'Quezon', 'Rizal']))

# === LULC ASSET REGISTRY ===
assets = {
    2021: {"Jan-Jun": "projects/sar-calabarzon/assets/export/2021_S1_LULC_CALABARZON_PRO", "Jul-Dec": "projects/sar-calabarzon/assets/export/2021_S2_LULC_CALABARZON_PRO"},
    2022: {"Jan-Jun": "projects/sar-calabarzon/assets/export/2022_S1_LULC_CALABARZON_PRO", "Jul-Dec": "projects/sar-calabarzon/assets/export/2022_S2_LULC_CALABARZON_PRO"},
    2023: {"Jan-Jun": "projects/sar-calabarzon/assets/export/2023_S1_LULC_CALABARZON_PRO", "Jul-Dec": "projects/sar-calabarzon/assets/export/2023_S2_LULC_CALABARZON_PRO"},
    2024: {"Jan-Jun": "projects/sar-calabarzon/assets/export/2024_S1_LULC_CALABARZON_PRO", "Jul-Dec": "projects/sar-calabarzon/assets/export/2024_S2_LULC_CALABARZON_PRO"},
    2025: {"Jan-Jun": "projects/sar-calabarzon/assets/export/2025_S1_LULC_CALABARZON_PRO", "Jul-Dec": "projects/sar-calabarzon/assets/export/2025_S2_LULC_CALABARZON_PRO"}
}

CLASS_MAP = {
    0: "Water",
    1: "Urban",
    2: "Forest",
    3: "Agriculture"
}

CLASS_PALETTE = ['#1d4ed8', '#dc2626', '#15803d', '#ca8a04']

REFRESH_AFTER_HOURS = 5  # refresh URL before GEE token expires (~6-7 h)


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)  # naive UTC, matches DB storage


def _get_cached_tile(db: Session, key: str) -> str | None:
    """Return a cached tile URL if the row exists and the URL is still fresh.
    Returns None (triggering a GEE refresh) if the URL is older than
    REFRESH_AFTER_HOURS.  The row itself is never deleted.
    """
    entry = db.query(models.TileCache).filter(models.TileCache.cache_key == key).first()
    if entry is None:
        return None
    if _now() - entry.created_at > timedelta(hours=REFRESH_AFTER_HOURS):
        # URL is stale — caller will regenerate and upsert a fresh one
        return None
    return entry.tile_url


def _set_cached_tile(db: Session, key: str, url: str) -> None:
    """Upsert a tile URL into the cache."""
    entry = db.query(models.TileCache).filter(models.TileCache.cache_key == key).first()
    if entry:
        entry.tile_url = url
        entry.created_at = _now()
    else:
        entry = models.TileCache(cache_key=key, tile_url=url)
        db.add(entry)
    db.commit()


# ============================================================
#  LOCAL TILE ENDPOINT  (rio-tiler, served from backend/tif/)
# ============================================================

# LULC colormap: class value → RGBA (matches CLASS_PALETTE in GEE and frontend legend)
# 0=Water(blue)  1=Urban(red)  2=Forest(green)  3=Agriculture(yellow)
# TIFs must be exported from GEE with .unmask(255) so outside-region pixels = 255.
# 255 is intentionally absent from this colormap → renders as transparent via nodata.
LULC_COLORMAP = {
    0: (29,  78,  216, 255),  # Water
    1: (220, 38,  38,  255),  # Urban
    2: (21,  128, 61,  255),  # Forest
    3: (202, 138, 4,   255),  # Agriculture
}

# Pixel value used to mark "outside CALABARZON boundary" in exported TIFs.
# GEE export: classified.unmask(LULC_OUTSIDE_VALUE).toByte()
LULC_OUTSIDE_VALUE = 255


@app.get("/lulc-tiles/{year}/{period}/{z}/{x}/{y}.png")
def serve_lulc_tile(year: int, period: str, z: int, x: int, y: int):
    """Serve a 256×256 PNG tile from a local raw-class GeoTIFF.
    Applies the LULC colormap. Pixels with value 255 (outside CALABARZON)
    are treated as nodata and rendered fully transparent.
    No GEE dependency — reads directly from backend/tif/.
    """
    if not _RIO_AVAILABLE:
        raise HTTPException(status_code=503, detail="rio-tiler not installed")

    tif_path = _TIF_DIR / f"{year}-{period}.tif"
    if not tif_path.exists():
        raise HTTPException(status_code=404, detail=f"TIF not found: {year}-{period}.tif")

    try:
        # nodata=255 is already stored in the TIF metadata (set by fix_tif_nodata.py).
        # rio-tiler reads it automatically — no need to pass it as a constructor arg.
        with RioReader(str(tif_path)) as src:
            img = src.tile(x, y, z, tilesize=256)
        return Response(
            content=img.render(img_format="PNG", colormap=LULC_COLORMAP),
            media_type="image/png",
        )
    except TileOutsideBounds:
        return Response(content=_EMPTY_PNG, media_type="image/png")
    except Exception:
        return Response(content=_EMPTY_PNG, media_type="image/png")


@app.get("/datasets/available")
def list_available_datasets():
    """Public endpoint — returns year/period pairs for which a local TIF exists."""
    results = []
    for tif in sorted(_TIF_DIR.glob("*.tif")):
        stem = tif.stem  # e.g. "2024-Jan-Jun"
        dash = stem.find("-")
        if dash > 0:
            try:
                year = int(stem[:dash])
                period = stem[dash + 1:]
                results.append({"year": year, "period": period, "filename": tif.name})
                continue
            except ValueError:
                pass
        # custom / non-standard name
        results.append({"year": None, "period": None, "filename": tif.name})
    return results


@app.get("/api/v1/analytics/model-performance")
def get_model_performance():
    """Return pre-computed RF model performance metrics from model_metrics.json."""
    import json
    metrics_path = pathlib.Path(__file__).parent / "model_metrics.json"
    if not metrics_path.exists():
        raise HTTPException(status_code=404, detail="model_metrics.json not found in backend/")
    with open(metrics_path, "r") as f:
        data = json.load(f)
    def strip_notes(obj):
        if isinstance(obj, dict):
            return {k: strip_notes(v) for k, v in obj.items() if not k.startswith("_")}
        return obj
    return strip_notes(data)


# ── Model metrics compute job ─────────────────────────────────────────────────
import subprocess, sys as _sys

_metrics_proc: subprocess.Popen | None = None
_metrics_stderr_buf: list = []
_metrics_job = {"state": "idle", "started_at": None, "finished_at": None, "error": None}


@app.post("/api/v1/admin/run-model-metrics")
def trigger_model_metrics(current_user: models.User = Depends(auth_module.get_current_user)):
    global _metrics_proc, _metrics_job, _metrics_stderr_buf
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Admins only")
    if _metrics_proc and _metrics_proc.poll() is None:
        return {"status": "already_running"}
    script = pathlib.Path(__file__).parent.parent / "compute_model_metrics.py"
    if not script.exists():
        raise HTTPException(status_code=404, detail="compute_model_metrics.py not found at project root")
    _metrics_stderr_buf = []
    _metrics_proc = subprocess.Popen(
        [_sys.executable, "-u", str(script)],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        cwd=str(script.parent),
    )
    _metrics_job = {"state": "running", "started_at": _now().isoformat(), "finished_at": None, "error": None}
    return {"status": "started"}


@app.get("/api/v1/admin/run-model-metrics/status")
def get_metrics_job_status(current_user: models.User = Depends(auth_module.get_current_user)):
    global _metrics_proc, _metrics_job, _metrics_stderr_buf
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Admins only")
    if _metrics_proc is not None:
        # Drain any new output lines; only safe to read all when process has ended
        if _metrics_proc.poll() is not None:
            try:
                remaining = _metrics_proc.stdout.read()
                if remaining:
                    for line in remaining.splitlines():
                        _metrics_stderr_buf.append(line)
                    if len(_metrics_stderr_buf) > 100:
                        _metrics_stderr_buf = _metrics_stderr_buf[-100:]
            except Exception:
                pass

        rc = _metrics_proc.poll()
        if rc is None:
            _metrics_job["state"] = "running"
        elif rc == 0:
            if _metrics_job["state"] != "done":
                _metrics_job["state"] = "done"
                _metrics_job["finished_at"] = _now().isoformat()
        else:
            if _metrics_job["state"] != "error":
                _metrics_job["state"] = "error"
                last_lines = "\n".join(_metrics_stderr_buf[-10:]) if _metrics_stderr_buf else f"Exit code {rc}"
                _metrics_job["error"] = last_lines or f"Exit code {rc}"
                _metrics_job["finished_at"] = _now().isoformat()

    return {**_metrics_job, "log": _metrics_stderr_buf[-20:] if _metrics_stderr_buf else []}


@app.get("/api/v1/analytics/calabarzon-stats/{year}/{period}")
def get_calabarzon_stats(year: int, period: str, db: Session = Depends(get_db)):
    """Return pixel-count stats per LULC class for the full CALABARZON TIF.
    Results are cached in Supabase (lulc_stats_cache) after the first computation,
    so subsequent requests for the same year/period are instant DB reads.
    Falls back to TIF-only computation if the DB is unavailable.
    """
    import json
    import numpy as np
    import rasterio

    cache_key = f"{year}-{period}"

    # ── 1. Try cache hit ──────────────────────────────────────────────────────
    try:
        cached = db.query(models.LulcStatsCache).filter(
            models.LulcStatsCache.cache_key == cache_key
        ).first()
        if cached:
            return {
                "year": year,
                "period": period,
                "total_pixels": cached.total_pixels,
                "classes": json.loads(cached.stats_json),
                "cached": True,
            }
    except Exception:
        pass  # DB unavailable — fall through to TIF computation

    # ── 2. Compute from TIF ───────────────────────────────────────────────────
    tif_path = _TIF_DIR / f"{year}-{period}.tif"
    if not tif_path.exists():
        raise HTTPException(status_code=404, detail=f"TIF not found: {year}-{period}.tif")

    with rasterio.open(str(tif_path)) as src:
        data = src.read(1)

    class_names = {0: "Water", 1: "Urban", 2: "Forest", 3: "Agriculture"}
    counts = {name: int(np.sum(data == val)) for val, name in class_names.items()}
    total = sum(counts.values())

    if total == 0:
        raise HTTPException(status_code=404, detail="No valid pixels in TIF")

    classes_payload = {
        name: {"pixel_count": cnt, "percentage": round(cnt / total * 100, 1)}
        for name, cnt in counts.items()
    }

    # ── 3. Store result in cache ──────────────────────────────────────────────
    try:
        entry = models.LulcStatsCache(
            cache_key=cache_key,
            year=year,
            period=period,
            total_pixels=total,
            stats_json=json.dumps(classes_payload),
        )
        db.add(entry)
        db.commit()
    except Exception:
        db.rollback()  # Cache write failed — still return the computed result

    return {
        "year": year,
        "period": period,
        "total_pixels": total,
        "classes": classes_payload,
        "cached": False,
    }


# ============================================================
#  EXISTING ENDPOINTS
# ============================================================

@app.get("/get-sar-map/{year}/{period}")
def get_sar_map(year: int, period: str, layer: str = "all", db: Session = Depends(get_db)):
    # Local TIF takes priority — instant tiles, no GEE needed.
    # Only used for layer="all" since the visualized TIF has all classes pre-colored.
    if layer == "all":
        local_url = _local_tile_url(year, period)
        if local_url:
            return {"tile_url": local_url, "from_cache": True, "source": "local"}

    cache_key = f"sar:{year}:{period}:{layer}"

    cached = _get_cached_tile(db, cache_key)
    if cached:
        return {"tile_url": cached, "from_cache": True}

    try:
        year_data = assets.get(year)
        if not year_data:
            return {"error": f"Year {year} not found"}

        asset_id = year_data.get(period)
        if not asset_id:
            return {"error": f"No data available for {period} {year}"}

        sar_image = ee.Image(asset_id).select(0).clip(calabarzon)

        if layer == "urban":
            sar_image = sar_image.updateMask(sar_image.eq(1))
        elif layer == "forest":
            sar_image = sar_image.updateMask(sar_image.eq(2))
        elif layer == "agriculture":
            sar_image = sar_image.updateMask(sar_image.eq(3))

        vis_params = {'min': 0, 'max': 3, 'palette': CLASS_PALETTE}
        map_id = sar_image.getMapId(vis_params)
        tile_url = map_id['tile_fetcher'].url_format
        _set_cached_tile(db, cache_key, tile_url)
        return {"tile_url": tile_url, "from_cache": False}

    except Exception as e:
        return {"error": str(e)}


@app.get("/get-satellite-basemap")
def get_satellite_basemap(db: Session = Depends(get_db)):
    """Single shared basemap — 2-year cloud-free Sentinel-2 median composite.
    Fetched once from GEE and cached permanently; does not change per year/period.
    """
    cache_key = "basemap:latest"

    cached = _get_cached_tile(db, cache_key)
    if cached:
        return {"tile_url": cached, "from_cache": True}

    try:
        def mask_s2_clouds_and_shadows(image):
            scl = image.select('SCL')
            mask = scl.neq(3).And(scl.neq(8)).And(scl.neq(9)).And(scl.neq(10))
            return image.updateMask(mask)

        dataset = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED') \
            .filterDate('2023-01-01', '2024-12-31') \
            .map(mask_s2_clouds_and_shadows) \
            .median() \
            .clip(calabarzon)

        vis_params = {'min': 0, 'max': 3000, 'bands': ['B4', 'B3', 'B2']}
        map_id = dataset.getMapId(vis_params)
        tile_url = map_id['tile_fetcher'].url_format
        _set_cached_tile(db, cache_key, tile_url)
        return {"tile_url": tile_url, "from_cache": False}

    except Exception as e:
        return {"error": str(e)}


@app.get("/get-protected-areas")
def get_protected_areas():
    try:
        protected_areas = ee.FeatureCollection("WCMC/WDPA/current/polygons")
        local_pa = protected_areas.filterBounds(calabarzon)
        styled_pa = local_pa.style(**{
            'color': '00FF00', 'width': 3, 'fillColor': '00FF0022'
        }).clip(calabarzon)
        map_id = styled_pa.getMapId()
        return {"tile_url": map_id['tile_fetcher'].url_format}

    except Exception as e:
        return {"error": str(e)}


@app.get("/query-protected-area")
def query_protected_area(lat: float, lng: float):
    try:
        point = ee.Geometry.Point([lng, lat])
        protected_areas = ee.FeatureCollection("WCMC/WDPA/current/polygons")
        intersecting_pa = protected_areas.filterBounds(point)
        count = intersecting_pa.size().getInfo()

        if count > 0:
            first_pa = intersecting_pa.first()
            pa_name = first_pa.get('NAME').getInfo()
            pa_desig = first_pa.get('DESIG_ENG').getInfo()
            if not pa_desig:
                pa_desig = "Protected Area"
            return {"found": True, "name": pa_name, "desig": pa_desig}
        else:
            return {"found": False, "message": "No Protected Area found at this location."}

    except Exception as e:
        return {"error": str(e)}


@app.get("/query-crop-suitability")
def query_crop_suitability(lat: float, lng: float, month: Optional[int] = None):
    try:
        point = ee.Geometry.Point([lng, lat])

        # --- GEE assets ---
        gadm       = ee.FeatureCollection("projects/sar-calabarzon/assets/gadm41_PHL_3")
        soil_fc    = ee.FeatureCollection("projects/sar-calabarzon/assets/Philippine-Soil-Series-shapefile-20250620T065600Z-1-001")
        stats_fc   = ee.FeatureCollection("projects/sar-calabarzon/assets/historical-data/master_agri_climate_g")
        elev_img   = ee.Image("USGS/SRTMGL1_003")
        slope_img  = ee.Terrain.slope(elev_img).rename('slope')
        lulc_img   = ee.Image("projects/sar-calabarzon/assets/TRY2/2025_S2_LULC_CALABARZON").select(0)

        # --- Terrain ---
        terrain_vals = elev_img.addBands(slope_img).reduceRegion(
            reducer=ee.Reducer.first(), geometry=point, scale=30
        ).getInfo()
        elev_val  = terrain_vals.get('elevation')
        slope_val = terrain_vals.get('slope')
        if elev_val is None or slope_val is None:
            return {"found": False}

        # --- LULC at point ---
        lulc_band = lulc_img.bandNames().get(0).getInfo()
        lulc_val  = lulc_img.reduceRegion(ee.Reducer.first(), point, 10).get(lulc_band).getInfo()
        lulc_names = {0: "Water", 1: "Urban/Built-up", 2: "Forest/High Veg", 3: "Cropland/Open"}
        lulc_label = lulc_names.get(int(lulc_val) if lulc_val is not None else -1, "Unknown")
        is_non_agri = lulc_val in [0, 1]

        # --- NDVI from S2 ---
        s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED') \
            .filterBounds(point) \
            .filterDate('2024-01-01', '2024-12-31') \
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40)) \
            .sort('CLOUDY_PIXEL_PERCENTAGE') \
            .first()
        ndvi_val = None
        try:
            nd = s2.normalizedDifference(['B8', 'B4'])
            result = nd.reduceRegion(ee.Reducer.first(), point, 10).get('nd').getInfo()
            ndvi_val = round(result, 4) if result is not None else None
        except Exception:
            pass

        # --- Admin boundaries (province / municipality / barangay) ---
        CALABARZON = ['Batangas', 'Cavite', 'Laguna', 'Quezon', 'Rizal']
        admin_info = gadm.filterBounds(point).first().getInfo()
        if not admin_info:
            return {"found": False, "reason": "outside_calabarzon"}
        props    = admin_info.get('properties', {})
        province = props.get('NAME_1', 'Unknown')
        if province not in CALABARZON:
            return {"found": False, "reason": "outside_calabarzon"}
        municipality = props.get('NAME_2', 'Unknown')
        barangay     = props.get('NAME_3', 'Unknown')

        # --- Soil series ---
        soil_info   = soil_fc.filterBounds(point).first().getInfo()
        soil_series = (soil_info or {}).get('properties', {}).get('SoilSeries', 'Unknown')

        # --- Top crops from master_agri_climate_g ---
        def get_top_crops(category):
            f = ee.Filter.And(
                ee.Filter.eq('Province', province),
                ee.Filter.eq('Category', category)
            )
            if month:
                f = ee.Filter.And(f, ee.Filter.eq('Month', month))
            feats = stats_fc.filter(f).sort('SuccessRate', False).limit(5).getInfo()
            return [
                {'crop': ft['properties']['Crop'],
                 'rate': round(float(ft['properties']['SuccessRate']), 1)}
                for ft in (feats or {}).get('features', [])
            ]

        top_crops = {}
        if not is_non_agri:
            top_crops = {
                'major':     get_top_crops('Major'),
                'fruit':     get_top_crops('Fruit'),
                'vegetable': get_top_crops('Vegetable'),
            }

        # --- Terrain recommendation (matches GEE logic) ---
        recs = []
        sv = slope_val or 0
        nv = ndvi_val or 0
        if sv < 3:               recs.append("Rice")
        if 3 <= sv <= 12:        recs.append("Corn")
        if nv > 0.4:             recs.append("Banana")
        if not recs:             recs.append("Root Crops")

        return {
            "found": True,
            "location": {"barangay": barangay, "municipality": municipality, "province": province},
            "lulc": {"value": lulc_val, "label": lulc_label, "is_non_agri": is_non_agri},
            "soil": soil_series,
            "elevation": round(elev_val, 1),
            "slope": round(slope_val, 1),
            "ndvi": ndvi_val,
            "terrain_recommendation": recs,
            "top_crops": top_crops,
        }

    except Exception as e:
        print(f"CROP QUERY ERROR: {str(e)}")
        return {"error": str(e)}


@app.get("/get-agri-layer")
def get_agri_layer():
    try:
        agri_image = ee.Image("projects/sar-calabarzon/assets/TRY2/2025_S2_LULC_CALABARZON")
        vis_params = {'min': 3, 'max': 3, 'palette': ['yellow']}
        map_id_dict = ee.Image(agri_image).getMapId(vis_params)
        tile_url = map_id_dict['tile_fetcher'].url_format
        return {"url": tile_url, "status": "success"}

    except Exception as e:
        return {"error": str(e), "status": "failed"}


@app.get("/get-crop-suitability/{year}/{period}")
def get_crop_suitability(year: int, period: str):
    """
    Substitute for the deleted crop suitability GeoTIFF.
    Uses the 2025 S2 LULC Calabarzon asset and shows only
    Agriculture pixels (class 3) in yellow.
    """
    try:
        asset_id = "projects/sar-calabarzon/assets/TRY2/2025_S2_LULC_CALABARZON"
        lulc = ee.Image(asset_id).select(0).clip(calabarzon)
        # eq(3) → binary 0/1; selfMask() hides the 0s so only Agriculture shows
        cropland = lulc.eq(3).selfMask()
        vis_params = {'min': 1, 'max': 1, 'palette': ['#ca8a04']}
        map_id = cropland.getMapId(vis_params)
        return {"tile_url": map_id['tile_fetcher'].url_format}

    except Exception as e:
        return {"error": str(e)}


# ============================================================
#  LULC CHANGE ANALYTICS
# ============================================================

class GeoJSONPolygon(BaseModel):
    type: str = "Polygon"
    coordinates: List[List[List[float]]]


class LULCAnalyticsRequest(BaseModel):
    geometry: GeoJSONPolygon
    start_year: int
    end_year: int


class CropIntensityRequest(BaseModel):
    geometry: GeoJSONPolygon
    start_year: int
    end_year: int


def _get_available_assets(start_year: int, end_year: int) -> list:
    available = []
    for yr in range(start_year, end_year + 1):
        year_data = assets.get(yr)
        if not year_data:
            continue
        for period_name, asset_id in year_data.items():
            if asset_id:
                available.append((yr, period_name, asset_id))
    return available


def _list_available_periods() -> str:
    periods = []
    for yr, period_data in assets.items():
        for period_name, asset_id in period_data.items():
            if asset_id:
                periods.append(f"{yr} {period_name}")
    return ", ".join(periods) if periods else "None"


@app.post("/api/v1/analytics/lulc-change")
async def get_lulc_change(request: LULCAnalyticsRequest):
    try:
        roi = ee.Geometry.Polygon(request.geometry.coordinates)
        available = _get_available_assets(request.start_year, request.end_year)

        if not available:
            return {
                "status": "error",
                "message": f"No LULC data available between {request.start_year} and {request.end_year}. "
                           f"Available periods: {_list_available_periods()}"
            }

        analytics = []
        for yr, period_name, asset_id in available:
            image = ee.Image(asset_id).select(0).clip(roi)
            histogram = image.reduceRegion(
                reducer=ee.Reducer.frequencyHistogram(),
                geometry=roi,
                scale=10,
                maxPixels=1e10,
                bestEffort=True
            )

            band_name = image.bandNames().get(0).getInfo()
            hist_dict = histogram.get(band_name).getInfo()

            if not hist_dict:
                continue

            total_pixels = sum(hist_dict.values())
            class_data = {}

            if total_pixels > 0:
                for class_val_str, pixel_count in hist_dict.items():
                    class_val = int(float(class_val_str))
                    class_name = CLASS_MAP.get(class_val, f"Class {class_val}")
                    class_data[class_name] = {
                        "percentage": round((pixel_count / total_pixels) * 100, 2),
                        "pixel_count": pixel_count
                    }

            analytics.append({
                "year": yr,
                "period": period_name,
                "label": f"{yr} {period_name}",
                "total_pixels": total_pixels,
                "classes": class_data
            })

        analytics.sort(key=lambda x: (x['year'], 0 if x['period'] == 'Jan-Jun' else 1))
        return {"status": "success", "analytics": analytics}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
#  CROP INTENSITY & CROP TYPE ANALYSIS
# ============================================================
#
#  APPROACH:
#  ─────────
#  For each year in the requested range, within the drawn polygon:
#
#  1. SAR BACKSCATTER TIMELINE (Sentinel-1 VH, monthly medians)
#     → Returns 12 monthly VH values for the agricultural pixels.
#     → Used to visualize the SAR temporal signature on the frontend.
#
#  2. NDVI CROPPING CYCLE DETECTION (Sentinel-2, monthly medians)
#     → Computes monthly NDVI for agricultural pixels.
#     → Counts "peaks" (months where NDVI rises then falls) to detect
#       how many cropping cycles occurred that year.
#     → 0 peaks = fallow, 1 = single crop, 2 = double, 3+ = triple.
#
#  3. CROP TYPE ESTIMATION
#     → Combines elevation + NDVI range + peak timing to estimate
#       the most likely crop for CALABARZON agriculture:
#       - Low elevation (<100m) + sharp NDVI dips = Rice (flooded paddy)
#       - Low-mid elevation + steady moderate NDVI = Corn
#       - Mid elevation (100-500m) + high stable NDVI = Coconut
#       - High elevation (>500m) + moderate NDVI = Coffee / Cacao
#
#  4. AREA UTILIZATION
#     → What percentage of the agricultural land was actively used
#       (had at least one NDVI peak above 0.3) vs left fallow.
#
# ============================================================

MIN_CROPLAND_PIXELS = 100  # ~1 ha at 10 m resolution — filters classification noise


def _get_agri_mask_for_year(year: int, roi: ee.Geometry) -> tuple:
    """
    Builds an Agriculture (class 3) binary mask for the given year.

    Strategy:
      - If BOTH semesters are available → pixel must be Agriculture in BOTH
        (intersection/AND — consistent with the crop-area endpoint and avoids noise).
      - If only ONE semester is available → use that semester alone.
      - Fewer than MIN_CROPLAND_PIXELS after masking → treated as no cropland.

    Returns:
        (agri_mask: ee.Image | None, cropland_pixels: int)
        agri_mask is None when no valid cropland is found.
    """
    year_data = assets.get(year)
    if not year_data:
        return None, 0

    semester_masks = []
    for asset_id in year_data.values():
        if not asset_id:
            continue
        try:
            img = ee.Image(asset_id).select(0).clip(roi)
            semester_masks.append(img.eq(3))  # Agriculture = class 3
        except Exception:
            continue

    if not semester_masks:
        return None, 0

    # Intersection when both semesters are present; otherwise use the one available
    if len(semester_masks) >= 2:
        combined = semester_masks[0]
        for m in semester_masks[1:]:
            combined = combined.And(m)
    else:
        combined = semester_masks[0]

    agri_mask = combined  # binary 0/1 image

    # Count cropland pixels
    band_name = agri_mask.bandNames().get(0).getInfo()
    count_result = agri_mask.reduceRegion(
        reducer=ee.Reducer.sum(),
        geometry=roi,
        scale=10,
        maxPixels=1e9,
        bestEffort=True
    ).get(band_name).getInfo()

    cropland_pixels = int(count_result or 0)

    # Reject if below minimum — prevents noise pixels from triggering analysis
    if cropland_pixels < MIN_CROPLAND_PIXELS:
        print(
            f"  {year}: only {cropland_pixels} cropland pixel(s) found "
            f"(minimum required: {MIN_CROPLAND_PIXELS}) — skipping."
        )
        return None, 0

    return agri_mask, cropland_pixels


def _compute_monthly_sar_vh(year: int, roi: ee.Geometry, agri_mask: 'ee.Image | None' = None) -> list:
    """
    Compute monthly median VH backscatter (dB) over cropland pixels in the ROI.
    agri_mask: binary ee.Image (1 = Agriculture). When provided, statistics are
               restricted to those pixels only.
    Returns list of 12 dicts: [{month: 1, vh_mean: -14.2}, ...]
    """
    monthly_vh = []
    for month in range(1, 13):
        start = f'{year}-{month:02d}-01'
        end = f'{year + 1}-01-01' if month == 12 else f'{year}-{month + 1:02d}-01'

        s1 = ee.ImageCollection('COPERNICUS/S1_GRD') \
            .filterBounds(roi) \
            .filterDate(start, end) \
            .filter(ee.Filter.eq('instrumentMode', 'IW')) \
            .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH')) \
            .select('VH')

        count = s1.size().getInfo()

        if count > 0:
            monthly_median = s1.median()
            if agri_mask is not None:
                monthly_median = monthly_median.updateMask(agri_mask)
            vh_val = monthly_median.reduceRegion(
                reducer=ee.Reducer.mean(),
                geometry=roi,
                scale=10,
                maxPixels=1e9,
                bestEffort=True
            ).get('VH').getInfo()
        else:
            vh_val = None

        monthly_vh.append({
            "month": month,
            "vh_mean": round(vh_val, 2) if vh_val is not None else None
        })

    return monthly_vh


def _compute_monthly_ndvi(year: int, roi: ee.Geometry, agri_mask: 'ee.Image | None' = None) -> list:
    """
    Compute monthly median NDVI over cropland pixels in the ROI.
    agri_mask: binary ee.Image (1 = Agriculture). When provided, statistics are
               restricted to those pixels only.
    Returns list of 12 dicts: [{month: 1, ndvi_mean: 0.45}, ...]
    """
    monthly_ndvi = []
    for month in range(1, 13):
        start = f'{year}-{month:02d}-01'
        end = f'{year + 1}-01-01' if month == 12 else f'{year}-{month + 1:02d}-01'

        def add_ndvi(image):
            ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI')
            return image.addBands(ndvi)

        def mask_clouds(image):
            scl = image.select('SCL')
            mask = scl.neq(3).And(scl.neq(8)).And(scl.neq(9)).And(scl.neq(10))
            return image.updateMask(mask)

        s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED') \
            .filterBounds(roi) \
            .filterDate(start, end) \
            .map(mask_clouds) \
            .map(add_ndvi)

        count = s2.size().getInfo()

        if count > 0:
            monthly_median = s2.select('NDVI').median()
            if agri_mask is not None:
                monthly_median = monthly_median.updateMask(agri_mask)
            ndvi_val = monthly_median.reduceRegion(
                reducer=ee.Reducer.mean(),
                geometry=roi,
                scale=10,
                maxPixels=1e9,
                bestEffort=True
            ).get('NDVI').getInfo()
        else:
            ndvi_val = None

        monthly_ndvi.append({
            "month": month,
            "ndvi_mean": round(ndvi_val, 4) if ndvi_val is not None else None
        })

    return monthly_ndvi


def _detect_cropping_cycles(ndvi_series: list, threshold: float = 0.3) -> dict:
    """
    Detects cropping cycles from monthly NDVI values.
    A "cycle" = NDVI rises above threshold, then falls back down.
    
    Returns:
        cycles: int (number of cropping cycles detected)
        peak_months: list of month numbers where peaks occurred
        active_months: int (months with NDVI above threshold)
        fallow_months: int (months with NDVI below threshold or no data)
        max_ndvi: float
        mean_ndvi: float
    """
    values = [entry['ndvi_mean'] for entry in ndvi_series]

    # Replace None with 0 for peak detection
    clean = [v if v is not None else 0.0 for v in values]

    # Detect peaks: a month where NDVI is higher than both neighbors and above threshold
    peaks = []
    for i in range(1, 11):  # months 2-11 (index 1-10)
        if clean[i] >= threshold and clean[i] > clean[i - 1] and clean[i] > clean[i + 1]:
            peaks.append(i + 1)  # Convert to 1-indexed month

    # Also check edges (Jan and Dec) with single-neighbor comparison
    if clean[0] >= threshold and clean[0] > clean[1]:
        peaks.insert(0, 1)
    if clean[11] >= threshold and clean[11] > clean[10]:
        peaks.append(12)

    # Merge peaks that are too close (within 2 months = same cycle)
    merged_peaks = []
    for p in peaks:
        if not merged_peaks or p - merged_peaks[-1] > 2:
            merged_peaks.append(p)

    valid_values = [v for v in values if v is not None]
    active = sum(1 for v in clean if v >= threshold)

    return {
        "cycles": len(merged_peaks),
        "peak_months": merged_peaks,
        "active_months": active,
        "fallow_months": 12 - active,
        "max_ndvi": round(max(valid_values), 4) if valid_values else 0.0,
        "mean_ndvi": round(sum(valid_values) / len(valid_values), 4) if valid_values else 0.0
    }


def _estimate_crop_type(elevation: float, ndvi_stats: dict, peak_months: list) -> list:
    """
    Estimates probable crop types based on CALABARZON agricultural patterns.
    
    Returns list of dicts: [{crop, confidence, reasoning}, ...]
    """
    crops = []
    mean_ndvi = ndvi_stats.get('mean_ndvi', 0)
    max_ndvi = ndvi_stats.get('max_ndvi', 0)
    cycles = ndvi_stats.get('cycles', 0)

    if elevation < 100:
        # Lowland: Rice-dominant area in CALABARZON
        if cycles >= 2:
            crops.append({
                "crop": "Rice (Irrigated)",
                "confidence": "High",
                "reasoning": f"{cycles} cropping cycles detected in lowland area — consistent with irrigated rice paddies common in Laguna and Quezon."
            })
        elif cycles == 1:
            crops.append({
                "crop": "Rice (Rainfed)",
                "confidence": "Medium",
                "reasoning": "Single cropping cycle in lowland — likely rainfed rice with one wet-season planting."
            })

        if mean_ndvi > 0.3 and mean_ndvi < 0.5:
            crops.append({
                "crop": "Lowland Vegetables",
                "confidence": "Medium",
                "reasoning": "Moderate NDVI in lowland suggests mixed vegetable farming between rice cycles."
            })

    elif elevation < 500:
        # Mid-elevation: Coconut, Corn, Fruit Trees
        if max_ndvi > 0.6 and cycles <= 1:
            crops.append({
                "crop": "Coconut",
                "confidence": "High",
                "reasoning": "High, stable NDVI with minimal seasonal variation — characteristic of coconut plantations in Quezon province."
            })
        
        if cycles >= 2:
            crops.append({
                "crop": "Corn",
                "confidence": "Medium",
                "reasoning": f"{cycles} cropping cycles at mid-elevation — consistent with corn which is commonly double-cropped."
            })

        if max_ndvi > 0.5 and cycles <= 1:
            crops.append({
                "crop": "Fruit Trees (Mango, Calamansi)",
                "confidence": "Low",
                "reasoning": "Steady canopy NDVI at mid-elevation could indicate fruit tree orchards."
            })

    else:
        # Highland: Coffee, Cacao
        if mean_ndvi > 0.4:
            crops.append({
                "crop": "Coffee",
                "confidence": "Medium",
                "reasoning": "Moderate-high NDVI at highland elevation — suitable for Arabica/Robusta coffee grown in Batangas uplands."
            })
            crops.append({
                "crop": "Cacao",
                "confidence": "Low",
                "reasoning": "Highland area with sustained vegetation could support cacao cultivation."
            })
        else:
            crops.append({
                "crop": "Highland Vegetables",
                "confidence": "Medium",
                "reasoning": "Moderate NDVI at high elevation — possibly mixed highland vegetable farming."
            })

    # Fallback if nothing matched
    if not crops:
        crops.append({
            "crop": "Mixed Agriculture",
            "confidence": "Low",
            "reasoning": "Insufficient seasonal signal to determine specific crop type. May be mixed-use agricultural land."
        })

    return crops


@app.post("/api/v1/analytics/crop-intensity")
async def get_crop_intensity(request: CropIntensityRequest):
    """
    Analyzes crop intensity (cropping cycles per year), SAR backscatter 
    timeline, NDVI timeline, and estimated crop types for the drawn polygon 
    across the requested year range.
    """
    try:
        roi = ee.Geometry.Polygon(request.geometry.coordinates)

        # 1. Get mean elevation for the area (used for crop type estimation)
        elevation_img = ee.Image("USGS/SRTMGL1_003")
        mean_elevation = elevation_img.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=roi,
            scale=30,
            bestEffort=True
        ).get('elevation').getInfo()

        if mean_elevation is None:
            mean_elevation = 0.0

        # 1b. Get province from polygon centroid → query historical dominant crop
        CALABARZON = ['Batangas', 'Cavite', 'Laguna', 'Quezon', 'Rizal']
        dominant_crop_historical = None
        try:
            centroid = roi.centroid(maxError=1)
            gadm = ee.FeatureCollection("projects/sar-calabarzon/assets/gadm41_PHL_3")
            admin_info = gadm.filterBounds(centroid).first().getInfo()
            province = (admin_info or {}).get('properties', {}).get('NAME_1') if admin_info else None
            if province and province in CALABARZON:
                stats_fc = ee.FeatureCollection("projects/sar-calabarzon/assets/historical-data/master_agri_climate_g")
                top = stats_fc.filter(
                    ee.Filter.And(
                        ee.Filter.eq('Province', province),
                        ee.Filter.eq('Category', 'Major')
                    )
                ).sort('SuccessRate', False).first().getInfo()
                if top:
                    dominant_crop_historical = top['properties'].get('Crop')
        except Exception as e:
            print(f"Historical dominant crop lookup failed: {e}")

        # 2. Process each year
        yearly_results = []
        skipped_years = []

        for year in range(request.start_year, request.end_year + 1):
            # 2a. Check for cropland — skip the year if none found
            agri_mask, cropland_pixels = _get_agri_mask_for_year(year, roi)
            if cropland_pixels == 0:
                skipped_years.append(year)
                continue

            print(f"{year}: {cropland_pixels} cropland pixels found — running analysis")

            # 2b. Monthly SAR VH backscatter (masked to cropland only)
            sar_timeline = _compute_monthly_sar_vh(year, roi, agri_mask)

            # 2c. Monthly NDVI (masked to cropland only)
            ndvi_timeline = _compute_monthly_ndvi(year, roi, agri_mask)

            # 2d. Detect cropping cycles from NDVI
            cycle_info = _detect_cropping_cycles(ndvi_timeline)

            # 2e. Estimate crop types
            estimated_crops = _estimate_crop_type(
                mean_elevation, cycle_info, cycle_info['peak_months']
            )

            # 2f. Classify intensity label
            cycles = cycle_info['cycles']
            if cycles == 0:
                intensity_label = "Fallow / Inactive"
            elif cycles == 1:
                intensity_label = "Single Crop"
            elif cycles == 2:
                intensity_label = "Double Crop"
            else:
                intensity_label = "Triple Crop / Intensive"

            # 2g. Calculate utilization rate
            utilization = round((cycle_info['active_months'] / 12) * 100, 1)

            yearly_results.append({
                "year": year,
                "intensity_label": intensity_label,
                "cropping_cycles": cycles,
                "peak_months": cycle_info['peak_months'],
                "active_months": cycle_info['active_months'],
                "fallow_months": cycle_info['fallow_months'],
                "utilization_percent": utilization,
                "max_ndvi": cycle_info['max_ndvi'],
                "mean_ndvi": cycle_info['mean_ndvi'],
                "estimated_crops": estimated_crops,
                "ndvi_timeline": ndvi_timeline,
                "sar_timeline": sar_timeline
            })

        # 3. Bail out if no year had any cropland
        if not yearly_results:
            return {
                "status": "no_cropland",
                "message": (
                    f"No cropland (Agriculture) pixels were found inside the drawn polygon "
                    f"for any year in {request.start_year}–{request.end_year}. "
                    f"Try drawing your area over a farm or rice field."
                ),
                "skipped_years": skipped_years
            }

        # 4. Compute multi-year summary
        total_years = len(yearly_results)
        avg_cycles = round(sum(r['cropping_cycles'] for r in yearly_results) / total_years, 1) if total_years > 0 else 0
        avg_utilization = round(sum(r['utilization_percent'] for r in yearly_results) / total_years, 1) if total_years > 0 else 0
        avg_ndvi = round(sum(r['mean_ndvi'] for r in yearly_results) / total_years, 4) if total_years > 0 else 0

        # Dominant crop: prefer historical data, fall back to SAR-estimated
        if dominant_crop_historical:
            dominant_crop = dominant_crop_historical
        else:
            all_crops = {}
            for r in yearly_results:
                for c in r['estimated_crops']:
                    all_crops[c['crop']] = all_crops.get(c['crop'], 0) + 1
            dominant_crop = max(all_crops, key=all_crops.get) if all_crops else "Unknown"

        summary = {
            "total_years_analyzed": total_years,
            "average_cycles_per_year": avg_cycles,
            "average_utilization_percent": avg_utilization,
            "average_ndvi": avg_ndvi,
            "dominant_crop": dominant_crop,
            "elevation_m": round(mean_elevation, 1)
        }

        return {
            "status": "success",
            "summary": summary,
            "yearly": yearly_results
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
#  CROP AREA COVERAGE
#  A pixel is counted as cropland ONLY if BOTH SEM1 and SEM2
#  classify it as Agriculture (class 3).
# ============================================================

CROPLAND_CLASS = 3  # Agriculture in CLASS_MAP


class CropAreaRequest(BaseModel):
    geometry: GeoJSONPolygon
    start_year: int
    end_year: int


class YearlyCropData(BaseModel):
    year: int
    crop_percentage: float
    crop_area_ha: float
    total_area_ha: float


class CropAreaResponse(BaseModel):
    yearly_data: list[YearlyCropData]
    overall_avg_percentage: float


def _load_asset_safe(asset_id: str):
    """Returns an ee.Image if the asset exists, or None if not."""
    try:
        img = ee.Image(asset_id)
        img.getInfo()  # verify existence
        return img
    except Exception:
        return None


@app.post("/api/v1/analytics/crop-area", response_model=CropAreaResponse)
async def get_crop_area(request: CropAreaRequest):
    """
    For each year in the requested range, computes the percentage and
    area (ha) of the drawn polygon classified as Agriculture in BOTH
    semesters. Uses the existing LULC assets registry.
    """
    if request.start_year > request.end_year:
        raise HTTPException(400, "start_year must be <= end_year")

    roi = ee.Geometry.Polygon(request.geometry.coordinates)
    yearly_results = []

    for year in range(request.start_year, request.end_year + 1):
        year_data = assets.get(year)
        if not year_data:
            continue

        sem1_id = year_data.get("Jan-Jun", "")
        sem2_id = year_data.get("Jul-Dec", "")

        if not sem1_id or not sem2_id:
            continue

        sem1 = _load_asset_safe(sem1_id)
        sem2 = _load_asset_safe(sem2_id)

        if sem1 is None or sem2 is None:
            continue

        # Select first band from each semester
        sem1 = sem1.select(0)
        sem2 = sem2.select(0)

        # Pixel is cropland only if both semesters agree on Agriculture (class 3)
        is_crop = sem1.eq(CROPLAND_CLASS).And(sem2.eq(CROPLAND_CLASS))

        band_name = sem1.bandNames().get(0).getInfo()

        proportion = is_crop.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=roi,
            scale=10,
            maxPixels=1e9,
            bestEffort=True,
        ).get(band_name).getInfo()

        total_pixels = is_crop.reduceRegion(
            reducer=ee.Reducer.count(),
            geometry=roi,
            scale=10,
            maxPixels=1e9,
            bestEffort=True,
        ).get(band_name).getInfo()

        crop_pixels = is_crop.reduceRegion(
            reducer=ee.Reducer.sum(),
            geometry=roi,
            scale=10,
            maxPixels=1e9,
            bestEffort=True,
        ).get(band_name).getInfo()

        if proportion is None or total_pixels is None:
            continue

        yearly_results.append(YearlyCropData(
            year=year,
            crop_percentage=round((proportion or 0) * 100, 2),
            crop_area_ha=round((crop_pixels or 0) * 0.01, 2),   # 10m pixel = 0.01 ha
            total_area_ha=round((total_pixels or 0) * 0.01, 2),
        ))

    if not yearly_results:
        raise HTTPException(
            status_code=404,
            detail="No LULC data found with both semesters available for the selected range.",
        )

    overall_avg = round(
        sum(r.crop_percentage for r in yearly_results) / len(yearly_results), 2
    )

    return CropAreaResponse(yearly_data=yearly_results, overall_avg_percentage=overall_avg)


# ============================================================
#  ROLE PERMISSIONS  (public read — no auth required)
# ============================================================

@app.get("/role-permissions/{role}")
def get_role_permissions(role: str, db: Session = Depends(get_db)):
    """Return feature flags for a given role.
    Used by the frontend after login to gate UI features.
    Falls back to all-enabled defaults if no row exists yet.
    """
    import json as _json
    row = db.query(models.RolePermission).filter(models.RolePermission.role == role).first()
    if row is None:
        from admin import ALL_FEATURES, DEFAULT_PERMISSIONS
        return {"role": role, "permissions": DEFAULT_PERMISSIONS}
    perms = _json.loads(row.permissions)
    from admin import ALL_FEATURES
    for f in ALL_FEATURES:
        perms.setdefault(f, True)
    return {"role": role, "permissions": perms}


# ============================================================
#  HEALTH CHECK
# ============================================================

@app.get("/")
def read_root():
    return {"status": "SAR Backend is running!"}


# ============================================================
#  AUTH — REGISTER & LOGIN
# ============================================================

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    institution: Optional[str] = None
    role: str = "Researcher"


class LoginRequest(BaseModel):
    email: str
    password: str


class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    institution: Optional[str] = None


class SaveAOIRequest(BaseModel):
    name: str
    description: Optional[str] = None
    geojson: str  # JSON string of [{lat, lng}, ...] array


def user_to_dict(user: models.User) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "institution": user.institution,
        "role": user.role,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


def _resolve_permissions(user: models.User, db) -> dict:
    """Return the effective permissions for a user.
    User-specific overrides take priority; falls back to role defaults."""
    import json as _json
    from admin import ALL_FEATURES, DEFAULT_PERMISSIONS

    if user.permissions:
        perms = _json.loads(user.permissions)
    else:
        row = db.query(models.RolePermission).filter(
            models.RolePermission.role == user.role
        ).first()
        perms = _json.loads(row.permissions) if row else dict(DEFAULT_PERMISSIONS)

    for f in ALL_FEATURES:
        perms.setdefault(f, True)
    return perms


@app.post("/auth/register")
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.email == req.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = models.User(
        name=req.name,
        email=req.email,
        password_hash=auth_module.hash_password(req.password),
        institution=req.institution,
        role=req.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = auth_module.create_token(user.id)
    return {"access_token": token, "token_type": "bearer", "user": user_to_dict(user)}


@app.post("/auth/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == req.email).first()
    if not user or not auth_module.verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = auth_module.create_token(user.id)
    return {"access_token": token, "token_type": "bearer", "user": user_to_dict(user)}


# ============================================================
#  PROFILE — GET & UPDATE
# ============================================================

@app.get("/profile/me")
def get_me(current_user: models.User = Depends(auth_module.get_current_user)):
    return user_to_dict(current_user)


@app.get("/profile/permissions")
def get_my_permissions(
    current_user: models.User = Depends(auth_module.get_current_user),
    db: Session = Depends(get_db),
):
    """Return the effective feature permissions for the authenticated user.
    User-specific overrides take priority over role defaults.
    """
    return {"role": current_user.role, "permissions": _resolve_permissions(current_user, db)}


@app.put("/profile/me")
def update_me(
    req: UpdateProfileRequest,
    current_user: models.User = Depends(auth_module.get_current_user),
    db: Session = Depends(get_db),
):
    if req.name is not None:
        current_user.name = req.name
    if req.institution is not None:
        current_user.institution = req.institution
    db.commit()
    db.refresh(current_user)
    return user_to_dict(current_user)


@app.delete("/profile/me")
def delete_me(
    current_user: models.User = Depends(auth_module.get_current_user),
    db: Session = Depends(get_db),
):
    db.delete(current_user)
    db.commit()
    return {"message": "Account deleted"}


# ============================================================
#  SAVED AOIs — LIST, SAVE, DELETE
# ============================================================

def aoi_to_dict(aoi: models.SavedAOI) -> dict:
    return {
        "id": aoi.id,
        "name": aoi.name,
        "description": aoi.description,
        "geojson": aoi.geojson,
        "created_at": aoi.created_at.isoformat() if aoi.created_at else None,
    }


@app.get("/profile/aois")
def list_aois(current_user: models.User = Depends(auth_module.get_current_user)):
    return [aoi_to_dict(a) for a in current_user.aois]


@app.post("/profile/aois")
def save_aoi(
    req: SaveAOIRequest,
    current_user: models.User = Depends(auth_module.get_current_user),
    db: Session = Depends(get_db),
):
    aoi = models.SavedAOI(
        user_id=current_user.id,
        name=req.name,
        description=req.description,
        geojson=req.geojson,
    )
    db.add(aoi)
    db.commit()
    db.refresh(aoi)
    return aoi_to_dict(aoi)


@app.delete("/profile/aois/{aoi_id}")
def delete_aoi(
    aoi_id: int,
    current_user: models.User = Depends(auth_module.get_current_user),
    db: Session = Depends(get_db),
):
    aoi = db.query(models.SavedAOI).filter(
        models.SavedAOI.id == aoi_id,
        models.SavedAOI.user_id == current_user.id
    ).first()
    if not aoi:
        raise HTTPException(status_code=404, detail="AOI not found")
    db.delete(aoi)
    db.commit()
    return {"message": "Deleted"}