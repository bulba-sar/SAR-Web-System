import ee
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from google.oauth2 import service_account

app = FastAPI()

# --- FIX "CORS" ERRORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- AUTHENTICATE GEE ---
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

assets = {
            2021: {"Jan-Jun": "", "Jul-Dec": ""},
            2022: {"Jan-Jun": "", "Jul-Dec": ""},
            2023: {"Jan-Jun": "", "Jul-Dec": "projects/sar-calabarzon/assets/lulc/SAR_2023_CALABARZON_B1_1"},
            2024: {"Jan-Jun": "", "Jul-Dec": ""},
            2025: {"Jan-Jun": "projects/sar-calabarzon/assets/lulc/LULC_2025_Jan-Jun", "Jul-Dec": "projects/sar-calabarzon/assets/lulc/LULC_2025_Jul-Dec"}
        }

# --- SAR LULC MAP ---
@app.get("/get-sar-map/{year}/{period}")
def get_sar_map(year: int, period: str, layer: str = "all"): 
    try:
        year_data = assets.get(year)
        if not year_data: return {"error": f"Year {year} not found"}
        
        asset_id = year_data.get(period)
        if not asset_id: return {"error": f"Period {period} not found for {year}"}

        sar_image = ee.Image(asset_id).select(0).clip(calabarzon)
        
        if layer == "urban":
            sar_image = sar_image.updateMask(sar_image.eq(1))
        elif layer == "forest":
            sar_image = sar_image.updateMask(sar_image.eq(2))
        elif layer == "agriculture":
            sar_image = sar_image.updateMask(sar_image.eq(3))

        vis_params = {
            'min': 0, 'max': 3,
            'palette': ['#1d4ed8', '#dc2626', '#15803d', '#ca8a04'] 
        }
        
        map_id = sar_image.getMapId(vis_params)
        return {"tile_url": map_id['tile_fetcher'].url_format}
    
    except Exception as e:
        return {"error": str(e)}

# --- SATELLITE BASEMAP ---
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
            
        vis_params = {
            'min': 0, 'max': 3000,
            'bands': ['B4', 'B3', 'B2'] 
        }
        
        map_id = dataset.getMapId(vis_params)
        return {"tile_url": map_id['tile_fetcher'].url_format}
        
    except Exception as e:
        return {"error": str(e)}

# --- VISUAL LAYER: PROTECTED AREAS (GREEN HIGHLIGHT) ---
@app.get("/get-protected-areas")
def get_protected_areas():
    try:
        protected_areas = ee.FeatureCollection("WCMC/WDPA/current/polygons")
        
        # This highlights every protected area that touches CALABARZON
        local_pa = protected_areas.filterBounds(calabarzon)
        
        styled_pa = local_pa.style(**{
            'color': '00FF00',       
            'width': 3,              
            'fillColor': '00FF0022'  
        }).clip(calabarzon)
        
        map_id = styled_pa.getMapId()
        return {"tile_url": map_id['tile_fetcher'].url_format}
        
    except Exception as e:
        return {"error": str(e)}

# --- CLICK-TO-QUERY PROTECTED AREAS ---
@app.get("/query-protected-area")
def query_protected_area(lat: float, lng: float):
    try:
        point = ee.Geometry.Point([lng, lat])
        protected_areas = ee.FeatureCollection("WCMC/WDPA/current/polygons")
        
        # Check if the clicked point intersects any protected area polygon
        intersecting_pa = protected_areas.filterBounds(point)
        
        # Evaluate how many polygons we hit
        count = intersecting_pa.size().getInfo()
        
        if count > 0:
            # Grab the first intersecting protected area
            first_pa = intersecting_pa.first()
            
            # Fetch both the NAME and the DESIG_ENG (Designation)
            pa_name = first_pa.get('NAME').getInfo()
            pa_desig = first_pa.get('DESIG_ENG').getInfo() 
            
            # Fallback just in case the WDPA database is missing the designation for a specific polygon
            if not pa_desig:
                pa_desig = "Protected Area"

            return {
                "found": True, 
                "name": pa_name, 
                "desig": pa_desig # This now correctly feeds your React popup!
            }
        else:
            return {"found": False, "message": "No Protected Area found at this location."}
            
    except Exception as e:
        return {"error": str(e)}

# --- CLICK-TO-QUERY CROP SUITABILITY ---
@app.get("/query-crop-suitability")
def query_crop_suitability(lat: float, lng: float):
    try:
        point = ee.Geometry.Point([lng, lat])

        # 1. Get Elevation and Terrain data
        elevation = ee.Image("USGS/SRTMGL1_003")
        terrain = ee.Algorithms.Terrain(elevation)
        slope_img = terrain.select('slope')

        # 2. Sample the terrain at the clicked point (30m scale)
        slope_val = slope_img.reduceRegion(ee.Reducer.mean(), point, 30).get('slope').getInfo()
        elev_val = elevation.reduceRegion(ee.Reducer.mean(), point, 30).get('elevation').getInfo()

        if slope_val is None or elev_val is None:
            return {"found": False}

        # 3. Determine suitability based on elevation
        crops = []
        reasons = []
        soil = "Clay Loam"

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
            "soilName": soil,
            "slope": slope_val,
            "ndvi": 0.65, # Placeholder for frontend UI
            "crops": crops,
            "reasons": reasons
        }
    except Exception as e:
        print(f"CROP QUERY ERROR: {str(e)}")
        return {"error": str(e)}

# --- GET AGRI LAYER ---
@app.get("/get-agri-layer")
def get_agri_layer():
    try:
        # 1. Load your exact GEE Asset
        agri_image = ee.Image("projects/sar-calabarzon/assets/export/Agri_Only_S1_2024")
        
        # 2. Apply the exact visual styles you used in your GEE script
        vis_params = {
            'min': 1, 
            'max': 1, 
            'palette': ['yellow'] 
        }
        
        # 3. Ask Google to generate a Tile URL for Leaflet
        map_id_dict = ee.Image(agri_image).getMapId(vis_params)
        tile_url = map_id_dict['tile_fetcher'].url_format
        
        return {"url": tile_url, "status": "success"}
        
    except Exception as e:
        return {"error": str(e), "status": "failed"}

@app.get("/")
def read_root():
    return {"status": "SAR Backend is running!"}
