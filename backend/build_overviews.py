"""
Run this once after adding new TIF files to backend/tif/.

    python build_overviews.py

Builds image pyramids (overviews) into each TIF so rio-tiler can serve
lower zoom levels quickly without reading the full file every time.
This eliminates the NoOverviewWarning and improves tile performance.
"""

import rasterio
from rasterio.enums import Resampling
from pathlib import Path

TIF_DIR = Path(__file__).parent / "tif"
OVERVIEW_LEVELS = [2, 4, 8, 16, 32, 64]

tifs = sorted(TIF_DIR.glob("*.tif"))
if not tifs:
    print("No TIF files found in backend/tif/")
else:
    for tif in tifs:
        print(f"Building overviews: {tif.name} ...", end=" ", flush=True)
        with rasterio.open(tif, "r+") as ds:
            ds.build_overviews(OVERVIEW_LEVELS, Resampling.nearest)
            ds.update_tags(ns="rio_overview", resampling="nearest")
        print("done")
    print(f"\nAll {len(tifs)} file(s) ready.")
