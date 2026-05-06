"""
visualize_comparison.py

Reads model_comparison.json (output of compare_models.py) and saves two
thesis-ready figures plus a formatted console summary table.

Output files (same directory as this script):
  model_metrics_chart.png   — grouped bar chart: Accuracy, Precision, Recall, F1, MSE
  model_cm_chart.png        — row-normalised confusion-matrix heatmaps

Usage
-----
    python visualize_comparison.py

Requires
--------
    pip install matplotlib numpy
"""

import json
import pathlib
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap

# ── Load JSON ─────────────────────────────────────────────────────────────────
HERE      = pathlib.Path(__file__).parent
JSON_FILE = HERE / "model_comparison.json"

if not JSON_FILE.exists():
    raise FileNotFoundError(
        f"Run compare_models.py first — {JSON_FILE} not found."
    )

with open(JSON_FILE) as f:
    results = json.load(f)

models_data = results["models"]
model_names = results["config"]["models"]
ranking     = results["comparison"]["ranking"]
CLASS_NAMES = ["Water", "Urban", "Forest", "Agriculture", "Agroforestry"]

# ── Helpers ───────────────────────────────────────────────────────────────────
def _avg(model_name, *keys, stat="mean"):
    """Navigate average dict by keys and return the requested stat."""
    node = models_data[model_name].get("average", {})
    for k in keys:
        if not isinstance(node, dict) or k not in node:
            return 0.0
        node = node[k]
    if isinstance(node, dict):
        return float(node.get(stat, 0.0))
    return float(node or 0.0)


def macro_avg(model_name, metric, stat="mean"):
    """Macro-average of per-class precision / recall / f1."""
    vals = [_avg(model_name, "per_class", cls, metric, stat=stat)
            for cls in CLASS_NAMES]
    return float(np.mean(vals))


def agg_cm(model_name):
    """Sum confusion matrices across all periods for one model."""
    total = None
    for pd_data in models_data[model_name].get("periods", {}).values():
        m = pd_data.get("confusion_matrix", {}).get("matrix")
        if m:
            arr = np.array(m, dtype=int)
            total = arr if total is None else total + arr
    return total


# ── Colour palette (green theme) ─────────────────────────────────────────────
PALETTE   = ["#2d6a4f", "#52b788", "#95d5b2"]   # dark → mid → light green
GREEN_MAP = LinearSegmentedColormap.from_list("sar_green", ["#f0faf4", "#1b5e20"])


# ─────────────────────────────────────────────────────────────────────────────
#  Figure 1 — Grouped bar chart
# ─────────────────────────────────────────────────────────────────────────────
metric_defs = [
    ("Accuracy",  [_avg(m, "accuracy")       for m in model_names]),
    ("Precision", [macro_avg(m, "precision") for m in model_names]),
    ("Recall",    [macro_avg(m, "recall")    for m in model_names]),
    ("F1 Score",  [macro_avg(m, "f1")        for m in model_names]),
    ("MSE †",     [_avg(m, "mse")            for m in model_names]),
]

metric_labels = [d[0] for d in metric_defs]
n_metrics     = len(metric_labels)
n_models      = len(model_names)
x             = np.arange(n_metrics)
bar_w         = 0.20

fig, ax = plt.subplots(figsize=(13, 6.5), facecolor="white")
ax.set_facecolor("#fafafa")

for i, (mn, color) in enumerate(zip(model_names, PALETTE)):
    vals   = [d[1][i] for d in metric_defs]
    offset = (i - n_models / 2 + 0.5) * bar_w
    bars   = ax.bar(x + offset, vals, bar_w,
                    label=mn, color=color,
                    edgecolor="white", linewidth=0.8, zorder=3)
    for bar, val in zip(bars, vals):
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            bar.get_height() + 0.009,
            f"{val:.4f}",
            ha="center", va="bottom",
            fontsize=7.5, fontweight="bold", color="#1b1b1b",
        )

ax.set_xticks(x)
ax.set_xticklabels(metric_labels, fontsize=11)
ax.set_ylabel("Score", fontsize=11)
ax.set_ylim(0, 1.15)
ax.set_title(
    "Model Comparison — Average Metrics Across All Periods\n"
    "Random Forest  |  XGBoost  |  SVM (RBF)",
    fontsize=13, fontweight="bold", pad=14,
)
ax.legend(fontsize=10, loc="upper right", framealpha=0.9)
ax.yaxis.grid(True, linestyle="--", alpha=0.5, zorder=0)
ax.set_axisbelow(True)
ax.spines["top"].set_visible(False)
ax.spines["right"].set_visible(False)
ax.annotate(
    "† MSE: lower is better",
    xy=(0.01, 0.015), xycoords="axes fraction",
    fontsize=8.5, color="gray", fontstyle="italic",
)

