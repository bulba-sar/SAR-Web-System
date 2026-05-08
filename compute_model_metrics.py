"""
compute_model_metrics.py

Trains a Random Forest classifier matching the final GEE LULC classification
and writes accuracy, kappa, MSE, per-class precision/recall/F1, and confusion
matrix into backend/model_metrics.json.

Classes: 0=Water, 1=Urban, 2=Forest, 3=Agriland, 5=Agroforestry

Usage:
    python compute_model_metrics.py

Requires: earthengine-api, scikit-learn, pandas, numpy
"""

import json
import pathlib
import warnings

import ee
from google.oauth2 import service_account
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    cohen_kappa_score,
    confusion_matrix,
    mean_squared_error,
)

warnings.filterwarnings("ignore")

# ── Config ────────────────────────────────────────────────────────────────────
GEE_PROJECT  = "sar-calabarzon"
ASSET_PATH   = "projects/sar-calabarzon/assets/FINAL_Training_Points_Agro"
REGION_ASSET = "projects/sar-calabarzon/assets/gadm41_PHL_3"
METRICS_FILE = pathlib.Path(__file__).parent / "backend" / "model_metrics.json"

N_ESTIMATORS = 150
MIN_LEAF     = 3
BAG_FRACTION = 0.632
RANDOM_STATE = 42
RANDOM_SEED  = 7    # matches GEE randomColumn seed

CLASS_NAMES = {0: "Water", 1: "Urban", 2: "Forest", 3: "Agriland", 5: "Agroforestry"}
ALL_CLASSES = [0, 1, 2, 3, 5]

PERIODS = [
    ("2021", "S1"), ("2021", "S2"),
    ("2022", "S1"), ("2022", "S2"),
    ("2023", "S1"), ("2023", "S2"),
    ("2024", "S1"), ("2024", "S2"),
    ("2025", "S1"), ("2025", "S2"),
]

PERIOD_LABEL = {"S1": "Jan-Jun", "S2": "Jul-Dec"}


