"""
admin.py — Admin-only API routes for AOI content management.

Endpoints (all require role == "Admin"):
  GET    /admin/aois              — list all admin AOIs
  POST   /admin/aois              — create AOI from raw GeoJSON body
  PUT    /admin/aois/{id}         — update name / description / geojson
  DELETE /admin/aois/{id}         — delete an AOI
  POST   /admin/aois/upload       — upload .geojson/.json or .zip Shapefile
  GET    /admin/users             — list all registered users
"""

import asyncio
import io
import json
import pathlib
import re
from datetime import datetime

import ee
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.features import geometry_mask

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from validation import validate_dataset

_TIF_DIR = pathlib.Path(__file__).parent / "tif"
_TIF_DIR.mkdir(exist_ok=True)

VALID_PERIODS = ["Jan-Jun", "Jul-Dec"]
VALID_YEARS   = list(range(2021, 2031))

# ── Nodata fix helpers ────────────────────────────────────────────────────────

_CALABARZON_BOUNDARY: dict | None = None  # fetched from GEE once, then cached

def _get_calabarzon_boundary() -> dict:
    global _CALABARZON_BOUNDARY
    if _CALABARZON_BOUNDARY is None:
        fc = (
            ee.FeatureCollection("FAO/GAUL/2015/level2")
            .filter(ee.Filter.inList("ADM2_NAME", ["Batangas", "Cavite", "Laguna", "Quezon", "Rizal"]))
        )
        _CALABARZON_BOUNDARY = fc.geometry().getInfo()
    return _CALABARZON_BOUNDARY


_NODATA = 255
_OVERVIEW_LEVELS = [2, 4, 8, 16, 32, 64]


def _fix_nodata_single(tif_path: pathlib.Path) -> str:
    """Mask pixels outside CALABARZON to 255 (nodata) and rebuild overviews."""
    boundary_geom = _get_calabarzon_boundary()
    with rasterio.open(tif_path, "r+") as ds:
        if ds.count != 1:
            return f"skipped ({ds.count} bands)"
        outside = geometry_mask(
            [boundary_geom],
            out_shape=(ds.height, ds.width),
            transform=ds.transform,
            invert=False,
        )
        data = ds.read(1)
        data[outside] = _NODATA
        ds.write(data, 1)
        ds.nodata = _NODATA
    with rasterio.open(tif_path, "r+") as ds:
        ds.build_overviews(_OVERVIEW_LEVELS, Resampling.nearest)
        ds.update_tags(ns="rio_overview", resampling="nearest")
    return "ok"

import auth as auth_module
import models
from database import get_db

router = APIRouter(prefix="/admin", tags=["admin"])


# ── Permission helpers ────────────────────────────────────────────────────────

