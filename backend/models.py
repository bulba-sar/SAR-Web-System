from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from database import Base


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class TileCache(Base):
    """Persistent cache for GEE tile URLs stored in Supabase.
    GEE tile tokens expire in ~6 hours, so entries are refreshed
    after CACHE_TTL_HOURS (see main.py).  Storing them here means
    every dashboard on every client skips the 3-8 s GEE round-trip
    after the very first request for a given map config.
    """
    __tablename__ = "tile_cache"

    id         = Column(Integer, primary_key=True, index=True)
    cache_key  = Column(String(300), unique=True, index=True, nullable=False)
    tile_url   = Column(Text, nullable=False)
    created_at = Column(DateTime, default=_utcnow)


class LulcStatsCache(Base):
    """Persistent cache for CALABARZON-wide LULC pixel stats.
    Computed once from the local TIF (rasterio + numpy), then stored here.
    Subsequent requests for the same year/period return instantly from DB.
    """
    __tablename__ = "lulc_stats_cache"

    id           = Column(Integer, primary_key=True, index=True)
    cache_key    = Column(String(50), unique=True, index=True, nullable=False)  # e.g. "2024-Jan-Jun"
    year         = Column(Integer, nullable=False)
    period       = Column(String(20), nullable=False)
    total_pixels = Column(Integer, nullable=False)
    stats_json   = Column(Text, nullable=False)   # full classes dict as JSON string
    created_at   = Column(DateTime, default=_utcnow)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(200), unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    institution = Column(String(200), nullable=True)
    role        = Column(String(50), default="Researcher")
    permissions = Column(Text, nullable=True)  # JSON override; NULL = use role defaults
    created_at  = Column(DateTime, default=_utcnow)

    aois = relationship("SavedAOI", back_populates="user", cascade="all, delete-orphan")


class SavedAOI(Base):
    __tablename__ = "saved_aois"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    geojson = Column(Text, nullable=False)  # JSON string of [{lat, lng}, ...] array
    created_at = Column(DateTime, default=_utcnow)

    user = relationship("User", back_populates="aois")


class RolePermission(Base):
    """Per-role feature flags controlled by admins.
    permissions is a JSON string: { "analysis_tab": true, "save_aois": false, ... }
    """
    __tablename__ = "role_permissions"

    id          = Column(Integer, primary_key=True, index=True)
    role        = Column(String(50), unique=True, nullable=False, index=True)
    permissions = Column(Text, nullable=False)  # JSON string
    updated_at  = Column(DateTime, default=_utcnow)


class AdminAOI(Base):
    """System-level Areas of Interest managed by admin users.
    Stored separately from user-saved AOIs so they can be shared
    across all sessions and serve as reference datasets.
    source: 'manual' | 'geojson' | 'shapefile'
    """
    __tablename__ = "admin_aois"

    id          = Column(Integer, primary_key=True, index=True)
    name        = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    geojson     = Column(Text, nullable=False)  # Full GeoJSON string (Feature, FeatureCollection, or Geometry)
    source      = Column(String(50), default="manual")  # 'manual' | 'geojson' | 'shapefile'
    created_by  = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at  = Column(DateTime, default=_utcnow)