# ── Composite builder — mirrors the final GEE JS classification ───────────────
def get_composite(region, year, semester):
    start_date = f"{year}-01-01" if semester == "S1" else f"{year}-07-01"
    end_date   = f"{year}-06-30" if semester == "S1" else f"{year}-12-31"
    year_start = f"{year}-01-01"
    year_end   = f"{year}-12-31"

    def mask_s2_clouds(image):
        qa = image.select("QA60")
        mask = (
            qa.bitwiseAnd(1 << 10).eq(0)
            .And(qa.bitwiseAnd(1 << 11).eq(0))
        )
        return (
            image.updateMask(mask)
            .divide(10000)
            .copyProperties(image, ["system:time_start"])
        )

    # Full-year collections for seasonality / temporal features
    s2_col_year = (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(region)
        .filterDate(year_start, year_end)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 40))
        .map(mask_s2_clouds)
    )
    sar_col_year = (
        ee.ImageCollection("COPERNICUS/S1_GRD")
        .filterBounds(region)
        .filterDate(year_start, year_end)
        .filter(ee.Filter.eq("instrumentMode", "IW"))
        .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
        .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VH"))
    )

    # Semester-filtered medians
    s2_col = s2_col_year.filterDate(start_date, end_date)
    sar_col = sar_col_year.filterDate(start_date, end_date)
    s2  = s2_col.median().clip(region)
    sar = sar_col.median().clip(region)

    # Terrain
    elevation     = ee.Image("USGS/SRTMGL1_003").clip(region)
    slope         = ee.Terrain.slope(elevation).rename("slope")
    canopy_height = (
        ee.Image("users/nlang/ETH_GlobalCanopyHeight_2020_10m_v1")
        .rename("canopy_height").unmask(0).clip(region)
    )

    # Wet / dry seasonal contrast (wet = Jun–Nov, dry = Dec + Jan–May)
    wet_s2 = s2_col_year.filter(ee.Filter.calendarRange(6, 11, "month"))
    dry_s2 = (
        s2_col_year.filter(ee.Filter.calendarRange(12, 12, "month"))
        .merge(s2_col_year.filter(ee.Filter.calendarRange(1, 5, "month")))
    )
    wet_med      = wet_s2.median()
    dry_med      = dry_s2.median()
    ndvi_dry     = dry_med.normalizedDifference(["B8", "B4"]).rename("NDVI_dry")
    ndwi_dry     = dry_med.normalizedDifference(["B8", "B11"]).rename("NDWI_dry")
    ndvi_wet     = wet_med.normalizedDifference(["B8", "B4"])
    wet_dry_diff = ndvi_wet.subtract(ndvi_dry).rename("wet_dry_diff")

    # Spectral indices
    ndvi  = s2.normalizedDifference(["B8", "B4"]).rename("NDVI")
    ndbi  = s2.normalizedDifference(["B11", "B8"]).rename("NDBI")
    mndwi = s2.normalizedDifference(["B3", "B11"]).rename("MNDWI")
    ndre  = s2.normalizedDifference(["B8", "B5"]).rename("NDRE")
    tcw   = s2.expression(
        "0.1509*B + 0.1973*G + 0.3279*R + 0.3406*NIR"
        " + (-0.7112)*SWIR1 + (-0.4572)*SWIR2",
        {
            "B": s2.select("B2"), "G": s2.select("B3"), "R": s2.select("B4"),
            "NIR": s2.select("B8"), "SWIR1": s2.select("B11"), "SWIR2": s2.select("B12"),
        },
    ).rename("TCW")

    # Full-year NDVI seasonality features
    ndvi_col       = s2_col_year.map(
        lambda img: img.normalizedDifference(["B8", "B4"]).rename("NDVI")
    )
    ndvi_p         = ndvi_col.reduce(ee.Reducer.percentile([10, 90]))
    ndvi_amplitude = (
        ndvi_p.select("NDVI_p90")
        .subtract(ndvi_p.select("NDVI_p10"))
        .rename("NDVI_amplitude")
    )
    ndvi_min = ndvi_col.reduce(ee.Reducer.min()).rename("NDVI_min")
    ndvi_p10 = ndvi_p.select("NDVI_p10")

    # SAR features (linear ratio, not dB subtraction)
    vv          = sar.select("VV")
    vh          = sar.select("VH")
    vv_vh_ratio = vv.divide(vh).rename("VVVH_ratio")
    vh_std      = sar_col_year.select("VH").reduce(ee.Reducer.stdDev()).rename("VH_std")

    # NIR GLCM texture entropy (window 3, matches GEE JS)
    glcm    = s2.select("B8").multiply(255).toInt().glcmTexture(size=3)
    texture = glcm.select(["B8_ent"]).rename(["NIR_ent"])

    composite = (
        s2.select(["B2", "B3", "B4", "B5", "B8", "B11", "B12"])
        .addBands([
            ndvi, ndbi, mndwi, ndre,
            ndvi_amplitude, ndvi_min, ndvi_p10,
            vv, vh, vv_vh_ratio, vh_std,
            texture,
            slope, canopy_height,
            tcw,
            ndvi_dry, ndwi_dry, wet_dry_diff,
        ])
        .clip(region)
    )
    return composite  # 25 bands total


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    print("Initializing GEE …")
    try:
        import os as _os
        _gee_creds_str = _os.environ.get("GEE_CREDENTIALS_JSON")
        if _gee_creds_str:
            _creds = service_account.Credentials.from_service_account_info(
                json.loads(_gee_creds_str)
            )
        else:
            _key = pathlib.Path(__file__).parent / "backend" / "credentials.json"
            _creds = service_account.Credentials.from_service_account_file(str(_key))
        _creds = _creds.with_scopes(["https://www.googleapis.com/auth/earthengine"])
        ee.Initialize(_creds, project=GEE_PROJECT)
    except Exception as e:
        print(f"GEE init failed: {e}")
        return

    # CALABARZON region from the project GADM asset
    ph     = ee.FeatureCollection(REGION_ASSET)
    region = ph.filter(
        ee.Filter.inList("NAME_1", ["Batangas", "Cavite", "Laguna", "Quezon", "Rizal"])
    ).geometry()

    print(f"Loading training points from {ASSET_PATH} …")
    try:
        raw_points = ee.FeatureCollection(ASSET_PATH)
    except Exception as e:
        print(f"Error loading asset: {e}")
        return

    # Remap class 4 → 1 (Urban), matching GEE JS trainingMerged
    training_points = raw_points.map(
        lambda f: f.set(
            "landcover",
            ee.Algorithms.If(
                ee.Number(f.get("landcover")).eq(4), 1, f.get("landcover")
            ),
        )
    )

    # Oversample agroforestry (5) and forest (2) 2× each — matches GEE JS `weighted`
    agro_pts   = training_points.filter(ee.Filter.eq("landcover", 5))
    forest_pts = training_points.filter(ee.Filter.eq("landcover", 2))
    other_pts  = (
        training_points
        .filter(ee.Filter.neq("landcover", 5))
        .filter(ee.Filter.neq("landcover", 2))
    )
    weighted = (
        other_pts
        .merge(agro_pts).merge(agro_pts)
        .merge(forest_pts).merge(forest_pts)
    )

    # Reproducible 70/30 split via GEE randomColumn — matches GEE JS seed=7
    with_random  = weighted.randomColumn("random", RANDOM_SEED)
    train_points = with_random.filter(ee.Filter.lt("random", 0.7))
    test_points  = with_random.filter(ee.Filter.gte("random", 0.7))

    # Load existing metrics file
    with open(METRICS_FILE, "r") as f:
        metrics = json.load(f)

    for year, semester in PERIODS:
        label = f"{year}-{PERIOD_LABEL[semester]}"
        print(f"\n{'='*55}")
        print(f"  Processing {label} …")
        print(f"{'='*55}")

        try:
            composite = get_composite(region, year, semester)

            print("  Sampling train regions …")
            train_samples = composite.sampleRegions(
                collection=train_points,
                properties=["landcover"],
                scale=10,
                tileScale=8,
            ).getInfo()

            print("  Sampling test regions …")
            test_samples = composite.sampleRegions(
                collection=test_points,
                properties=["landcover"],
                scale=10,
                tileScale=8,
            ).getInfo()

            train_list = [f["properties"] for f in train_samples["features"]]
            test_list  = [f["properties"] for f in test_samples["features"]]

            if not train_list or not test_list:
                print(f"  No data for {label} — skipping.")
                continue

            df_train = pd.DataFrame(train_list).dropna()
            df_test  = pd.DataFrame(test_list).dropna()

            if df_train.empty or "landcover" not in df_train.columns:
                print(f"  Empty dataframe for {label} — skipping.")
                continue

            X_train = df_train.drop("landcover", axis=1)
            y_train = df_train["landcover"].astype(int)
            X_test  = df_test.drop("landcover", axis=1)
            y_test  = df_test["landcover"].astype(int)

            # Align columns in case any band is missing in one split
            X_test = X_test.reindex(columns=X_train.columns, fill_value=0)

            print(
                f"  Training RF ({N_ESTIMATORS} trees,"
                f" {len(X_train)} train / {len(X_test)} test) …"
            )
            clf = RandomForestClassifier(
                n_estimators=N_ESTIMATORS,
                min_samples_leaf=MIN_LEAF,
                max_samples=BAG_FRACTION,
                random_state=RANDOM_STATE,
                n_jobs=-1,
            )
            clf.fit(X_train, y_train)
            y_pred = clf.predict(X_test)

            # ── Overall metrics ──────────────────────────────────────────
            acc   = accuracy_score(y_test, y_pred)
            kappa = cohen_kappa_score(y_test, y_pred)
            mse   = mean_squared_error(y_test, y_pred)

            # ── Per-class metrics ────────────────────────────────────────
            report    = classification_report(
                y_test, y_pred,
                labels=ALL_CLASSES,
                output_dict=True,
                zero_division=0,
            )
            per_class = {}
            for int_label, cls_name in CLASS_NAMES.items():
                r = report.get(str(int_label), {})
                per_class[cls_name] = {
                    "precision": round(r.get("precision", 0.0), 4),
                    "recall":    round(r.get("recall",    0.0), 4),
                    "f1":        round(r.get("f1-score",  0.0), 4),
                }

            # ── Confusion matrix (fixed 5×5: [0,1,2,3,5]) ───────────────
            cm         = confusion_matrix(y_test, y_pred, labels=ALL_CLASSES)
            cm_classes = [CLASS_NAMES[c] for c in ALL_CLASSES]

            print(f"  Accuracy: {acc:.4f}  Kappa: {kappa:.4f}  MSE: {mse:.4f}")

            # ── Write into JSON (save after each period) ─────────────────
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

            with open(METRICS_FILE, "w") as f:
                json.dump(metrics, f, indent=2)
            print(f"  Saved {label} → {METRICS_FILE.name}")

        except Exception as exc:
            print(f"  ERROR on {label}: {exc}")
            continue

    print(f"\nDone. All results written to {METRICS_FILE}")


if __name__ == "__main__":
    main()
