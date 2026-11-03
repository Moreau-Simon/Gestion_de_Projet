from datetime import datetime, timezone
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.api.deps import get_current_admin_user, get_current_user
from app.core.database import get_database
from app.models.company import CompanyResponse, CompanyUpdate
from app.models.user import UserResponse

router = APIRouter(prefix="/companies", tags=["Gestion de l'Entreprise"])


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
    update_data = {k: v for k, v in company_in.model_dump(exclude_unset=True).items() if v is not None}
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Aucune donnée fournie pour la mise à jour."
        )

    # Si modification du nom, vérifier qu'il n'est pas déjà pris
    if "name" in update_data:
        conflict = await db.companies.find_one({
            "name": update_data["name"],
            "_id": {"$ne": ObjectId(current_admin.company_id)}
        })
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Une autre entreprise porte déjà ce nom."
            )

    update_data["updated_at"] = datetime.now(timezone.utc)

    result = await db.companies.find_one_and_update(
        {"_id": ObjectId(current_admin.company_id)},
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
    """
    Supprime l'entreprise cliente ainsi que tous les utilisateurs, projets et tâches
    liés à son identifiant (Suppression en cascade respectant l'isolation logicielle).
    """
    company_oid = ObjectId(current_admin.company_id)

    # Suppression en cascade dans chaque collection isolée par company_id
    await db.tasks.delete_many({"company_id": company_oid})
    await db.projects.delete_many({"company_id": company_oid})
    await db.users.delete_many({"company_id": company_oid})
    await db.companies.delete_one({"_id": company_oid})

    return None
