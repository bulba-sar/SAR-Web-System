"""
compare_models.py

Trains and evaluates three classifiers — Random Forest (RF), XGBoost, and SVM —
on each year/semester SAR + optical Sentinel composite using the same GEE training
data and feature set as the existing model performance pipeline.

Thesis objective covered
------------------------
  a. Model Performance  : Accuracy, Precision, Recall, F1-Score, MSE, Confusion Matrix
  b. Cross-Validation   : Stratified 5-fold CV per model per period
  c. Model Comparison   : Side-by-side ranking table confirming RF as top performer

Output
------
  model_comparison.json  (same directory as this script)

Usage
-----
    python compare_models.py

Requirements
------------
    pip install earthengine-api scikit-learn xgboost pandas numpy
"""

import json
import os
import pathlib
import time
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
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

try:
    from xgboost import XGBClassifier
    _HAS_XGBOOST = True
except ImportError:
    _HAS_XGBOOST = False
    print("WARNING: xgboost not installed — XGBoost will be skipped.")
    print("         Install with: pip install xgboost\n")

warnings.filterwarnings("ignore")


# ─────────────────────────────────────────────────────────────────────────────
#  Configuration  (mirrors compute_model_metrics.py exactly)
# ─────────────────────────────────────────────────────────────────────────────
GEE_PROJECT  = "sar-calabarzon"
ASSET_PATH   = "projects/sar-calabarzon/assets/FINAL_Training_Points_Agro"
OUTPUT_FILE  = pathlib.Path(__file__).parent / "model_comparison.json"

TEST_SIZE    = 0.3   # 70 % train / 30 % test — same as existing RF pipeline
RANDOM_STATE = 42
CV_FOLDS     = 5     # stratified k-fold cross-validation

CLASS_NAMES = {0: "Water", 1: "Urban", 2: "Forest", 3: "Agriculture"}
ALL_CLASSES  = list(CLASS_NAMES.keys())   # [0, 1, 2, 3]

PERIODS = [
    ("2021", "S1"), ("2021", "S2"),
    ("2022", "S1"), ("2022", "S2"),
    ("2023", "S1"), ("2023", "S2"),
    ("2024", "S1"), ("2024", "S2"),
    ("2025", "S1"), ("2025", "S2"),
]
PERIOD_LABEL = {"S1": "Jan-Jun", "S2": "Jul-Dec"}


# ─────────────────────────────────────────────────────────────────────────────
#  GEE composite builder  (identical to compute_model_metrics.py)
# ─────────────────────────────────────────────────────────────────────────────
def get_mega_composite(calabarzon, year, semester):
    start_date = f"{year}-01-01" if semester == "S1" else f"{year}-07-01"
    end_date   = f"{year}-06-30" if semester == "S1" else f"{year}-12-31"

    def mask_s2_clouds(image):
        qa = image.select("QA60")
        cloud_mask = (
            qa.bitwiseAnd(1 << 10).eq(0)
            .And(qa.bitwiseAnd(1 << 11).eq(0))
        )
        return image.updateMask(cloud_mask).divide(10000)

    s2_col = (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(calabarzon)
        .filterDate(start_date, end_date)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 40))
        .map(mask_s2_clouds)
    )
    s2 = s2_col.median()

    sar_col = (
        ee.ImageCollection("COPERNICUS/S1_GRD")
        .filterBounds(calabarzon)
        .filterDate(start_date, end_date)
        .filter(ee.Filter.eq("instrumentMode", "IW"))
        .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
        .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VH"))
    )
    sar = sar_col.median()

    elevation = ee.Image("USGS/SRTMGL1_003").clip(calabarzon)
    slope  = ee.Terrain.slope(elevation).rename("slope")
    aspect = ee.Terrain.aspect(elevation).rename("aspect")
    elev   = elevation.rename("elevation")

    ndvi  = s2.normalizedDifference(["B8",  "B4"]).rename("NDVI")
    ndwi  = s2.normalizedDifference(["B3",  "B8"]).rename("NDWI")
    mndwi = s2.normalizedDifference(["B3",  "B11"]).rename("MNDWI")
    ndbi  = s2.normalizedDifference(["B11", "B8"]).rename("NDBI")
    evi   = s2.expression(
        "2.5 * (NIR - RED) / (NIR + 6.0 * RED - 7.5 * BLUE + 1)",
        {"NIR": s2.select("B8"), "RED": s2.select("B4"), "BLUE": s2.select("B2")},
    ).rename("EVI")
    savi  = s2.expression(
        "1.5 * (NIR - RED) / (NIR + RED + 0.5)",
        {"NIR": s2.select("B8"), "RED": s2.select("B4")},
    ).rename("SAVI")
    bsi   = s2.expression(
        "((SWIR1 + RED) - (NIR + BLUE)) / ((SWIR1 + RED) + (NIR + BLUE))",
        {"SWIR1": s2.select("B11"), "RED": s2.select("B4"),
         "NIR": s2.select("B8"),   "BLUE": s2.select("B2")},
    ).rename("BSI")

    vv            = sar.select("VV")
    vh            = sar.select("VH")
    vv_vh_ratio   = vv.subtract(vh).rename("VV_VH_ratio")
    rvi           = vh.multiply(4).divide(vv.add(vh)).rename("RVI")

    vv_int         = vv.unitScale(-25, 0).multiply(100).toInt()
    glcm           = vv_int.glcmTexture(size=4)
    vv_contrast    = glcm.select("VV_contrast").rename("VV_contrast")
    vv_homogeneity = glcm.select("VV_idm").rename("VV_homogeneity")
    vv_entropy     = glcm.select("VV_ent").rename("VV_entropy")

    ndvi_std = (
        s2_col.map(lambda img: img.normalizedDifference(["B8", "B4"]).rename("NDVI"))
        .reduce(ee.Reducer.stdDev()).rename("NDVI_std")
    )
    vv_std = sar_col.select("VV").reduce(ee.Reducer.stdDev()).rename("VV_std")
    vh_std = sar_col.select("VH").reduce(ee.Reducer.stdDev()).rename("VH_std")

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


