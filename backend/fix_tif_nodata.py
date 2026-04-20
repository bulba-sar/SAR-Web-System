import ee
import numpy as np
import rasterio
import shutil
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
boundary_geom = calabarzon.geometry().getInfo()
print("  Boundary fetched.\n")

# ── Process each TIF ─────────────────────────────────────────────────────────
TIF_DIR = Path(__file__).parent / "tif"
NODATA = 255
OVERVIEW_LEVELS = [2, 4, 8, 16, 32, 64]

tifs = sorted(TIF_DIR.glob("*.tif"))
if not tifs:
    print("No TIF files found in backend/tif/")
else:
    for tif_path in tifs:
        print(f"Processing {tif_path.name} ...", flush=True)

        with rasterio.open(tif_path) as ds:
            n_bands = ds.count

            outside = geometry_mask(
                [boundary_geom],
                out_shape=(ds.height, ds.width),
                transform=ds.transform,
                invert=False,
            )
            changed = int(outside.sum())

            if n_bands == 1:
                # ── Single-band LULC TIF: set outside pixels to nodata=255 ──
                data = ds.read(1)
                data[outside] = NODATA
                profile = ds.profile.copy()

            else:
                # ── Multi-band (e.g. RGB basemap): build RGBA with alpha=0 outside
                data_bands = ds.read()          # shape: (bands, H, W)
                alpha = np.where(outside, 0, 255).astype(np.uint8)
                data = np.vstack([data_bands, alpha[np.newaxis, ...]])  # (bands+1, H, W)
                profile = ds.profile.copy()
                profile.update(count=n_bands + 1, nodata=None)

        if n_bands == 1:
            with rasterio.open(tif_path, "r+") as ds:
                ds.write(data, 1)
                ds.nodata = NODATA
            print(f"  Set {changed:,} outside pixels → {NODATA} (nodata).")
        else:
            # Write to a temp file then replace original (can't add bands in-place)
            tmp_path = tif_path.with_suffix(".tmp.tif")
            with rasterio.open(tmp_path, "w", **profile) as dst:
                dst.write(data)
            shutil.move(str(tmp_path), str(tif_path))
            print(f"  Added alpha channel; set {changed:,} outside pixels → transparent.")

        # Rebuild overviews
        print(f"  Rebuilding overviews...", end=" ", flush=True)
        with rasterio.open(tif_path, "r+") as ds:
            ds.build_overviews(OVERVIEW_LEVELS, Resampling.nearest)
            ds.update_tags(ns="rio_overview", resampling="nearest")
        print("done.\n")

    print(f"All {len(tifs)} file(s) processed. Restart the FastAPI server.")
