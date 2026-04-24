import numpy as np
import rasterio
import shutil
from rasterio.enums import Resampling
from pathlib import Path

TIF_DIR     = Path(__file__).parent / "tif"
BASEMAP_DIR = Path(__file__).parent / "basemap"
NODATA = 255
OVERVIEW_LEVELS = [2, 4, 8, 16, 32, 64]
_PROCESSED_TAG  = "sar_web_processed"


def _rebuild_overviews(tif_path):
    with rasterio.open(tif_path, "r+") as ds:
        ds.build_overviews(OVERVIEW_LEVELS, Resampling.nearest)
        ds.update_tags(ns="rio_overview", resampling="nearest")


def _is_lulc_processed(tif_path):
    with rasterio.open(tif_path) as ds:
        return ds.nodata == NODATA


def _is_basemap_processed(tif_path):
    with rasterio.open(tif_path) as ds:
        # Require both the tag AND exactly 4 bands (RGB + computed alpha).
        # A multi-spectral GEE export (6 bands, etc.) is NOT processed even if tagged.
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
            valid  = int((alpha > 0).sum())
            total  = alpha.size
            print(f"  Alpha  : {valid:,}/{total:,} valid pixels "
                  f"({100*valid/total:.1f}%)")


# ── Process LULC TIFs (single-band) in backend/tif/ ─────────────────────────
# Only needs boundary masking — no GEE connection required for already-processed files.
tifs = sorted(TIF_DIR.glob("*.tif"))
if not tifs:
    print("No TIF files found in backend/tif/")
else:
    needs_boundary = [t for t in tifs if not _is_lulc_processed(t)]

    if needs_boundary:
        # GEE is only needed to fetch the boundary for unprocessed LULC files.
        import ee
        from rasterio.features import geometry_mask
        from google.oauth2 import service_account

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
        print("  Boundary fetched.\n")

        def _outside_mask(ds):
            return geometry_mask(
                [boundary_geom],
                out_shape=(ds.height, ds.width),
                transform=ds.transform,
                invert=False,
            )

        for tif_path in tifs:
            if _is_lulc_processed(tif_path):
                print(f"Skipping {tif_path.name} (already processed).")
                continue

            print(f"Processing {tif_path.name} ...", flush=True)
            with rasterio.open(tif_path) as ds:
                outside = _outside_mask(ds)
                data    = ds.read(1)
                profile = ds.profile.copy()

            data[outside] = NODATA
            with rasterio.open(tif_path, "r+") as ds:
                ds.write(data, 1)
                ds.nodata = NODATA
            print(f"  Set {int(outside.sum()):,} outside pixels to {NODATA} (nodata).")
            print(f"  Rebuilding overviews...", end=" ", flush=True)
            _rebuild_overviews(tif_path)
            print("done.\n")
    else:
        for tif_path in tifs:
            print(f"Skipping {tif_path.name} (already processed).")

    print(f"All {len(tifs)} LULC file(s) checked.\n")


# ── Process basemap in backend/basemap/ ──────────────────────────────────────
basemap_path = BASEMAP_DIR / "basemap.tif"

if not basemap_path.exists():
    print("basemap.tif not found in backend/basemap/ — skipping.")

elif _is_basemap_processed(basemap_path):
    print("Basemap already processed — printing current info:")
    _print_tif_info(basemap_path)

else:
    print("Processing basemap.tif ...", flush=True)

    with rasterio.open(basemap_path) as ds:
        n_bands = ds.count
        profile = ds.profile.copy()
        data_all = ds.read()

    print(f"  Input: {n_bands} band(s), dtype={ds.dtypes[0]}, CRS={ds.crs}")

    # ── Always compute alpha from boundary + black-pixel detection. ────────────
    # Regardless of how many bands the GEE export has (3, 4, 6, …), only bands
    # 1–3 are the RGB visual bands; any extra spectral bands are NOT an alpha.
    # Output is always a clean 4-band RGBA file.
    try:
        boundary_geom  # already loaded above for LULC
    except NameError:
        import ee
        from rasterio.features import geometry_mask
        from google.oauth2 import service_account

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

    with rasterio.open(basemap_path) as ds:
        outside = _outside_mask(ds)

    rgb = data_all[:3]  # always use bands 1–3 as RGB
    black_pixels = (rgb[0] < 10) & (rgb[1] < 10) & (rgb[2] < 10)
    new_alpha    = np.where(outside | black_pixels, 0, 255).astype(np.uint8)

    data_new = np.vstack([rgb, new_alpha[np.newaxis, ...]])  # always 4-band output
    profile.update(count=4, nodata=None)

    tmp = basemap_path.with_suffix(".tmp.tif")
    with rasterio.open(tmp, "w", **profile) as dst:
        dst.write(data_new)
    shutil.move(str(tmp), str(basemap_path))

    outside_n = int(outside.sum())
    black_n   = int((~outside & black_pixels).sum())
    valid_n   = int((new_alpha > 0).sum())
    total_n   = new_alpha.size
    print(f"  Masked {outside_n:,} outside-boundary + {black_n:,} black pixels → alpha=0.")
    print(f"  Valid pixels (alpha=255): {valid_n:,}/{total_n:,} ({100*valid_n/total_n:.1f}%)")

    with rasterio.open(basemap_path, "r+") as ds:
        ds.update_tags(**{_PROCESSED_TAG: "1"})

    print(f"  Rebuilding overviews...", end=" ", flush=True)
    _rebuild_overviews(basemap_path)
    print("done.\n")

    print("Final basemap info:")
    _print_tif_info(basemap_path)

print("\nAll done. Restart the FastAPI server.")
