import ee
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any

# Initialize Earth Engine (Requires Service Account credentials in production)
try:
    ee.Initialize()
except Exception as e:
    print("Failed to initialize Earth Engine:", e)

app = FastAPI(title="LULC Analytics API")

# --- Pydantic Models for the API payload ---
class GeoJSONPolygon(BaseModel):
    type: str = "Polygon"
    coordinates: List[List[List[float]]]

class LULCAnalyticsRequest(BaseModel):
    geometry: GeoJSONPolygon
    start_year: int
    end_year: int

# --- Helper Function to Process the EE Data ---
def calculate_class_percentages(image: ee.Image, geometry: ee.Geometry) -> ee.Feature:
    """
    Reduces an image to get the pixel count for each class, 
    then attaches the date and raw counts as properties.
    """
    # Get the histogram of pixel values inside the polygon
    histogram = image.reduceRegion(
        reducer=ee.Reducer.frequencyHistogram(),
        geometry=geometry,
        scale=10, # Sentinel resolution
        maxPixels=1e10,
        bestEffort=True # Helps prevent memory limits on huge polygons
    ).get('LULC_Final') # Replace with your actual band name

    # Get the date of the image
    date_millis = image.get('system:time_start')
    date_string = ee.Date(date_millis).format('YYYY-MM')

    # Return a feature with the properties we need
    return ee.Feature(None, {
        'date': date_string,
        'histogram': histogram
    })


@app.post("/api/v1/analytics/lulc-change")
async def get_lulc_change(request: LULCAnalyticsRequest):
    try:
        # 1. Convert Frontend GeoJSON to Earth Engine Geometry
        roi = ee.Geometry.Polygon(request.geometry.coordinates)

        # 2. Load your exported assets (Assuming they are in an ImageCollection)
        # If they are individual assets, you'll need to create an ee.ImageCollection from a list of asset IDs
        collection = ee.ImageCollection("projects/your-project/assets/Your_LULC_Collection") \
            .filterDate(f'{request.start_year}-01-01', f'{request.end_year}-12-31')
        
        # 3. Map the calculation function over the collection
        # This runs the histogram calculation for every bi-sem dataset simultaneously in EE
        time_series_features = collection.map(lambda img: calculate_class_percentages(img, roi))
        
        # 4. Pull the results from Google's servers to your FastAPI server
        # WARNING: getInfo() is synchronous and blocking. It is the bridge between EE and Python.
        raw_results = time_series_features.getInfo()

        # 5. Format the data for the frontend charting library
        formatted_response = []
        for feature in raw_results['features']:
            properties = feature['properties']
            date = properties['date']
            histogram = properties.get('histogram') or {}
            
            # Calculate total pixels to convert to percentages
            total_pixels = sum(histogram.values())
            
            # Map class numbers to human-readable names (adjust to your classes)
            class_map = {'0': 'Water', '1': 'Urban', '2': 'Forest', '3': 'Cropland'}
            
            percentages = {}
            if total_pixels > 0:
                for class_num, pixel_count in histogram.items():
                    class_name = class_map.get(str(class_num), f"Class {class_num}")
                    # Calculate percentage and round to 2 decimal places
                    percentages[class_name] = round((pixel_count / total_pixels) * 100, 2)
            
            formatted_response.append({
                "period": date,
                "data": percentages
            })

        # Sort chronologically just to be safe
        formatted_response.sort(key=lambda x: x['period'])

        return {"status": "success", "analytics": formatted_response}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))