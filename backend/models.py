from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(200), unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    institution = Column(String(200), nullable=True)
    role = Column(String(50), default="Researcher")
    created_at = Column(DateTime, default=datetime.utcnow)

    aois = relationship("SavedAOI", back_populates="user", cascade="all, delete-orphan")


class SavedAOI(Base):
    __tablename__ = "saved_aois"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    geojson = Column(Text, nullable=False)  # JSON string of [{lat, lng}, ...] array
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="aois")
