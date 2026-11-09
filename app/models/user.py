from datetime import datetime, timezone
from enum import Enum
from typing import Optional
from pydantic import EmailStr, Field
from app.models.common import MongoBaseModel, PyObjectId


class UserRole(str, Enum):
    ADMIN = "admin"
    MEMBER = "member"


class UserBase(MongoBaseModel):
    email: str = Field(..., min_length=3, max_length=100, description="Adresse email de l'utilisateur")
    full_name: str = Field(..., min_length=1, max_length=100, description="Nom complet de l'utilisateur")
    role: UserRole = Field(default=UserRole.MEMBER, description="Rôle au sein de l'entreprise (admin ou member)")
    is_active: bool = Field(default=True, description="Statut du compte utilisateur")


class UserCreate(UserBase):
    password: str = Field(..., min_length=1, description="Mot de passe en clair (sera haché)")
    # company_id volontairement ABSENT de ce schéma de requête :
    # il est automatiquement déduit du token JWT de l'administrateur connecté
    # pour garantir l'isolation logicielle stricte entre entreprises clientes.


class UserUpdate(MongoBaseModel):
    full_name: Optional[str] = Field(None, min_length=1, max_length=100, description="Nom complet")
    role: Optional[UserRole] = Field(None, description="Rôle utilisateur (admin ou member)")
    is_active: Optional[bool] = Field(None, description="Statut actif/inactif du compte")
    password: Optional[str] = Field(None, min_length=1, description="Nouveau mot de passe facultatif")


class UserResponse(UserBase):
    id: PyObjectId = Field(alias="_id", serialization_alias="id")
    company_id: PyObjectId = Field(..., description="Entreprise cliente à laquelle appartient l'utilisateur")
    created_at: datetime


class UserInDB(UserBase):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    hashed_password: str
    company_id: PyObjectId
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# Modèles dédiés à l'enregistrement initial d'une entreprise et de son premier administrateur
class CompanyRegisterRequest(MongoBaseModel):
    company_name: str = Field(..., min_length=1, max_length=100, description="Nom de l'entreprise à créer")
    company_description: Optional[str] = Field(None, max_length=500, description="Description facultative")
    admin_email: str = Field(..., min_length=3, max_length=100, description="Email du premier compte administrateur")
    admin_full_name: str = Field(..., min_length=1, max_length=100, description="Nom complet de l'administrateur")
    admin_password: str = Field(..., min_length=1, description="Mot de passe du compte administrateur")


class LoginRequest(MongoBaseModel):
    email: str = Field(..., min_length=1, description="Email de connexion")
    password: str = Field(..., min_length=1, description="Mot de passe")


class TokenResponse(MongoBaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