# ─────────────────────────────────────────────────────────────────────────────
#  Model definitions
# ─────────────────────────────────────────────────────────────────────────────
def build_models():
    """Return a dict of model_name → unfitted estimator."""
    models = {}

    # ── Random Forest ─────────────────────────────────────────────────────────
    models["Random Forest"] = RandomForestClassifier(
        n_estimators=500,
        max_features="sqrt",
        min_samples_leaf=2,
        class_weight="balanced",
        random_state=RANDOM_STATE,
        n_jobs=-1,
    )

    # ── XGBoost ───────────────────────────────────────────────────────────────
    if _HAS_XGBOOST:
        models["XGBoost"] = XGBClassifier(
            n_estimators=200,
            max_depth=4,
            learning_rate=0.1,
            subsample=0.8,
            colsample_bytree=0.8,
            reg_lambda=5.0,
            eval_metric="mlogloss",
            random_state=RANDOM_STATE,
            n_jobs=-1,
            verbosity=0,
        )

    # ── SVM (with StandardScaler, required for RBF kernel) ───────────────────
    models["SVM"] = Pipeline([
        ("scaler", StandardScaler()),
        ("svc", SVC(
            kernel="rbf",
            C=10,
            gamma="scale",
            class_weight="balanced",
            random_state=RANDOM_STATE,
            decision_function_shape="ovr",
        )),
    ])

    return models


# ─────────────────────────────────────────────────────────────────────────────
#  Evaluation helper
# ─────────────────────────────────────────────────────────────────────────────
def evaluate_model(model, X_train, X_test, y_train, y_test, X_full, y_full):
    """
    Fit *model* on the train split, evaluate on the test split, and run
    stratified CV on the full dataset.  Returns a metrics dict.
    """
    t0 = time.time()
    model.fit(X_train, y_train)
    train_time = round(time.time() - t0, 2)

    y_pred = model.predict(X_test)

    # ── Overall metrics ───────────────────────────────────────────────────────
    acc   = round(accuracy_score(y_test, y_pred), 4)
    kappa = round(cohen_kappa_score(y_test, y_pred), 4)
    mse   = round(mean_squared_error(y_test, y_pred), 4)

    # ── Per-class metrics (precision / recall / F1) ───────────────────────────
    report = classification_report(
        y_test, y_pred, labels=ALL_CLASSES, output_dict=True, zero_division=0
    )
    per_class = {}
    for int_label, cls_name in CLASS_NAMES.items():
        row = report.get(str(int_label), {})
        per_class[cls_name] = {
            "precision": round(row.get("precision", 0.0), 4),
            "recall":    round(row.get("recall",    0.0), 4),
            "f1":        round(row.get("f1-score",  0.0), 4),
        }

    # ── Confusion matrix (always 4×4) ─────────────────────────────────────────
    cm = confusion_matrix(y_test, y_pred, labels=ALL_CLASSES)

    # ── Cross-validation (stratified k-fold on full dataset) ─────────────────
    cv = StratifiedKFold(n_splits=CV_FOLDS, shuffle=True, random_state=RANDOM_STATE)
    cv_scores = cross_val_score(model, X_full, y_full, cv=cv, scoring="accuracy")

    return {
        "overall": {"accuracy": acc, "kappa": kappa, "mse": mse},
        "per_class": per_class,
        "confusion_matrix": {
            "classes": list(CLASS_NAMES.values()),
            "matrix":  cm.tolist(),
        },
        "cross_validation": {
            "folds":         CV_FOLDS,
            "mean_accuracy": round(float(cv_scores.mean()), 4),
            "std_accuracy":  round(float(cv_scores.std()),  4),
            "fold_scores":   [round(float(s), 4) for s in cv_scores],
        },
        "train_time_sec": train_time,
    }


