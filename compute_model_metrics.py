"""
compute_model_metrics.py

Trains a Random Forest classifier on each year/semester composite and writes
accuracy, kappa, MSE, per-class precision/recall/F1, and confusion matrix
into backend/model_metrics.json.

Usage:
    python compute_model_metrics.py

Requires: earthengine-api, scikit-learn, pandas, numpy, joblib
"""

import json
import pathlib
import warnings

import ee
from google.oauth2 import service_account
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    cohen_kappa_score,
    confusion_matrix,
    mean_squared_error,
)
from sklearn.model_selection import train_test_split

warnings.filterwarnings("ignore")

# ── Config ────────────────────────────────────────────────────────────────────
GEE_PROJECT   = "sar-calabarzon"
ASSET_PATH    = "projects/sar-calabarzon/assets/200_NewTrainingPoints"
METRICS_FILE  = pathlib.Path(__file__).parent / "backend" / "model_metrics.json"

N_ESTIMATORS  = 250
TEST_SIZE     = 0.3
RANDOM_STATE  = 42

# landcover integer → class name (matches GEE training asset)
CLASS_NAMES = {0: "Water", 1: "Urban", 2: "Forest", 3: "Agriculture"}

PERIODS = [
    ("2021", "S1"), ("2021", "S2"),
    ("2022", "S1"), ("2022", "S2"),
    ("2023", "S1"), ("2023", "S2"),
    ("2024", "S1"), ("2024", "S2"),
    ("2025", "S1"), ("2025", "S2"),
]

PERIOD_LABEL = {"S1": "Jan-Jun", "S2": "Jul-Dec"}

