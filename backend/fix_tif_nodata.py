"""
Run this once to fix existing LULC TIF files so the background outside
CALABARZON becomes transparent when served via the local tile endpoint.

What it does:
  1. Fetches the CALABARZON boundary polygon from GEE
  2. For each single-band TIF in backend/tif/:
     - Sets pixels OUTSIDE the boundary to value 255 (nodata marker)
     - Records nodata=255 in the GeoTIFF metadata
  3. Rebuilds overviews so the fixed TIF stays fast

After running this, restart the FastAPI server — no other changes needed.

Usage (from backend/ directory):
    ../.venv/Scripts/python fix_tif_nodata.py
"""

import ee
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.features import geometry_mask
from google.oauth2 import service_account
from pathlib import Path

# ── GEE init (same credentials as main.py) ──────────────────────────────────
KEY_FILE = Path(__file__).parent / "credentials.json"
credentials = service_account.Credentials.from_service_account_file(str(KEY_FILE))
scoped = credentials.with_scopes(["https://www.googleapis.com/auth/earthengine"])
ee.Initialize(scoped, project="sar-calabarzon")

# ── Fetch CALABARZON boundary ────────────────────────────────────────────────
print("Fetching CALABARZON boundary from GEE...", flush=True)
calabarzon = (
    ee.FeatureCollection("FAO/GAUL/2015/level2")
    .filter(ee.Filter.inList("ADM2_NAME", ["Batangas", "Cavite", "Laguna", "Quezon", "Rizal"]))
)
boundary_geom = calabarzon.geometry().getInfo()   # GeoJSON geometry dict
print("  Boundary fetched.\n")

# ── Process each single-band TIF ─────────────────────────────────────────────
TIF_DIR  = Path(__file__).parent / "tif"
NODATA   = 255
OVERVIEW_LEVELS = [2, 4, 8, 16, 32, 64]

tifs = sorted(TIF_DIR.glob("*.tif"))
if not tifs:
    print("No TIF files found in backend/tif/")
else:
    for tif_path in tifs:
        print(f"Processing {tif_path.name} ...", flush=True)

        with rasterio.open(tif_path, "r+") as ds:
            if ds.count != 1:
                print(f"  SKIPPED — {ds.count} bands (not a single-band class TIF)\n")
                continue

            # Build a boolean mask: True = outside CALABARZON (pixels to fill)
            outside = geometry_mask(
                [boundary_geom],
                out_shape=(ds.height, ds.width),
                transform=ds.transform,
                invert=False,   # False = outside=True, inside=False
            )

            data = ds.read(1)
            changed = int(outside.sum())
            data[outside] = NODATA
            ds.write(data, 1)
            ds.nodata = NODATA

            print(f"  Set {changed:,} outside pixels → {NODATA} (nodata).")

        # Rebuild overviews so the patched TIF stays performant
        print(f"  Rebuilding overviews...", end=" ", flush=True)
        with rasterio.open(tif_path, "r+") as ds:
            ds.build_overviews(OVERVIEW_LEVELS, Resampling.nearest)
            ds.update_tags(ns="rio_overview", resampling="nearest")
        print("done.\n")

    print(f"All {len(tifs)} file(s) processed. Restart the FastAPI server.")