# ─────────────────────────────────────────────────────────────────────────────
#  Utilities
# ─────────────────────────────────────────────────────────────────────────────
def _safe_mean_std(values):
    if not values:
        return {"mean": 0.0, "std": 0.0}
    arr = np.array(values, dtype=float)
    return {"mean": round(float(arr.mean()), 4), "std": round(float(arr.std()), 4)}


def _nested_get(d, dot_path):
    """Return d["a"]["b"]["c"] given 'a.b.c', or None on missing key."""
    for key in dot_path.split("."):
        if not isinstance(d, dict) or key not in d:
            return None
        d = d[key]
    return d


def compute_averages(period_results):
    """Aggregate per-period metrics into overall mean ± std."""
    metric_paths = [
        "overall.accuracy",
        "overall.kappa",
        "overall.mse",
        "cross_validation.mean_accuracy",
    ]
    averages = {}
    for path in metric_paths:
        key = path.split(".")[-1]
        vals = [_nested_get(p, path) for p in period_results.values()
                if _nested_get(p, path) is not None]
        averages[key] = _safe_mean_std(vals)

    # Per-class averages
    avg_per_class = {}
    for cls_name in CLASS_NAMES.values():
        avg_per_class[cls_name] = {}
        for metric in ("precision", "recall", "f1"):
            vals = [
                _nested_get(p, f"per_class.{cls_name}.{metric}")
                for p in period_results.values()
            ]
            vals = [v for v in vals if v is not None]
            avg_per_class[cls_name][metric] = _safe_mean_std(vals)

    averages["per_class"]  = avg_per_class
    averages["n_periods"]  = len(period_results)
    return averages


