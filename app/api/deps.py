from bson import ObjectId
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.core.config import settings
from app.core.database import get_database
from app.core.security import decode_access_token
from app.models.user import UserResponse, UserRole

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/login"
)


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncIOMotorDatabase = Depends(get_database)
) -> UserResponse:
    """
    Dépendance de sécurité principale :
    1. Valide la signature cryptographique du JWT.
    2. Extrait l'identifiant utilisateur (sub) et l'identifiant de son entreprise (company_id).
    3. Vérifie l'existence et l'activation du compte en base de données.
    4. Garantit l'étanchéité multi-tenant : l'utilisateur est lié de manière immuable à son entreprise.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Identifiants d'authentification invalides ou session expirée.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception

    user_id: str = payload.get("sub")
    company_id: str = payload.get("company_id")
    if not user_id or not company_id or not ObjectId.is_valid(user_id):
        raise credentials_exception

    user_doc = await db.users.find_one({"_id": ObjectId(user_id), "is_active": True})
    if not user_doc:
        raise credentials_exception

    # Vérification stricte que le company_id du token correspond au document en base
    if str(user_doc.get("company_id")) != company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Incohérence d'isolation d'entreprise détectée."
        )

    # Conversion de l'ObjectId MongoDB pour instancier UserResponse
    user_doc["_id"] = str(user_doc["_id"])
    user_doc["company_id"] = str(user_doc["company_id"])

    return UserResponse(**user_doc)


async def get_current_admin_user(
    current_user: UserResponse = Depends(get_current_user)
) -> UserResponse:
    """Vérifie que l'utilisateur courant possède le rôle d'administrateur au sein de son entreprise."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Action refusée : privilèges administrateur requis pour cette opération."
        )
    return current_user