# ── GEE helpers (copied from compare_models.py) ───────────────────────────────
def get_mega_composite(calabarzon, year, semester):
    startDate = f"{year}-01-01" if semester == "S1" else f"{year}-07-01"
    endDate   = f"{year}-06-30" if semester == "S1" else f"{year}-12-31"

    def maskS2clouds(image):
        qa = image.select("QA60")
        cloudBitMask  = 1 << 10
        cirrusBitMask = 1 << 11
        mask = (
            qa.bitwiseAnd(cloudBitMask).eq(0)
            .And(qa.bitwiseAnd(cirrusBitMask).eq(0))
        )
        return image.updateMask(mask).divide(10000)

    s2Col = (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(calabarzon)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 40))
        .map(maskS2clouds)
    )
    s2 = s2Col.median()

    sarCol = (
        ee.ImageCollection("COPERNICUS/S1_GRD")
        .filterBounds(calabarzon)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.eq("instrumentMode", "IW"))
        .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
        .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VH"))
    )
    sar = sarCol.median()

    elevation = ee.Image("USGS/SRTMGL1_003").clip(calabarzon)
    slope  = ee.Terrain.slope(elevation).rename("slope")
    aspect = ee.Terrain.aspect(elevation).rename("aspect")
    elev   = elevation.rename("elevation")

    ndvi  = s2.normalizedDifference(["B8", "B4"]).rename("NDVI")
    ndwi  = s2.normalizedDifference(["B3", "B8"]).rename("NDWI")
    evi   = s2.expression(
        "2.5 * (NIR - RED) / (NIR + 6.0 * RED - 7.5 * BLUE + 1)",
        {"NIR": s2.select("B8"), "RED": s2.select("B4"), "BLUE": s2.select("B2")}
    ).rename("EVI")
    savi  = s2.expression(
        "1.5 * (NIR - RED) / (NIR + RED + 0.5)",
        {"NIR": s2.select("B8"), "RED": s2.select("B4")}
    ).rename("SAVI")
    mndwi = s2.normalizedDifference(["B3", "B11"]).rename("MNDWI")
    ndbi  = s2.normalizedDifference(["B11", "B8"]).rename("NDBI")
    bsi   = s2.expression(
        "((SWIR1 + RED) - (NIR + BLUE)) / ((SWIR1 + RED) + (NIR + BLUE))",
        {"SWIR1": s2.select("B11"), "RED": s2.select("B4"),
         "NIR": s2.select("B8"),   "BLUE": s2.select("B2")}
    ).rename("BSI")

    vv = sar.select("VV")
    vh = sar.select("VH")
    vv_vh_ratio = vv.subtract(vh).rename("VV_VH_ratio")
    rvi         = vh.multiply(4).divide(vv.add(vh)).rename("RVI")

    vv_int = vv.unitScale(-25, 0).multiply(100).toInt()
    glcm   = vv_int.glcmTexture(size=4)
    vv_contrast    = glcm.select("VV_contrast").rename("VV_contrast")
    vv_homogeneity = glcm.select("VV_idm").rename("VV_homogeneity")
    vv_entropy     = glcm.select("VV_ent").rename("VV_entropy")

    ndvi_std = (
        s2Col.map(lambda img: img.normalizedDifference(["B8", "B4"]).rename("NDVI"))
        .reduce(ee.Reducer.stdDev()).rename("NDVI_std")
    )
    vv_std = sarCol.select("VV").reduce(ee.Reducer.stdDev()).rename("VV_std")
    vh_std = sarCol.select("VH").reduce(ee.Reducer.stdDev()).rename("VH_std")

    composite = (
        s2.select(["B2", "B3", "B4", "B8", "B11", "B12"])
        .addBands([ndvi, ndwi, evi, savi, mndwi, ndbi, bsi])
        .addBands([ndvi_std, vv_std, vh_std])
        .addBands(sar.select(["VV", "VH"]))
        .addBands([vv_vh_ratio, rvi])
        .addBands([vv_contrast, vv_homogeneity, vv_entropy])
        .addBands([slope, aspect, elev])
    )
    return composite.clip(calabarzon)


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    print("Initializing GEE …")
    try:
        import os as _os
        _gee_creds_str = _os.environ.get("GEE_CREDENTIALS_JSON")
        if _gee_creds_str:
            _creds = service_account.Credentials.from_service_account_info(json.loads(_gee_creds_str))
        else:
            _key = pathlib.Path(__file__).parent / "backend" / "credentials.json"
            _creds = service_account.Credentials.from_service_account_file(str(_key))
        _creds = _creds.with_scopes(['https://www.googleapis.com/auth/earthengine'])
        ee.Initialize(_creds, project=GEE_PROJECT)
    except Exception as e:
        print(f"GEE init failed: {e}")
        return

    countries  = ee.FeatureCollection("FAO/GAUL/2015/level1")
    calabarzon = countries.filter(ee.Filter.stringContains("ADM1_NAME", "Calabarzon"))

    print(f"Loading training points from {ASSET_PATH} …")
    try:
        my_points = ee.FeatureCollection(ASSET_PATH)
    except Exception as e:
        print(f"Error loading asset: {e}")
        return

    # Load existing metrics file
    with open(METRICS_FILE, "r") as f:
        metrics = json.load(f)

    for year, semester in PERIODS:
        label = f"{year}-{PERIOD_LABEL[semester]}"
        print(f"\n{'='*55}")
        print(f"  Processing {label} …")
        print(f"{'='*55}")

        try:
            composite = get_mega_composite(calabarzon, year, semester)

            print("  Sampling regions …")
            samples = composite.sampleRegions(
                collection=my_points,
                properties=["landcover"],
                scale=10,
            ).getInfo()

            data_list = [feat["properties"] for feat in samples["features"]]
            if not data_list:
                print(f"  No data for {label} — skipping.")
                continue

            df = pd.DataFrame(data_list).dropna()
            if df.empty or "landcover" not in df.columns:
                print(f"  Empty dataframe for {label} — skipping.")
                continue

            X = df.drop("landcover", axis=1)
            y = df["landcover"].astype(int)

            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=TEST_SIZE, random_state=RANDOM_STATE, stratify=y
            )

            print(f"  Training RF ({N_ESTIMATORS} trees) …")
            clf = RandomForestClassifier(
                n_estimators=N_ESTIMATORS,
                random_state=RANDOM_STATE,
                class_weight="balanced",
                n_jobs=-1,
            )
            clf.fit(X_train, y_train)
            y_pred = clf.predict(X_test)

            # ── Overall metrics ──────────────────────────────────────────
            acc   = accuracy_score(y_test, y_pred)
            kappa = cohen_kappa_score(y_test, y_pred)
            mse   = mean_squared_error(y_test, y_pred)

            # ── Per-class metrics ────────────────────────────────────────
            report   = classification_report(y_test, y_pred, output_dict=True)
            per_class = {}
            for int_label, cls_name in CLASS_NAMES.items():
                key = str(int_label)
                if key in report:
                    per_class[cls_name] = {
                        "precision": round(report[key]["precision"], 4),
                        "recall":    round(report[key]["recall"],    4),
                        "f1":        round(report[key]["f1-score"],  4),
                    }
                else:
                    per_class[cls_name] = {"precision": 0.0, "recall": 0.0, "f1": 0.0}

            # ── Confusion matrix ─────────────────────────────────────────
            present_classes = sorted(y.unique())
            cm = confusion_matrix(y_test, y_pred, labels=present_classes)
            cm_classes = [CLASS_NAMES[c] for c in present_classes]

            # Pad to 4×4 if any class has no test samples
            all_int = list(CLASS_NAMES.keys())
            if len(present_classes) < 4:
                full_cm = np.zeros((4, 4), dtype=int)
                for ri, rc in enumerate(present_classes):
                    for ci, cc in enumerate(present_classes):
                        full_cm[all_int.index(rc)][all_int.index(cc)] = cm[ri][ci]
                cm = full_cm
                cm_classes = list(CLASS_NAMES.values())

            print(f"  Accuracy: {acc:.4f}  Kappa: {kappa:.4f}  MSE: {mse:.4f}")

            # ── Write into JSON ──────────────────────────────────────────
            metrics["periods"][label] = {
                "overall": {
                    "accuracy": round(acc,   4),
                    "kappa":    round(kappa, 4),
                    "mse":      round(mse,   4),
                },
                "per_class": per_class,
                "confusion_matrix": {
                    "classes": cm_classes,
                    "matrix":  cm.tolist(),
                },
            }

            # Save after each period so partial results aren't lost
            with open(METRICS_FILE, "w") as f:
                json.dump(metrics, f, indent=2)
            print(f"  Saved {label} → {METRICS_FILE.name}")

        except Exception as exc:
            print(f"  ERROR on {label}: {exc}")
            continue

    print(f"\nDone. All results written to {METRICS_FILE}")


if __name__ == "__main__":
    main()