# ─────────────────────────────────────────────────────────────────────────────
#  Main
# ─────────────────────────────────────────────────────────────────────────────
def main():
    # ── GEE initialization ────────────────────────────────────────────────────
    print("=" * 65)
    print("  SAR LULC  —  Model Comparison Script")
    print("  Models: Random Forest  |  XGBoost  |  SVM (RBF)")
    print("=" * 65)
    print("\nInitializing GEE …")

    try:
        creds_str = os.environ.get("GEE_CREDENTIALS_JSON")
        if creds_str:
            creds = service_account.Credentials.from_service_account_info(
                json.loads(creds_str)
            )
        else:
            key_file = pathlib.Path(__file__).parent / "backend" / "credentials.json"
            creds = service_account.Credentials.from_service_account_file(str(key_file))
        creds = creds.with_scopes(["https://www.googleapis.com/auth/earthengine"])
        ee.Initialize(creds, project=GEE_PROJECT)
        print("  GEE initialized.\n")
    except Exception as exc:
        print(f"  GEE init failed: {exc}")
        return

    calabarzon = (
        ee.FeatureCollection("FAO/GAUL/2015/level1")
        .filter(ee.Filter.stringContains("ADM1_NAME", "Calabarzon"))
    )
    training_pts = ee.FeatureCollection(ASSET_PATH)
    print(f"  Training asset : {ASSET_PATH}")
    print(f"  Periods        : {len(PERIODS)}")
    print(f"  Test split     : {int((1 - TEST_SIZE) * 100)}% train / {int(TEST_SIZE * 100)}% test")
    print(f"  CV folds       : {CV_FOLDS}\n")

    # ── Result container ──────────────────────────────────────────────────────
    all_model_names = list(build_models().keys())
    results = {
        "config": {
            "gee_project":   GEE_PROJECT,
            "asset_path":    ASSET_PATH,
            "test_size":     TEST_SIZE,
            "cv_folds":      CV_FOLDS,
            "random_state":  RANDOM_STATE,
            "models":        all_model_names,
        },
        "models": {name: {"periods": {}, "average": {}} for name in all_model_names},
        "comparison": {},
    }

    # ── Per-period loop ───────────────────────────────────────────────────────
    for year, semester in PERIODS:
        label = f"{year}-{PERIOD_LABEL[semester]}"
        print(f"{'─' * 65}")
        print(f"  Processing  {label}")
        print(f"{'─' * 65}")

        try:
            composite = get_mega_composite(calabarzon, year, semester)
            print("  Sampling regions from GEE …", flush=True)

            raw = composite.sampleRegions(
                collection=training_pts,
                properties=["landcover"],
                scale=10,
            ).getInfo()

            rows = [feat["properties"] for feat in raw["features"]]
            if not rows:
                print(f"  No data returned for {label} — skipping.\n")
                continue

            df = pd.DataFrame(rows).dropna()
            if df.empty or "landcover" not in df.columns:
                print(f"  Empty dataframe for {label} — skipping.\n")
                continue

            X      = df.drop("landcover", axis=1)
            y      = df["landcover"].astype(int)
            n_samp = len(df)
            print(f"  Samples: {n_samp}  |  Classes: {sorted(y.unique().tolist())}")

            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=TEST_SIZE, random_state=RANDOM_STATE, stratify=y
            )
            print(f"  Train: {len(X_train)}  |  Test: {len(X_test)}\n")

            models = build_models()
            for model_name, model in models.items():
                print(f"  [{model_name}] training …", end=" ", flush=True)
                try:
                    metrics = evaluate_model(
                        model, X_train, X_test, y_train, y_test, X, y
                    )
                    results["models"][model_name]["periods"][label] = metrics

                    ov = metrics["overall"]
                    cv = metrics["cross_validation"]
                    print(
                        f"Acc={ov['accuracy']:.4f}  "
                        f"Kappa={ov['kappa']:.4f}  "
                        f"MSE={ov['mse']:.4f}  "
                        f"CV={cv['mean_accuracy']:.4f}±{cv['std_accuracy']:.4f}  "
                        f"({metrics['train_time_sec']}s)"
                    )
                except Exception as exc:
                    print(f"ERROR — {exc}")
            print()

        except Exception as exc:
            print(f"  ERROR on {label}: {exc}\n")
            continue

    # ── Averages ──────────────────────────────────────────────────────────────
    print("Computing averages …\n")
    for model_name in all_model_names:
        period_data = results["models"][model_name]["periods"]
        if period_data:
            results["models"][model_name]["average"] = compute_averages(period_data)

    # ── Cross-model comparison ranking ────────────────────────────────────────
    ranking = []
    for model_name in all_model_names:
        avg = results["models"][model_name].get("average", {})
        ranking.append({
            "rank":               0,          # filled below
            "model":              model_name,
            "avg_accuracy":       _nested_get(avg, "accuracy.mean")       or 0.0,
            "avg_kappa":          _nested_get(avg, "kappa.mean")           or 0.0,
            "avg_mse":            _nested_get(avg, "mse.mean")             or 0.0,
            "avg_cv_accuracy":    _nested_get(avg, "mean_accuracy.mean")   or 0.0,
            "periods_completed":  avg.get("n_periods", 0),
        })

    ranking.sort(key=lambda x: x["avg_accuracy"], reverse=True)
    for i, r in enumerate(ranking):
        r["rank"] = i + 1

    results["comparison"] = {
        "ranking": ranking,
        "best_model": ranking[0]["model"] if ranking else "—",
        "note": (
            "Models ranked by mean accuracy across all completed periods. "
            "Cross-validation confirms generalization (higher mean + lower std = better). "
            "Confusion matrices and per-class metrics detail per-class behaviour."
        ),
    }

    # ── Save to JSON ──────────────────────────────────────────────────────────
    with open(OUTPUT_FILE, "w") as fh:
        json.dump(results, fh, indent=2)
    print(f"Results saved → {OUTPUT_FILE}\n")

    # ── Console summary table ─────────────────────────────────────────────────
    print("=" * 65)
    print("  FINAL COMPARISON  —  averaged across all periods")
    print("=" * 65)
    hdr = f"  {'Rank':<5} {'Model':<20} {'Acc':>8} {'Kappa':>8} {'MSE':>8} {'CV Acc':>10}"
    print(hdr)
    print(f"  {'─'*5} {'─'*20} {'─'*8} {'─'*8} {'─'*8} {'─'*10}")
    for r in ranking:
        tag = "  ← best" if r["rank"] == 1 else ""
        print(
            f"  {r['rank']:<5} {r['model']:<20} "
            f"{r['avg_accuracy']:>8.4f} "
            f"{r['avg_kappa']:>8.4f} "
            f"{r['avg_mse']:>8.4f} "
            f"{r['avg_cv_accuracy']:>10.4f}"
            f"{tag}"
        )
    print("=" * 65)
    print(f"\nFull JSON output: {OUTPUT_FILE.name}")
    print("Done.")


if __name__ == "__main__":
    main()
