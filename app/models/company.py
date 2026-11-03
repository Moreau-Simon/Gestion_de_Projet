from datetime import datetime, timezone
from typing import Optional
from pydantic import Field
from app.models.common import MongoBaseModel, PyObjectId


class CompanyBase(MongoBaseModel):
    name: str = Field(..., min_length=2, max_length=100, description="Nom unique de l'entreprise cliente")
    description: Optional[str] = Field(None, max_length=500, description="Description de l'activité ou de l'entreprise")


class CompanyCreate(CompanyBase):
    pass


class CompanyUpdate(MongoBaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = Field(None, max_length=500)


class CompanyResponse(CompanyBase):
    id: PyObjectId = Field(alias="_id", serialization_alias="id")
    created_at: datetime
    updated_at: datetime


class CompanyInDB(CompanyBase):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