def _get_or_create_permissions(role: str, db) -> models.RolePermission:
    """Return the RolePermission row for a role, creating it with defaults if absent."""
    row = db.query(models.RolePermission).filter(models.RolePermission.role == role).first()
    if row is None:
        row = models.RolePermission(
            role=role,
            permissions=json.dumps(DEFAULT_PERMISSIONS),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _row_to_dict(row: models.RolePermission) -> dict:
    perms = json.loads(row.permissions)
    # Ensure every known feature key is present (handles schema additions)
    for f in ALL_FEATURES:
        perms.setdefault(f, True)
    return {
        "role": row.role,
        "permissions": perms,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


# ── Admin guard ───────────────────────────────────────────────────────────────

ADMIN_ROLES = {"Admin", "Government Official"}

# ── Feature / permission registry ────────────────────────────────────────────

ALL_FEATURES = [
    "analysis_tab",
    "save_aois",
    "protected_areas",
    "crop_suitability",
    "lulc_analysis",
    "crop_intensity",
    "compare_view",
]

# All features enabled by default for every role
DEFAULT_PERMISSIONS: dict[str, bool] = {f: True for f in ALL_FEATURES}

CONFIGURABLE_ROLES = ["Researcher", "Student", "Farmer", "Government Official", "Admin"]


def get_admin_user(
    current_user: models.User = Depends(auth_module.get_current_user),
):
    """Dependency: raises 403 unless the authenticated user has an admin-level role."""
    if current_user.role not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class AdminAOICreate(BaseModel):
    name: str
    description: Optional[str] = None
    geojson: str  # raw GeoJSON string


class AdminAOIUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    geojson: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _aoi_to_dict(aoi: models.AdminAOI) -> dict:
    return {
        "id": aoi.id,
        "name": aoi.name,
        "description": aoi.description,
        "geojson": aoi.geojson,
        "source": aoi.source,
        "created_by": aoi.created_by,
        "created_at": aoi.created_at.isoformat() if aoi.created_at else None,
    }


def _validate_geojson(raw: str) -> dict:
    """Parse and return the GeoJSON dict, or raise 400."""
    try:
        data = json.loads(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid GeoJSON — not valid JSON")
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="Invalid GeoJSON — must be a JSON object")
    if data.get("type") not in (
        "Feature", "FeatureCollection",
        "Polygon", "MultiPolygon", "Point", "LineString",
        "MultiPoint", "MultiLineString", "GeometryCollection",
    ):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid GeoJSON type: {data.get('type')}",
        )
    return data


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("/aois")
def list_admin_aois(
    admin: models.User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Return all admin-managed AOIs, newest first."""
    aois = (
        db.query(models.AdminAOI)
        .order_by(models.AdminAOI.created_at.desc())
        .all()
    )
    return [_aoi_to_dict(a) for a in aois]


# ── Create (JSON body) ────────────────────────────────────────────────────────

@router.post("/aois")
def create_admin_aoi(
    req: AdminAOICreate,
    admin: models.User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Create a new admin AOI from a raw GeoJSON string in the request body."""
    _validate_geojson(req.geojson)
    aoi = models.AdminAOI(
        name=req.name,
        description=req.description,
        geojson=req.geojson,
        source="manual",
        created_by=admin.id,
    )
    db.add(aoi)
    db.commit()
    db.refresh(aoi)
    return _aoi_to_dict(aoi)


# ── Update ────────────────────────────────────────────────────────────────────

@router.put("/aois/{aoi_id}")
def update_admin_aoi(
    aoi_id: int,
    req: AdminAOIUpdate,
    admin: models.User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    aoi = db.query(models.AdminAOI).filter(models.AdminAOI.id == aoi_id).first()
    if not aoi:
        raise HTTPException(status_code=404, detail="AOI not found")

    if req.name is not None:
        aoi.name = req.name
    if req.description is not None:
        aoi.description = req.description
    if req.geojson is not None:
        _validate_geojson(req.geojson)
        aoi.geojson = req.geojson

    db.commit()
    db.refresh(aoi)
    return _aoi_to_dict(aoi)


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete("/aois/{aoi_id}")
def delete_admin_aoi(
    aoi_id: int,
    admin: models.User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    aoi = db.query(models.AdminAOI).filter(models.AdminAOI.id == aoi_id).first()
    if not aoi:
        raise HTTPException(status_code=404, detail="AOI not found")
    db.delete(aoi)
    db.commit()
    return {"message": "Deleted"}


# ── Upload (GeoJSON file or Shapefile ZIP) ────────────────────────────────────

@router.post("/aois/upload")
async def upload_aoi_file(
    name: str = Form(...),
    description: str = Form(""),
    file: UploadFile = File(...),
    admin: models.User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """
    Accept a .geojson / .json file or a .zip containing a Shapefile.
    Parses the geometry and stores it as an AdminAOI.

    For Shapefile ZIPs, geopandas must be installed:
        pip install geopandas
    """
    filename = (file.filename or "").lower()
    contents = await file.read()

    if filename.endswith(".geojson") or filename.endswith(".json"):
        try:
            geojson_data = json.loads(contents)
        except Exception:
            raise HTTPException(status_code=400, detail="Cannot parse GeoJSON file — not valid JSON")
        _validate_geojson(json.dumps(geojson_data))
        geojson_str = json.dumps(geojson_data)
        source = "geojson"

    elif filename.endswith(".zip"):
        geojson_str, source = _parse_shapefile_zip(contents)

    else:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Upload a .geojson, .json, or .zip (containing a Shapefile).",
        )

    aoi = models.AdminAOI(
        name=name,
        description=description or None,
        geojson=geojson_str,
        source=source,
        created_by=admin.id,
    )
    db.add(aoi)
    db.commit()
    db.refresh(aoi)
    return _aoi_to_dict(aoi)


def _parse_shapefile_zip(contents: bytes) -> tuple[str, str]:
    """Extract and parse a Shapefile from a ZIP archive.
    Returns (geojson_str, source_label).
    Requires geopandas.
    """
    try:
        import geopandas as gpd
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="geopandas is not installed. Run: pip install geopandas",
        )

    import os
    import tempfile
    import zipfile

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            with zipfile.ZipFile(io.BytesIO(contents)) as zf:
                zf.extractall(tmpdir)

            # Walk for the first .shp file (supports nested directories)
            shp_path = None
            for root, _dirs, files in os.walk(tmpdir):
                for fname in files:
                    if fname.lower().endswith(".shp"):
                        shp_path = os.path.join(root, fname)
                        break
                if shp_path:
                    break

            if not shp_path:
                raise HTTPException(
                    status_code=400,
                    detail="No .shp file found inside the ZIP archive.",
                )

            gdf = gpd.read_file(shp_path)
            gdf = gdf.to_crs(epsg=4326)  # ensure WGS-84

            # Drop non-serialisable columns (e.g. date types that json can't encode)
            for col in gdf.columns:
                if col == "geometry":
                    continue
                try:
                    json.dumps(gdf[col].iloc[0])
                except Exception:
                    gdf = gdf.drop(columns=[col])

            geojson_str = gdf.to_json()
            return geojson_str, "shapefile"

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to parse Shapefile: {exc}",
        )


# ── Users ────────────────────────────────────────────────────────────────────

class UpdateUserRoleRequest(BaseModel):
    role: str


ALLOWED_ROLES = {"Researcher", "Student", "Farmer", "Government Official", "Admin"}


@router.put("/users/{user_id}/role")
def update_user_role(
    user_id: int,
    req: UpdateUserRoleRequest,
    admin: models.User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    if req.role not in ALLOWED_ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role. Allowed: {', '.join(sorted(ALLOWED_ROLES))}",
        )
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.role = req.role
    db.commit()
    db.refresh(user)
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "institution": user.institution,
        "role": user.role,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


@router.get("/users/{user_id}/permissions")
def get_user_permissions(
    user_id: int,
    admin: models.User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Return the effective permissions for a specific user."""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.permissions:
        perms = json.loads(user.permissions)
    else:
        row = db.query(models.RolePermission).filter(
            models.RolePermission.role == user.role
        ).first()
        perms = json.loads(row.permissions) if row else dict(DEFAULT_PERMISSIONS)

    for f in ALL_FEATURES:
        perms.setdefault(f, True)

    return {
        "user_id": user_id,
        "role": user.role,
        "permissions": perms,
        "is_custom": user.permissions is not None,
    }


@router.put("/users/{user_id}/permissions")
def update_user_permissions(
    user_id: int,
    body: dict,
    admin: models.User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Update role and/or individual feature flags for a specific user.
    Body: { "role": "Researcher", "lulc_analysis": false, ... }
    Passing reset=true clears user-specific overrides and reverts to role defaults.
    """
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if body.get("reset"):
        user.permissions = None
        if "role" in body and body["role"] in ALLOWED_ROLES:
            user.role = body["role"]
        db.commit()
        db.refresh(user)
        return {"id": user.id, "name": user.name, "role": user.role, "permissions": None}

    if "role" in body:
        if body["role"] not in ALLOWED_ROLES:
            raise HTTPException(status_code=400, detail="Invalid role")
        user.role = body["role"]

    feature_updates = {f: body[f] for f in ALL_FEATURES if f in body}
    if feature_updates:
        if user.permissions:
            current_perms = json.loads(user.permissions)
        else:
            row = db.query(models.RolePermission).filter(
                models.RolePermission.role == user.role
            ).first()
            current_perms = json.loads(row.permissions) if row else dict(DEFAULT_PERMISSIONS)
        for f in ALL_FEATURES:
            current_perms.setdefault(f, True)
        current_perms.update(feature_updates)
        user.permissions = json.dumps(current_perms)

    db.commit()
    db.refresh(user)
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "institution": user.institution,
        "role": user.role,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    admin: models.User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
    return {"message": "Deleted"}


# ── Permissions CRUD ─────────────────────────────────────────────────────────

@router.get("/permissions")
def list_permissions(
    admin: models.User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Return permissions for every configurable role, seeding defaults where missing."""
    return [_row_to_dict(_get_or_create_permissions(role, db)) for role in CONFIGURABLE_ROLES]


@router.put("/permissions/{role}")
def update_permissions(
    role: str,
    body: dict,
    admin: models.User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Update the feature flags for a single role.
    Body: { "analysis_tab": true, "save_aois": false, ... }
    Unknown keys are ignored; missing keys keep their existing value.
    """
    if role not in CONFIGURABLE_ROLES:
        raise HTTPException(status_code=400, detail=f"Unknown role: {role}")

    row = _get_or_create_permissions(role, db)
    current = json.loads(row.permissions)

    for feature in ALL_FEATURES:
        if feature in body:
            value = body[feature]
            if not isinstance(value, bool):
                raise HTTPException(status_code=400, detail=f"Value for '{feature}' must be a boolean")
            current[feature] = value

    row.permissions = json.dumps(current)
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _row_to_dict(row)



# ── Users ─────────────────────────────────────────────────────────────────────

@router.get("/users")
def list_users(
    admin: models.User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Return all registered users (passwords excluded)."""
    users = (
        db.query(models.User)
        .order_by(models.User.created_at.desc())
        .all()
    )
    return [
        {
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "institution": u.institution,
            "role": u.role,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]


# ── Dataset (TIF) management ──────────────────────────────────────────────────

@router.get("/datasets")
def list_datasets(admin: models.User = Depends(get_admin_user)):
    """Return all TIF files present in backend/tif/."""
    files = []
    for f in sorted(_TIF_DIR.glob("*.tif")):
        stat = f.stat()
        files.append({
            "filename": f.name,
            "size_bytes": stat.st_size,
            "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
        })
    return files


@router.post("/datasets/upload")
async def upload_dataset(
    year: int = Form(...),
    period: str = Form(...),
    custom_name: Optional[str] = Form(None),
    file: UploadFile = File(...),
    admin: models.User = Depends(get_admin_user),
):
    """Save an uploaded .tif to backend/tif/ and run the nodata fix automatically."""
    # ── Basic form field validation ────────────────────────────────────────
    if year not in VALID_YEARS:
        raise HTTPException(status_code=400, detail=f"Invalid year: {year}. Must be 2021–2030.")
    if period not in VALID_PERIODS:
        raise HTTPException(status_code=400, detail=f"Invalid period. Must be one of: {VALID_PERIODS}")

    fname = (file.filename or "").lower()
    if not (fname.endswith(".tif") or fname.endswith(".tiff")):
        raise HTTPException(status_code=400, detail="File must be a GeoTIFF (.tif or .tiff)")

    # ── Determine final filename ───────────────────────────────────────────
    if custom_name and custom_name.strip():
        safe = re.sub(r"[^\w\-]", "_", custom_name.strip())
        if not safe.lower().endswith(".tif"):
            safe += ".tif"
        dest_name = safe
    else:
        dest_name = f"{year}-{period}.tif"

    # ── Read file bytes then run validation (Tier 1 + Tier 2) ─────────────
    contents = await file.read()
    existing = [f.name for f in _TIF_DIR.glob("*.tif")]

    validation = await asyncio.to_thread(validate_dataset, contents, dest_name, existing)

    if not validation.is_valid:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Dataset failed validation. Upload rejected.",
                "errors": validation.errors,
                "warnings": validation.warnings,
                "info": validation.info,
            },
        )

    # ── Write to disk ──────────────────────────────────────────────────────
    dest = _TIF_DIR / dest_name
    dest.write_bytes(contents)

    # ── Run the nodata fix in a thread (rasterio + GEE boundary fetch) ─────
    try:
        fix_status = await asyncio.to_thread(_fix_nodata_single, dest)
    except Exception as exc:
        fix_status = f"fix failed: {exc}"

    return {
        "message": f"{dest_name} uploaded and processed (nodata fix: {fix_status})",
        "filename": dest_name,
        "size_bytes": len(contents),
        "nodata_fix": fix_status,
        "warnings": validation.warnings,
        "info": validation.info,
    }


@router.delete("/datasets/{filename:path}")
def delete_dataset(
    filename: str,
    admin: models.User = Depends(get_admin_user),
):
    """Delete a TIF file from backend/tif/ by filename."""
    safe = pathlib.Path(filename).name  # strip any path traversal
    dest = _TIF_DIR / safe
    if not dest.exists():
        raise HTTPException(status_code=404, detail=f"{safe} not found")
    dest.unlink()
    return {"message": f"{safe} deleted"}