plt.tight_layout()
out1 = HERE / "model_metrics_chart.png"
fig.savefig(out1, dpi=150, bbox_inches="tight")
plt.close(fig)
print(f"Saved: {out1.name}")


# ─────────────────────────────────────────────────────────────────────────────
#  Figure 2 — Confusion matrices
# ─────────────────────────────────────────────────────────────────────────────
fig, axes = plt.subplots(1, n_models,
                         figsize=(5.5 * n_models, 5.5),
                         facecolor="white")
if n_models == 1:
    axes = [axes]

last_im = None
for ax, mn in zip(axes, model_names):
    cm = agg_cm(mn)
    if cm is None:
        ax.text(0.5, 0.5, "No data", ha="center", va="center",
                transform=ax.transAxes)
        ax.set_title(mn)
        continue

    row_sums  = cm.sum(axis=1, keepdims=True).clip(min=1)
    cm_norm   = cm.astype(float) / row_sums
    last_im   = ax.imshow(cm_norm, cmap=GREEN_MAP, vmin=0, vmax=1, aspect="auto")

    ticks = np.arange(len(CLASS_NAMES))
    ax.set_xticks(ticks)
    ax.set_yticks(ticks)
    ax.set_xticklabels(CLASS_NAMES, rotation=30, ha="right", fontsize=9)
    ax.set_yticklabels(CLASS_NAMES, fontsize=9)
    ax.set_xlabel("Predicted Label", fontsize=10)
    if ax is axes[0]:
        ax.set_ylabel("True Label", fontsize=10)
    ax.set_title(mn, fontsize=12, fontweight="bold", pad=10)

    for r in range(len(CLASS_NAMES)):
        for c in range(len(CLASS_NAMES)):
            nval      = cm_norm[r, c]
            raw       = int(cm[r, c])
            txt_color = "white" if nval >= 0.5 else "#1b1b1b"
            ax.text(
                c, r, f"{nval:.2f}\n({raw})",
                ha="center", va="center", fontsize=8,
                color=txt_color,
                fontweight="bold" if r == c else "normal",
            )

if last_im is not None:
    fig.colorbar(last_im, ax=axes[-1], fraction=0.04, pad=0.04,
                 label="Row-normalised  (Recall per class)")

fig.suptitle(
    "Confusion Matrices — Aggregated Across All Periods\n"
    "(Row-normalised · raw counts in parentheses)",
    fontsize=13, fontweight="bold", y=1.02,
)
plt.tight_layout()
out2 = HERE / "model_cm_chart.png"
fig.savefig(out2, dpi=150, bbox_inches="tight")
plt.close(fig)
print(f"Saved: {out2.name}")


# ─────────────────────────────────────────────────────────────────────────────
#  Console summary table
# ─────────────────────────────────────────────────────────────────────────────
n_periods = ranking[0].get("periods_completed", "?") if ranking else "?"
W = 88
print(f"\n{'═' * W}")
print(f"  MODEL COMPARISON SUMMARY  —  averaged across {n_periods} period(s)")
print(f"{'═' * W}")
print(f"  {'Model':<22} {'Accuracy':>10} {'Precision':>10} "
      f"{'Recall':>10} {'F1':>10} {'MSE':>8} {'CV Acc':>9}")
print(f"  {'─' * 22} {'─' * 10} {'─' * 10} {'─' * 10} {'─' * 10} {'─' * 8} {'─' * 9}")

for r in ranking:
    mn   = r["model"]
    acc  = r["avg_accuracy"]
    prec = macro_avg(mn, "precision")
    rec  = macro_avg(mn, "recall")
    f1   = macro_avg(mn, "f1")
    mse  = r["avg_mse"]
    cv   = r["avg_cv_accuracy"]
    tag  = "  ← BEST" if r["rank"] == 1 else ""
    print(
        f"  {mn:<22} {acc:>10.4f} {prec:>10.4f} "
        f"{rec:>10.4f} {f1:>10.4f} {mse:>8.4f} {cv:>9.4f}{tag}"
    )

print(f"{'═' * W}")

# Per-class breakdown
print(f"\n  PER-CLASS BREAKDOWN  (macro-averaged across all periods)")
print(f"  {'─' * 70}")
print(f"  {'Model / Class':<28} {'Precision':>10} {'Recall':>10} {'F1':>10}")
print(f"  {'─' * 70}")
for mn in model_names:
    print(f"  {mn}")
    for cls in CLASS_NAMES:
        prec = _avg(mn, "per_class", cls, "precision")
        rec  = _avg(mn, "per_class", cls, "recall")
        f1   = _avg(mn, "per_class", cls, "f1")
        print(f"    {cls:<26} {prec:>10.4f} {rec:>10.4f} {f1:>10.4f}")
    print()

print(f"  Charts saved to: {HERE}")
print(f"  Done.\n")
