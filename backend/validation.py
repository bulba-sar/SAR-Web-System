"""
Dataset upload validation for SAR LULC GeoTIFFs.

Tier 1 (Hard errors)  → stored in result.errors  → upload is rejected
Tier 2 (Soft warnings) → stored in result.warnings → upload proceeds with caution
"""

import io
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.warp import transform_bounds
from dataclasses import dataclass, field
from typing import Optional

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# CALABARZON approximate bounding box in WGS84
CALABARZON_BOUNDS = {
    "min_lon": 120.5,
    "max_lon": 122.5,
    "min_lat": 13.2,
    "max_lat": 15.1,
}

# Valid LULC pixel class values (matches LULC_COLORMAP in main.py)
LULC_CLASS_NAMES = {
    0: "Water",
    1: "Urban",
    2: "Forest",
    3: "Agriculture",
}
NODATA_VALUE = 255  # pixels outside CALABARZON boundary (matches LULC_OUTSIDE_VALUE)
VALID_LULC_VALUES = set(LULC_CLASS_NAMES.keys()) | {NODATA_VALUE}

# Expected pixel resolutions in degrees at equator (WGS84)
# 10 m ≈ 0.0000898°,  30 m ≈ 0.000269°
EXPECTED_RESOLUTIONS = [
    (0.0000898, "10 m"),
    (0.000269,  "30 m"),
]
RESOLUTION_TOLERANCE = 0.50  # ±50 % of expected — generous for reprojected data

MAX_FILE_SIZE_MB  = 500
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

# Maximum pixels read for value analysis (downsampled if TIF is larger)
ANALYSIS_MAX_PIXELS = 2048


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------

@dataclass
class ValidationResult:
    errors:   list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    info:     dict      = field(default_factory=dict)

    @property
    def is_valid(self) -> bool:
        return len(self.errors) == 0


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def validate_dataset(
    file_bytes: bytes,
    dest_filename: str,
    existing_filenames: list[str],
) -> ValidationResult:
    """
    Run all Tier-1 and Tier-2 checks on *file_bytes*.

    Parameters
    ----------
    file_bytes        : raw bytes of the uploaded file
    dest_filename     : final filename that will be written to disk
    existing_filenames: list of filenames already present in backend/tif/
    """
    result = ValidationResult()

    # ── Tier 1: file must not be empty ────────────────────────────────────
    if len(file_bytes) == 0:
        result.errors.append("Uploaded file is empty.")
        return result  # nothing else to check

    # ── Tier 1: file size limit ────────────────────────────────────────────
    size_mb = len(file_bytes) / (1024 * 1024)
    result.info["size_mb"] = round(size_mb, 2)
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        result.errors.append(
            f"File is too large ({size_mb:.1f} MB). Maximum allowed size is {MAX_FILE_SIZE_MB} MB."
        )

    # ── Tier 1: must be a readable GeoTIFF ────────────────────────────────
    try:
        with rasterio.open(io.BytesIO(file_bytes)) as ds:
            _check_raster(ds, result)
    except rasterio.errors.RasterioIOError as exc:
        result.errors.append(f"File cannot be opened as a GeoTIFF: {exc}")
        return result
    except Exception as exc:
        result.errors.append(f"Unexpected error reading file: {exc}")
        return result

    # ── Tier 2: duplicate filename ─────────────────────────────────────────
    if dest_filename in existing_filenames:
        result.warnings.append(
            f"A file named '{dest_filename}' already exists and will be overwritten."
        )

    return result


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _check_raster(ds: rasterio.DatasetReader, result: ValidationResult) -> None:
    """Run all raster-level checks and populate *result*."""

    # ── Tier 1: must be single-band ───────────────────────────────────────
    result.info["band_count"] = ds.count
    if ds.count != 1:
        result.errors.append(
            f"Expected a single-band raster but found {ds.count} bands. "
            "LULC GeoTIFFs must be single-band."
        )

    # ── Tier 1: must be uint8 ─────────────────────────────────────────────
    dtype = ds.dtypes[0] if ds.count >= 1 else "unknown"
    result.info["dtype"] = dtype
    if dtype != "uint8":
        result.errors.append(
            f"Expected uint8 data type but found '{dtype}'. "
            "LULC class values (0–3) and the nodata value (255) require uint8 encoding."
        )

    # ── Tier 1: must have a CRS ───────────────────────────────────────────
    crs = ds.crs
    if crs is None:
        result.errors.append(
            "File has no coordinate reference system (CRS). "
            "Export the TIF from GEE with a CRS (e.g. EPSG:4326 or a projected CRS)."
        )
    else:
        result.info["crs"] = crs.to_string()

    # ── Tier 1: extent must overlap CALABARZON ────────────────────────────
    raw_bounds = ds.bounds
    result.info["bounds_native"] = {
        "left":   round(raw_bounds.left,   6),
        "bottom": round(raw_bounds.bottom, 6),
        "right":  round(raw_bounds.right,  6),
        "top":    round(raw_bounds.top,    6),
    }

    try:
        if crs is not None and not crs.is_geographic:
            wgs84 = transform_bounds(crs, "EPSG:4326", *raw_bounds)
        else:
            wgs84 = (raw_bounds.left, raw_bounds.bottom, raw_bounds.right, raw_bounds.top)

        result.info["bounds_wgs84"] = {
            "left":   round(wgs84[0], 6),
            "bottom": round(wgs84[1], 6),
            "right":  round(wgs84[2], 6),
            "top":    round(wgs84[3], 6),
        }

        cb = CALABARZON_BOUNDS
        no_overlap = (
            wgs84[2] < cb["min_lon"] or  # file entirely west of CALABARZON
            wgs84[0] > cb["max_lon"] or  # file entirely east
            wgs84[3] < cb["min_lat"] or  # file entirely south
            wgs84[1] > cb["max_lat"]     # file entirely north
        )
        if no_overlap:
            result.errors.append(
                f"File extent (lon {wgs84[0]:.4f}–{wgs84[2]:.4f}, "
                f"lat {wgs84[1]:.4f}–{wgs84[3]:.4f}) does not overlap the "
                f"CALABARZON region (lon {cb['min_lon']}–{cb['max_lon']}, "
                f"lat {cb['min_lat']}–{cb['max_lat']})."
            )
    except Exception as exc:
        result.warnings.append(f"Could not verify geographic extent: {exc}")

    # ── Raster dimensions (info only) ─────────────────────────────────────
    result.info["width_px"]  = ds.width
    result.info["height_px"] = ds.height

    # ── Tier 2: pixel resolution ──────────────────────────────────────────
    res_x = abs(ds.transform.a)
    res_y = abs(ds.transform.e)
    result.info["resolution_deg"] = {"x": round(res_x, 8), "y": round(res_y, 8)}

    label = _closest_resolution_label(res_x)
    if label:
        result.info["approximate_resolution"] = label
    else:
        result.warnings.append(
            f"Unusual pixel resolution ({res_x:.7f}° × {res_y:.7f}°). "
            "Expected approximately 10 m (~0.0000898°) or 30 m (~0.000269°). "
            "Tiles may appear at an unexpected scale."
        )

    # ── Tier 2: pixel value analysis ──────────────────────────────────────
    if ds.count == 1 and dtype == "uint8":
        try:
            # Downsample to avoid loading huge TIFs entirely into memory
            sample_h = min(ds.height, ANALYSIS_MAX_PIXELS)
            sample_w = min(ds.width,  ANALYSIS_MAX_PIXELS)
            data = ds.read(
                1,
                out_shape=(sample_h, sample_w),
                resampling=Resampling.nearest,
            )
            _check_pixel_values(data, result)
        except Exception as exc:
            result.warnings.append(f"Could not analyse pixel values: {exc}")


