from datetime import datetime, timezone
from typing import List, Optional
from pydantic import Field
from app.models.common import MongoBaseModel, PyObjectId


class ProjectBase(MongoBaseModel):
    name: str = Field(..., min_length=1, max_length=150, description="Nom du projet")
    description: Optional[str] = Field(None, max_length=1000, description="Description du projet")
    member_ids: List[PyObjectId] = Field(default_factory=list, description="Liste des identifiants des utilisateurs membres du projet")


class ProjectCreate(MongoBaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    description: Optional[str] = Field(None, max_length=1000)
    member_ids: List[PyObjectId] = Field(default_factory=list)


class ProjectUpdate(MongoBaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=150)
    description: Optional[str] = Field(None, max_length=1000)
    member_ids: Optional[List[PyObjectId]] = None


class ProjectResponse(ProjectBase):
    id: PyObjectId = Field(alias="_id", serialization_alias="id")
    company_id: PyObjectId = Field(..., description="Entreprise propriétaire du projet (isolation multi-tenant)")
    created_at: datetime
    updated_at: datetime


class ProjectInDB(ProjectBase):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    company_id: PyObjectId
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
