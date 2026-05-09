"""
reclassify_tif.py

Remaps raw GEE/QGIS class values to clean 0-4 integer indices across all
TIF files in backend/tif/.

Fill in CLASS_MAP below before running:
    key   = the value currently in the TIF  (check QGIS Symbology → Value)
    value = the target index (0-4)

Class index convention:
    0 = Water
    1 = Urban
    2 = Forest
    3 = Agriculture
    4 = Agroforestry

NoData (255) is preserved unchanged.

Usage
-----
    python reclassify_tif.py

Originals are backed up to backend/tif/backup/ before any write.
"""

import shutil
import numpy as np
import rasterio
import rasterio.windows
from rasterio.enums import Resampling
from pathlib import Path

# ── FILL THIS IN ──────────────────────────────────────────────────────────────
CLASS_MAP = {
    # old_value : new_index
    0:   255,   # unclassified → NoData
    27:  2,     # Forest
    31:  0,     # Water
    51:  4,     # Agroforestry
    227: 1,     # Urban
    253: 3,     # Agriculture
}
# ─────────────────────────────────────────────────────────────────────────────

NODATA       = 255
TIF_DIR      = Path(__file__).parent / "tif"
BACKUP_DIR   = TIF_DIR / "backup"
CHUNK        = 4096   # pixels per axis per window — keeps RAM well under 100 MB

CLASS_LABELS = {
    0: "Water", 1: "Urban", 2: "Forest",
    3: "Agriculture", 4: "Agroforestry", 255: "NoData",
}


def build_lut() -> np.ndarray:
    """256-entry lookup table: old_value → new_value.
    Uses array indexing instead of boolean masks — no large temporary arrays.
    """
    lut = np.arange(256, dtype=np.uint8)   # default: identity (keep value)
    lut[NODATA] = NODATA                    # always preserve nodata
    for old_val, new_val in CLASS_MAP.items():
        lut[int(old_val)] = int(new_val)
    return lut


def _already_reclassified(src_path: Path) -> bool:
    """Return True if the TIF already has only 0-4 + 255 as pixel values."""
    with rasterio.open(src_path) as ds:
        sample = ds.read(1, out_shape=(200, 200), resampling=Resampling.nearest)
    valid = sample[sample != NODATA]
    return len(valid) > 0 and int(valid.max()) <= 4


def reclassify(src_path: Path, lut: np.ndarray) -> None:
    if _already_reclassified(src_path):
        print(f"  SKIP {src_path.name} — already reclassified.\n")
        return

    with rasterio.open(src_path) as ds:
        if ds.count != 1:
            print(f"  SKIP {src_path.name} — {ds.count} bands (expected 1)\n")
            return
        profile = ds.profile.copy()
        height  = ds.height
        width   = ds.width

    profile.update(dtype=rasterio.uint8, nodata=NODATA, count=1)
    tmp = src_path.with_suffix(".tmp.tif")

    class_counts = np.zeros(256, dtype=np.int64)
    total_windows = ((height + CHUNK - 1) // CHUNK) * ((width + CHUNK - 1) // CHUNK)
    done = 0

    with rasterio.open(src_path) as src:
        with rasterio.open(tmp, "w", **profile) as dst:
            for row_off in range(0, height, CHUNK):
                for col_off in range(0, width, CHUNK):
                    win = rasterio.windows.Window(
                        col_off, row_off,
                        min(CHUNK, width  - col_off),
                        min(CHUNK, height - row_off),
                    )
                    chunk = src.read(1, window=win).astype(np.uint8)   # shape (rows, cols)
                    out   = lut[chunk]                                     # vectorized LUT — no bool mask
                    np.add.at(class_counts, out.ravel(), 1)
                    dst.write(out, 1, window=win)
                    done += 1
                    if done % 10 == 0 or done == total_windows:
                        print(f"  {done}/{total_windows} windows done...", flush=True)

    shutil.move(str(tmp), str(src_path))

    print(f"  Class distribution:")
    for v in [0, 1, 2, 3, 4, 255]:
        c = int(class_counts[v])
        if c > 0:
            label = CLASS_LABELS.get(v, f"val={v}")
            print(f"    {label:<15} ({v:3d}) : {c:>12,} px")
    # Warn about any unmapped values that were left as-is
    known = sum(int(class_counts[v]) for v in [0, 1, 2, 3, 4, 255])
    leftover = int(class_counts.sum()) - known
    if leftover:
        print(f"    *** WARNING: {leftover:,} pixels had unmapped values (written unchanged) ***")
    print(f"  Written: {src_path.name}\n")


def main():
    tifs = sorted([t for t in TIF_DIR.glob("*.tif") if not t.name.endswith(".tmp.tif")])
    
    if not tifs:
        print(f"No TIF files found in {TIF_DIR}")
        return
    # Backup originals first
    BACKUP_DIR.mkdir(exist_ok=True)
    print(f"Backing up {len(tifs)} file(s) to {BACKUP_DIR.name}/ ...")
    for t in tifs:
        dst = BACKUP_DIR / t.name
        if not dst.exists():
            shutil.copy2(str(t), str(dst))
            print(f"  Backed up : {t.name}")
        else:
            print(f"  Already backed up : {t.name}")
    print()

    lut = build_lut()
    print(f"LUT built — mapping: {dict(CLASS_MAP)}\n")

    for t in tifs:
        print(f"Reclassifying {t.name} ...")
        reclassify(t, lut)

    print("Done. All TIF files now use class indices 0-4 (255=NoData).")
    print("Restart the FastAPI server after this step.")


if __name__ == "__main__":
    main()
