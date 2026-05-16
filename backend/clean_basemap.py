"""
clean_basemap.py

Processes the basemap.tif file by:
  - Converting multi-band GEE export to clean 4-band RGBA
  - Masking pixels outside CALABARZON boundary
  - Masking black pixels (noisy artifacts from GEE)
  - Building image pyramids (overviews) for fast tile serving

Requires:
  - basemap.tif in backend/basemap/
  - credentials.json in backend/ (for GEE boundary fetch)

Usage
-----
    python clean_basemap.py
"""

import numpy as np
import rasterio
import shutil
from rasterio.enums import Resampling
from rasterio.features import geometry_mask
from pathlib import Path
import ee
from google.oauth2 import service_account

BASEMAP_DIR = Path(__file__).parent / "basemap"
OVERVIEW_LEVELS = [2, 4, 8, 16, 32, 64]
_PROCESSED_TAG = "sar_web_processed"


def _rebuild_overviews(tif_path):
    """Build image pyramids into the TIF for fast tile serving at multiple zoom levels."""
    with rasterio.open(tif_path, "r+") as ds:
        ds.build_overviews(OVERVIEW_LEVELS, Resampling.nearest)
        ds.update_tags(ns="rio_overview", resampling="nearest")


def _is_basemap_processed(tif_path):
    """Check if basemap has been processed: tagged AND exactly 4 bands (RGBA)."""
    with rasterio.open(tif_path) as ds:
        return ds.tags().get(_PROCESSED_TAG) == "1" and ds.count == 4


def _print_tif_info(tif_path):
    """Print key metadata for a TIF — useful for debugging."""
    with rasterio.open(tif_path) as ds:
        print(f"  File   : {tif_path.name}")
        print(f"  Bands  : {ds.count}  dtype={ds.dtypes[0]}")
        print(f"  Size   : {ds.width} × {ds.height} px")
        print(f"  CRS    : {ds.crs}")
        print(f"  Bounds : {ds.bounds}")
        print(f"  NoData : {ds.nodata}")
        if ds.count >= 4:
            alpha = ds.read(4)
            valid = int((alpha > 0).sum())
            total = alpha.size
            print(f"  Alpha  : {valid:,}/{total:,} valid pixels ({100*valid/total:.1f}%)")


def main():
    basemap_path = BASEMAP_DIR / "basemap.tif"

    if not basemap_path.exists():
        print("basemap.tif not found in backend/basemap/ — skipping.")
        return

    if _is_basemap_processed(basemap_path):
        print("Basemap already processed — printing current info:")
        _print_tif_info(basemap_path)
        return

    print("Processing basemap.tif ...", flush=True)

    # Read source data
    with rasterio.open(basemap_path) as ds:
        n_bands = ds.count
        profile = ds.profile.copy()
        data_all = ds.read()

    print(f"  Input: {n_bands} band(s), dtype={profile['dtype']}, CRS={profile['crs']}")

    # Initialize GEE and fetch CALABARZON boundary
    KEY_FILE = Path(__file__).parent / "credentials.json"
    credentials = service_account.Credentials.from_service_account_file(str(KEY_FILE))
    scoped = credentials.with_scopes(["https://www.googleapis.com/auth/earthengine"])
    ee.Initialize(scoped, project="sar-calabarzon")

    print("Fetching CALABARZON boundary from GEE...", flush=True)
    calabarzon = (
        ee.FeatureCollection("FAO/GAUL/2015/level2")
        .filter(ee.Filter.inList("ADM2_NAME",
                ["Batangas", "Cavite", "Laguna", "Quezon", "Rizal"]))
    )
    boundary_geom = calabarzon.geometry().getInfo()

    def _outside_mask(ds):
        return geometry_mask(
            [boundary_geom],
            out_shape=(ds.height, ds.width),
            transform=ds.transform,
            invert=False,
        )

    # Compute alpha channel from boundary + black-pixel detection
    # GEE exports may have 3, 4, 6+ bands — always use bands 1-3 as RGB.
    with rasterio.open(basemap_path) as ds:
        outside = _outside_mask(ds)

    rgb = data_all[:3]  # always use bands 1–3 as RGB
    black_pixels = (rgb[0] < 10) & (rgb[1] < 10) & (rgb[2] < 10)
    new_alpha = np.where(outside | black_pixels, 0, 255).astype(np.uint8)

    # Always output 4-band RGBA
    data_new = np.vstack([rgb, new_alpha[np.newaxis, ...]])
    profile.update(count=4, nodata=None)

    # Write to temporary file, then replace original
    tmp = basemap_path.with_suffix(".tmp.tif")
    with rasterio.open(tmp, "w", **profile) as dst:
        dst.write(data_new)
    shutil.move(str(tmp), str(basemap_path))

    # Log masking results
    outside_n = int(outside.sum())
    black_n = int((~outside & black_pixels).sum())
    valid_n = int((new_alpha > 0).sum())
    total_n = new_alpha.size
    print(f"  Masked {outside_n:,} outside-boundary + {black_n:,} black pixels → alpha=0.")
    print(f"  Valid pixels (alpha=255): {valid_n:,}/{total_n:,} ({100*valid_n/total_n:.1f}%)")

    # Mark as processed
    with rasterio.open(basemap_path, "r+") as ds:
        ds.update_tags(**{_PROCESSED_TAG: "1"})

    # Build overviews
    print(f"  Rebuilding overviews...", end=" ", flush=True)
    _rebuild_overviews(basemap_path)
    print("done.\n")

    # Print final info
    print("Final basemap info:")
    _print_tif_info(basemap_path)

    print("\nDone. Restart the FastAPI server.")


if __name__ == "__main__":
    main()
