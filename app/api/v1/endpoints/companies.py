from datetime import datetime, timezone
from typing import List
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.api.deps import get_current_admin_user, get_current_user
from app.core.database import get_database
from app.models.company import CompanyCreate, CompanyResponse, CompanyUpdate
from app.models.user import UserResponse

router = APIRouter(prefix="/companies", tags=["Gestion de l'Entreprise"])


@router.post(
    "/",
    response_model=CompanyResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Créer une nouvelle entreprise (Alternative REST directe)"
)
async def create_company(
    company_in: CompanyCreate,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Crée une entreprise cliente dans la base de données.
    Pour l'inscription complète SaaS (Entreprise + Premier Administrateur + Token JWT),
    utiliser de préférence /auth/register-company.
    """
    existing = await db.companies.find_one({"name": company_in.name})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Une entreprise avec ce nom existe déjà."
        )

    now = datetime.now(timezone.utc)
    doc = {
        "name": company_in.name,
        "description": company_in.description,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.companies.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return CompanyResponse(**doc)


@router.get(
    "/",
    response_model=List[CompanyResponse],
    summary="Lister son entreprise (restreint au périmètre multi-tenant)"
)
async def list_companies(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Retourne la fiche de l'entreprise connectée."""
    doc = await db.companies.find_one({"_id": ObjectId(current_user.company_id)})
    if not doc:
        return []
    doc["_id"] = str(doc["_id"])
    return [CompanyResponse(**doc)]


@router.get(
    "/me",
    response_model=CompanyResponse,
    summary="Consulter les informations de l'entreprise actuelle"
)
async def get_my_company(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Retourne la fiche de l'entreprise cliente de l'utilisateur connecté."""
    doc = await db.companies.find_one({"_id": ObjectId(current_user.company_id)})
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Entreprise introuvable."
        )
    doc["_id"] = str(doc["_id"])
    return CompanyResponse(**doc)


@router.get(
    "/{company_id}",
    response_model=CompanyResponse,
    summary="Consulter les informations d'une entreprise par son identifiant"
)
async def get_company_by_id(
    company_id: str,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Retourne les informations de l'entreprise si elle correspond au périmètre de l'utilisateur."""
    target_id = current_user.company_id if company_id == "me" else company_id
    if target_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Entreprise introuvable au sein de votre périmètre d'accès."
        )

    if not ObjectId.is_valid(target_id):
        raise HTTPException(status_code=400, detail="Identifiant d'entreprise invalide.")

    doc = await db.companies.find_one({"_id": ObjectId(target_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Entreprise introuvable.")

    doc["_id"] = str(doc["_id"])
    return CompanyResponse(**doc)


@router.put(
    "/me",
    response_model=CompanyResponse,
    summary="Mettre à jour les informations de son entreprise (Admin)"
)
async def update_my_company(
    company_in: CompanyUpdate,
    current_admin: UserResponse = Depends(get_current_admin_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Permet à l'administrateur de mettre à jour le nom et la description de son entreprise."""
    return await _execute_company_update(str(current_admin.company_id), company_in, db)


@router.put(
    "/{company_id}",
    response_model=CompanyResponse,
    summary="Mettre à jour une entreprise par son identifiant (Admin)"
)
async def update_company_by_id(
    company_id: str,
    company_in: CompanyUpdate,
    current_admin: UserResponse = Depends(get_current_admin_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Permet à l'administrateur de mettre à jour son entreprise par ID (contrôle multi-tenant)."""
    target_id = current_admin.company_id if company_id == "me" else company_id
    if target_id != current_admin.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Entreprise introuvable au sein de votre périmètre d'accès."
        )
    return await _execute_company_update(target_id, company_in, db)


async def _execute_company_update(
    company_id: str,
    company_in: CompanyUpdate,
    db: AsyncIOMotorDatabase
) -> CompanyResponse:
    update_data = {k: v for k, v in company_in.model_dump(mode="json", exclude_unset=True).items() if v is not None}
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Aucune donnée fournie pour la mise à jour."
        )

    # Si modification du nom, vérifier qu'il n'est pas déjà pris
    if "name" in update_data:
        conflict = await db.companies.find_one({
            "name": update_data["name"],
            "_id": {"$ne": ObjectId(company_id)}
        })
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Une autre entreprise porte déjà ce nom."
            )

    update_data["updated_at"] = datetime.now(timezone.utc)

    result = await db.companies.find_one_and_update(
        {"_id": ObjectId(company_id)},
        {"$set": update_data},
        return_document=True
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Entreprise introuvable."
        )

    result["_id"] = str(result["_id"])
    return CompanyResponse(**result)


@router.delete(
    "/me",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Supprimer son entreprise et toutes ses données associées (Admin)"
)
async def delete_my_company(
    current_admin: UserResponse = Depends(get_current_admin_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Supprime l'entreprise cliente ainsi que tous les utilisateurs, projets et tâches liés."""
    return await _execute_company_delete(str(current_admin.company_id), db)


@router.delete(
    "/{company_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Supprimer une entreprise par identifiant (Admin)"
)
async def delete_company_by_id(
    company_id: str,
    current_admin: UserResponse = Depends(get_current_admin_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Supprime l'entreprise cliente par ID (contrôle multi-tenant)."""
    target_id = current_admin.company_id if company_id == "me" else company_id
    if target_id != current_admin.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Entreprise introuvable au sein de votre périmètre d'accès."
        )
    return await _execute_company_delete(target_id, db)


async def _execute_company_delete(
    company_id: str,
    db: AsyncIOMotorDatabase
) -> None:
    company_oid = ObjectId(company_id)
    # Suppression en cascade dans chaque collection isolée par company_id
    await db.tasks.delete_many({"company_id": company_oid})
    await db.projects.delete_many({"company_id": company_oid})
    await db.users.delete_many({"company_id": company_oid})
    await db.companies.delete_one({"_id": company_oid})
    return None
