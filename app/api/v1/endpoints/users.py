from datetime import datetime, timezone
from typing import List
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.api.deps import get_current_admin_user, get_current_user
from app.core.database import get_database
from app.core.security import get_password_hash
from app.models.user import UserCreate, UserResponse, UserRole, UserUpdate

router = APIRouter(prefix="/users", tags=["Gestion des Utilisateurs"])


@router.post(
    "/",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Création d'un nouvel utilisateur au sein de l'entreprise"
)
async def create_user(
    user_in: UserCreate,
    current_admin: UserResponse = Depends(get_current_admin_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Crée un collaborateur (membre ou admin).
    ISOLATION LOGICIELLE STRICTE :
    Le 'company_id' est automatiquement assigné à partir de l'administrateur connecté.
    Il est impossible d'injecter un utilisateur dans une autre entreprise cliente.
    """
    # 1. Vérification de l'unicité globale de l'email
    existing_user = await db.users.find_one({"email": user_in.email.lower()})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Un compte avec cette adresse email existe déjà."
        )

    now = datetime.now(timezone.utc)

    # 2. Assignation forcée à l'entreprise de l'administrateur
    company_obj_id = ObjectId(current_admin.company_id)

    new_user_doc = {
        "email": user_in.email.lower(),
        "full_name": user_in.full_name,
        "hashed_password": get_password_hash(user_in.password),
        "role": user_in.role.value,
        "company_id": company_obj_id,
        "is_active": user_in.is_active,
        "created_at": now,
    }

    result = await db.users.insert_one(new_user_doc)
    user_id = str(result.inserted_id)

    return UserResponse(
        id=user_id,
        email=user_in.email.lower(),
        full_name=user_in.full_name,
        role=user_in.role,
        company_id=str(company_obj_id),
        is_active=user_in.is_active,
        created_at=now,
    )


@router.get(
    "/",
    response_model=List[UserResponse],
    summary="Lister tous les utilisateurs de l'entreprise connectée"
)
async def list_company_users(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Retourne la liste des utilisateurs appartenant EXCLUSIVEMENT
    à la même entreprise que l'utilisateur appelant.
    """
    company_obj_id = ObjectId(current_user.company_id)
    cursor = db.users.find({"company_id": company_obj_id})

    users: List[UserResponse] = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        doc["company_id"] = str(doc["company_id"])
        users.append(UserResponse(**doc))

    return users


@router.get(
    "/{user_id}",
    response_model=UserResponse,
    summary="Consulter le profil d'un collaborateur de l'entreprise"
)
async def get_user_by_id(
    user_id: str,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Recherche un utilisateur par son identifiant.
    L'isolation logicielle garantit qu'un utilisateur d'une autre entreprise
    renvoie un statut 404 (ressource inexistante pour le locataire).
    """
    if not ObjectId.is_valid(user_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Identifiant utilisateur invalide."
        )

    doc = await db.users.find_one({
        "_id": ObjectId(user_id),
        "company_id": ObjectId(current_user.company_id)
    })

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Utilisateur introuvable dans votre entreprise."
        )

    doc["_id"] = str(doc["_id"])
    doc["company_id"] = str(doc["company_id"])
    return UserResponse(**doc)


@router.put(
    "/{user_id}",
    response_model=UserResponse,
    summary="Mettre à jour les informations d'un collaborateur (Admin)"
)
async def update_user(
    user_id: str,
    user_in: UserUpdate,
    current_admin: UserResponse = Depends(get_current_admin_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Permet à un administrateur de modifier les informations d'un collaborateur de son entreprise
    (nom, rôle, mot de passe, statut actif/inactif). L'isolation logicielle est strictement respectée.
    """
    if not ObjectId.is_valid(user_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Identifiant utilisateur invalide."
        )

    update_data = {k: v for k, v in user_in.model_dump(exclude_unset=True).items() if v is not None}
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Aucune donnée fournie pour la mise à jour."
        )

    if "password" in update_data:
        update_data["hashed_password"] = get_password_hash(update_data.pop("password"))

    if "role" in update_data and hasattr(update_data["role"], "value"):
        update_data["role"] = update_data["role"].value

    result = await db.users.find_one_and_update(
        {
            "_id": ObjectId(user_id),
            "company_id": ObjectId(current_admin.company_id)
        },
        {"$set": update_data},
        return_document=True
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Utilisateur non trouvé au sein de votre entreprise."
        )

    result["_id"] = str(result["_id"])
    result["company_id"] = str(result["company_id"])
    return UserResponse(**result)


@router.delete(
    "/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Supprimer un collaborateur de l'entreprise"
)
async def delete_user(
    user_id: str,
    current_admin: UserResponse = Depends(get_current_admin_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Suppression d'un utilisateur par un administrateur (toujours restreinte à son entreprise)."""
    if not ObjectId.is_valid(user_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Identifiant utilisateur invalide."
        )

    # Empêcher l'auto-suppression de l'admin
    if user_id == str(current_admin.id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vous ne pouvez pas supprimer votre propre compte administrateur."
        )

    result = await db.users.delete_one({
        "_id": ObjectId(user_id),
        "company_id": ObjectId(current_admin.company_id)
    })

    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Utilisateur non trouvé au sein de votre entreprise."
        )

    return None
