import ee
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google.oauth2 import service_account
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI(title="Thesis Backend")

# --- CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- AUTHENTICATE GEE (Single Init) ---
KEY_FILE = 'credentials.json'
credentials = service_account.Credentials.from_service_account_file(KEY_FILE)
scoped_credentials = credentials.with_scopes(['https://www.googleapis.com/auth/earthengine'])

try:
    ee.Initialize(scoped_credentials, project='sar-calabarzon')
except Exception as e:
    print(f"Failed to initialize GEE with service account: {e}")

# === DEFINE THE CALABARZON BOUNDARY ===
calabarzon = ee.FeatureCollection("FAO/GAUL/2015/level2") \
    .filter(ee.Filter.inList('ADM2_NAME', ['Batangas', 'Cavite', 'Laguna', 'Quezon', 'Rizal']))

# === LULC ASSET REGISTRY ===
assets = {
    2021: {"Jan-Jun": "projects/sar-calabarzon/assets/lulc/2021_SEM1_LULC_TRY", "Jul-Dec": "projects/sar-calabarzon/assets/lulc/2021_SEM2_LULC_TRY"},
    2022: {"Jan-Jun": "projects/sar-calabarzon/assets/lulc/2022_SEM1_LULC_TRY", "Jul-Dec": "projects/sar-calabarzon/assets/lulc/2022_SEM2_LULC_TRY"},
    2023: {"Jan-Jun": "projects/sar-calabarzon/assets/lulc/2023_SEM1_LULC_TRY", "Jul-Dec": "projects/sar-calabarzon/assets/lulc/2023_SEM2_LULC_TRY"},
    2024: {"Jan-Jun": "", "Jul-Dec": ""},
    2025: {"Jan-Jun": "projects/sar-calabarzon/assets/lulc/2025_SEM1_LULC_TRY", "Jul-Dec": "projects/sar-calabarzon/assets/lulc/2025_SEM2_LULC_TRY"}
}

CLASS_MAP = {
    0: "Water",
    1: "Urban",
    2: "Forest",
    3: "Agriculture"
}

CLASS_PALETTE = ['#1d4ed8', '#dc2626', '#15803d', '#ca8a04']


# ============================================================
#  EXISTING ENDPOINTS
# ============================================================

@app.get("/get-sar-map/{year}/{period}")
def get_sar_map(year: int, period: str, layer: str = "all"):
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
        return {"tile_url": map_id['tile_fetcher'].url_format}

    except Exception as e:
        return {"error": str(e)}


@app.get("/get-satellite-basemap/{year}/{period}")
def get_satellite_basemap(year: int, period: str):
    try:
        if period == "Jan-Jun":
            start_date, end_date = f'{year}-01-01', f'{year}-06-30'
        elif period == "Jul-Dec":
            start_date, end_date = f'{year}-07-01', f'{year}-12-31'
        else:
            return {"error": "Invalid period selected"}

        def mask_s2_clouds_and_shadows(image):
            scl = image.select('SCL')
            mask = scl.neq(3).And(scl.neq(8)).And(scl.neq(9)).And(scl.neq(10))
            return image.updateMask(mask)

        dataset = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED') \
            .filterDate(start_date, end_date) \
            .map(mask_s2_clouds_and_shadows) \
            .median() \
            .clip(calabarzon)

        vis_params = {'min': 0, 'max': 3000, 'bands': ['B4', 'B3', 'B2']}
        map_id = dataset.getMapId(vis_params)
        return {"tile_url": map_id['tile_fetcher'].url_format}

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
def query_crop_suitability(lat: float, lng: float):
    try:
        point = ee.Geometry.Point([lng, lat])
        elevation = ee.Image("USGS/SRTMGL1_003")
        terrain = ee.Algorithms.Terrain(elevation)
        slope_img = terrain.select('slope')

        slope_val = slope_img.reduceRegion(ee.Reducer.mean(), point, 30).get('slope').getInfo()
        elev_val = elevation.reduceRegion(ee.Reducer.mean(), point, 30).get('elevation').getInfo()

        if slope_val is None or elev_val is None:
            return {"found": False}

        s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED') \
            .filterBounds(point) \
            .filterDate('2024-01-01', '2024-12-31') \
            .sort('CLOUDY_PIXEL_PERCENTAGE') \
            .first()

        ndvi_val = None
        if s2:
            ndvi = s2.normalizedDifference(['B8', 'B4']).rename('ndvi')
            ndvi_result = ndvi.reduceRegion(ee.Reducer.mean(), point, 10).get('ndvi').getInfo()
            ndvi_val = round(ndvi_result, 4) if ndvi_result is not None else None

        if elev_val < 100:
            crops = ["Rice", "Lowland Vegetables"]
            reasons = ["Flat terrain holds water well.", "Ideal for lowland irrigation setups."]
            soil = "Alluvial Clay"
        elif elev_val < 500:
            crops = ["Corn", "Coconut", "Fruit Trees"]
            reasons = ["Good drainage on moderate slopes.", "Sufficient sunlight and root depth."]
            soil = "Sandy Loam"
        else:
            crops = ["Coffee", "Cacao", "Highland Greens"]
            reasons = ["Cooler temperatures suit these crops.", "Well-drained upland soil."]
            soil = "Volcanic Ash / Loam"

        return {
            "found": True,
            "elevation": round(elev_val, 1),
            "soilName": soil,
            "slope": slope_val,
            "ndvi": ndvi_val,
            "crops": crops,
            "reasons": reasons
        }

    except Exception as e:
        print(f"CROP QUERY ERROR: {str(e)}")
        return {"error": str(e)}


@app.get("/get-agri-layer")
def get_agri_layer():
    try:
        agri_image = ee.Image("projects/sar-calabarzon/assets/export/Agri_Only_S1_2024")
        vis_params = {'min': 1, 'max': 1, 'palette': ['yellow']}
        map_id_dict = ee.Image(agri_image).getMapId(vis_params)
        tile_url = map_id_dict['tile_fetcher'].url_format
        return {"url": tile_url, "status": "success"}

    except Exception as e:
        return {"error": str(e), "status": "failed"}


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

        # Determine the most common crop across years
        all_crops = {}
        for r in yearly_results:
            for c in r['estimated_crops']:
                name = c['crop']
                all_crops[name] = all_crops.get(name, 0) + 1
        
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
#  HEALTH CHECK
# ============================================================

@app.get("/")
def read_root():
    return {"status": "SAR Backend is running!"}