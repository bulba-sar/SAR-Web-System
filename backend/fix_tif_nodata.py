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

TIF_DIR     = Path(__file__).parent / "tif"
BASEMAP_DIR = Path(__file__).parent / "basemap"
NODATA = 255
OVERVIEW_LEVELS = [2, 4, 8, 16, 32, 64]
_PROCESSED_TAG = "sar_web_processed"


def _outside_mask(ds):
    """Boolean array: True where pixel is outside CALABARZON boundary."""
    return geometry_mask(
        [boundary_geom],
        out_shape=(ds.height, ds.width),
        transform=ds.transform,
        invert=False,
    )


def _rebuild_overviews(tif_path):
    with rasterio.open(tif_path, "r+") as ds:
        ds.build_overviews(OVERVIEW_LEVELS, Resampling.nearest)
        ds.update_tags(ns="rio_overview", resampling="nearest")


def _is_lulc_processed(tif_path):
    """True if this single-band LULC file already has nodata=255 set."""
    with rasterio.open(tif_path) as ds:
        return ds.nodata == NODATA


def _is_basemap_processed(tif_path):
    """True if basemap was already processed by this script (has our tag)."""
    with rasterio.open(tif_path) as ds:
        tags = ds.tags()
        return tags.get(_PROCESSED_TAG) == "1"


# ── Process LULC TIFs (single-band) in backend/tif/ ─────────────────────────
tifs = sorted(TIF_DIR.glob("*.tif"))
if not tifs:
    print("No TIF files found in backend/tif/")
else:
    for tif_path in tifs:
        if _is_lulc_processed(tif_path):
            print(f"Skipping {tif_path.name} (already processed).")
            continue

        print(f"Processing {tif_path.name} ...", flush=True)

        with rasterio.open(tif_path) as ds:
            n_bands = ds.count
            outside = _outside_mask(ds)

            if n_bands == 1:
                data = ds.read(1)
                data[outside] = NODATA
                profile = ds.profile.copy()
            else:
                data_bands = ds.read()
                alpha = np.where(outside, 0, 255).astype(np.uint8)
                data = np.vstack([data_bands, alpha[np.newaxis, ...]])
                profile = ds.profile.copy()
                profile.update(count=n_bands + 1, nodata=None)

        if n_bands == 1:
            with rasterio.open(tif_path, "r+") as ds:
                ds.write(data, 1)
                ds.nodata = NODATA
            print(f"  Set {int(outside.sum()):,} outside pixels to {NODATA} (nodata).")
        else:
            tmp = tif_path.with_suffix(".tmp.tif")
            with rasterio.open(tmp, "w", **profile) as dst:
                dst.write(data)
            shutil.move(str(tmp), str(tif_path))
            print(f"  Added alpha; set {int(outside.sum()):,} outside pixels to transparent.")

        print(f"  Rebuilding overviews...", end=" ", flush=True)
        _rebuild_overviews(tif_path)
        print("done.\n")

    print(f"All {len(tifs)} LULC file(s) checked.\n")


# ── Process basemap in backend/basemap/ ──────────────────────────────────────
basemap_path = BASEMAP_DIR / "basemap.tif"
if not basemap_path.exists():
    print("basemap.tif not found in backend/basemap/ — skipping.")
elif _is_basemap_processed(basemap_path):
    print("Skipping basemap.tif (already processed).")
else:
    print("Processing basemap.tif ...", flush=True)

    with rasterio.open(basemap_path) as ds:
        n_bands = ds.count
        outside  = _outside_mask(ds)
        data_all = ds.read()   # (n_bands, H, W)
        profile  = ds.profile.copy()

    # If the file was already processed, the last band is the old alpha — replace it.
    # If it has never been processed (pure RGB), add a fresh alpha band.
    content = data_all[:-1] if n_bands > 3 else data_all

    # Alpha = 0 where: outside CALABARZON boundary  OR  all-RGB channels are near-black
    # (near-black = GEE cloud/shadow nodata pixels that weren't captured by the boundary mask)
    rgb = content[:3]
    black_pixels = (rgb[0] < 10) & (rgb[1] < 10) & (rgb[2] < 10)
    new_alpha = np.where(outside | black_pixels, 0, 255).astype(np.uint8)

    data_new = np.vstack([content, new_alpha[np.newaxis, ...]])
    profile.update(count=data_new.shape[0], nodata=None)

    tmp = basemap_path.with_suffix(".tmp.tif")
    with rasterio.open(tmp, "w", **profile) as dst:
        dst.write(data_new)
    shutil.move(str(tmp), str(basemap_path))

    # Write processed tag so future runs skip this file
    with rasterio.open(basemap_path, "r+") as ds:
        ds.update_tags(**{_PROCESSED_TAG: "1"})

    outside_n = int(outside.sum())
    black_n   = int((~outside & black_pixels).sum())
    print(f"  Masked {outside_n:,} outside-boundary + {black_n:,} black/nodata pixels to transparent.")
    print(f"  Rebuilding overviews...", end=" ", flush=True)
    _rebuild_overviews(basemap_path)
    print("done.\n")

print("All done. Restart the FastAPI server.")