def _check_pixel_values(data: np.ndarray, result: ValidationResult) -> None:
    """Analyse sampled pixel data for coverage and unexpected class values."""
    total    = data.size
    nodata   = int(np.sum(data == NODATA_VALUE))
    valid    = total - nodata
    coverage = (valid / total * 100) if total > 0 else 0.0

    result.info["sampled_pixels"]   = total
    result.info["valid_pixels"]     = valid
    result.info["coverage_percent"] = round(coverage, 1)

    # Warn if coverage inside CALABARZON is very low
    if coverage < 10.0:
        result.warnings.append(
            f"Only {coverage:.1f}% of sampled pixels fall inside the CALABARZON boundary. "
            "The dataset may be nearly empty for this region."
        )

    # Warn on unexpected pixel values (e.g. wrong classification scheme)
    unique_vals  = set(np.unique(data).tolist())
    unexpected   = unique_vals - VALID_LULC_VALUES
    if unexpected:
        result.warnings.append(
            f"Unexpected pixel values found: {sorted(unexpected)}. "
            f"Valid LULC class values are {sorted(LULC_CLASS_NAMES.keys())} "
            f"(plus {NODATA_VALUE} for outside-boundary pixels). "
            "This may indicate the wrong classification scheme was used."
        )

    # Class distribution (info only)
    class_dist: dict[str, dict] = {}
    for val, name in LULC_CLASS_NAMES.items():
        count = int(np.sum(data == val))
        if count > 0:
            class_dist[name] = {
                "pixels":  count,
                "percent": round(count / total * 100, 2),
            }
    result.info["class_distribution"] = class_dist


def _closest_resolution_label(res_deg: float) -> Optional[str]:
    for expected_deg, label in EXPECTED_RESOLUTIONS:
        ratio = res_deg / expected_deg
        if (1.0 - RESOLUTION_TOLERANCE) <= ratio <= (1.0 + RESOLUTION_TOLERANCE):
            return label
    return None
