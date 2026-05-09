import rasterio
import numpy as np
from pathlib import Path
from rasterio.enums import Resampling

tif = Path(__file__).parent / "tif" / "2025-Jan-Jun.tif"
with rasterio.open(tif) as ds:
    print("Bands:", ds.count)
    print("Dtypes:", ds.dtypes)
    print("NoData:", ds.nodata)
    print()

    scale = 16
    out_h = ds.height // scale
    out_w = ds.width  // scale

    bands = ds.read(
        out_shape=(ds.count, out_h, out_w),
        resampling=Resampling.nearest,
    )

    r, g, b, alpha = bands[0].ravel(), bands[1].ravel(), bands[2].ravel(), bands[3].ravel()
    total = r.size

    print(f"Alpha=255 (visible):    {(alpha==255).sum()} px ({100*(alpha==255).mean():.2f}%)")
    print(f"Alpha=0   (transparent): {(alpha==0).sum()} px ({100*(alpha==0).mean():.2f}%)")
    print()

    # Valid = alpha > 0
    valid = alpha > 0
    r_v, g_v, b_v = r[valid], g[valid], b[valid]
    rgb = np.stack([r_v, g_v, b_v], axis=1)
    unique_rows, counts = np.unique(rgb, axis=0, return_counts=True)
    total_valid = int(valid.sum())

    print(f"Unique RGB colors in alpha-visible pixels ({total_valid} px total):")
    for (rv, gv, bv), cnt in sorted(zip(unique_rows.tolist(), counts.tolist()), key=lambda x: -x[1]):
        print(f"  RGB({rv:3d},{gv:3d},{bv:3d})  #{rv:02x}{gv:02x}{bv:02x}  {cnt} px  ({100*cnt/total_valid:.2f}%)")
