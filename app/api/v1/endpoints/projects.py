from datetime import datetime, timezone
from typing import List
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.api.deps import get_current_admin_user, get_current_user
from app.core.database import get_database
from app.models.project import ProjectCreate, ProjectResponse, ProjectUpdate
from app.models.user import UserResponse

router = APIRouter(prefix="/projects", tags=["Gestion des Projets"])


@router.post(
    "/",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Créer un nouveau projet au sein de l'entreprise"
)
async def create_project(
    project_in: ProjectCreate,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Crée un projet SaaS étanche :
    - Assignation automatique du company_id de l'utilisateur connecté.
    - Contrôle que les membres assignés appartiennent bien à la même entreprise.
    """
    company_oid = ObjectId(current_user.company_id)

    # Validation des membres éventuels
    member_oids: List[ObjectId] = []
    for member_id in project_in.member_ids:
        if not ObjectId.is_valid(member_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Identifiant membre invalide : {member_id}"
            )
        member_oids.append(ObjectId(member_id))

    if member_oids:
        count = await db.users.count_documents({
            "_id": {"$in": member_oids},
            "company_id": company_oid
        })
        if count != len(member_oids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Un ou plusieurs utilisateurs assignés n'appartiennent pas à votre entreprise."
            )

    # Par défaut, le créateur fait partie des membres
    current_user_oid = ObjectId(current_user.id)
    if current_user_oid not in member_oids:
        member_oids.append(current_user_oid)

    now = datetime.now(timezone.utc)
    project_doc = {
        "name": project_in.name,
        "description": project_in.description,
        "company_id": company_oid,
        "member_ids": [str(oid) for oid in member_oids],
        "created_at": now,
        "updated_at": now,
    }

    result = await db.projects.insert_one(project_doc)
    project_id = str(result.inserted_id)

    return ProjectResponse(
        id=project_id,
        name=project_doc["name"],
        description=project_doc["description"],
        company_id=str(company_oid),
        member_ids=project_doc["member_ids"],
        created_at=now,
        updated_at=now,
    )


@router.get(
    "/",
    response_model=List[ProjectResponse],
    summary="Lister tous les projets de son entreprise"
)
async def list_projects(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Retourne la liste des projets appartenant exclusivement à l'entreprise de l'utilisateur."""
    company_oid = ObjectId(current_user.company_id)
    cursor = db.projects.find({
        "company_id": {"$in": [company_oid, str(company_oid), str(current_user.company_id)]}
    }).sort("created_at", -1)
    projects: List[ProjectResponse] = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        doc["company_id"] = str(doc["company_id"])
        projects.append(ProjectResponse(**doc))
    return projects


@router.get(
    "/{project_id}",
    response_model=ProjectResponse,
    summary="Consulter les détails d'un projet"
)
async def get_project(
    project_id: str,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Recherche un projet spécifique sous le filtre de l'entreprise connectée."""
    if not ObjectId.is_valid(project_id):
        raise HTTPException(status_code=400, detail="Identifiant de projet invalide.")

    company_oid = ObjectId(current_user.company_id)
    doc = await db.projects.find_one({
        "_id": ObjectId(project_id),
        "company_id": {"$in": [company_oid, str(company_oid), str(current_user.company_id)]}
    })
    if not doc:
        raise HTTPException(status_code=404, detail="Projet introuvable dans votre entreprise.")

    doc["_id"] = str(doc["_id"])
    doc["company_id"] = str(doc["company_id"])
    return ProjectResponse(**doc)


@router.put(
    "/{project_id}",
    response_model=ProjectResponse,
    summary="Mettre à jour un projet"
)
async def update_project(
    project_id: str,
    project_in: ProjectUpdate,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Modifie le nom, la description ou les membres assignés à un projet."""
    if not ObjectId.is_valid(project_id):
        raise HTTPException(status_code=400, detail="Identifiant de projet invalide.")

    update_data = {k: v for k, v in project_in.model_dump(exclude_unset=True).items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="Aucun champ à mettre à jour.")

    company_oid = ObjectId(current_user.company_id)

    # Si les membres sont mis à jour, vérifier l'isolation
    if "member_ids" in update_data:
        member_oids = [ObjectId(m) for m in update_data["member_ids"] if ObjectId.is_valid(m)]
        count = await db.users.count_documents({
            "_id": {"$in": member_oids},
            "company_id": company_oid
        })
        if count != len(member_oids):
            raise HTTPException(
                status_code=400,
                detail="Un ou plusieurs membres n'appartiennent pas à votre entreprise."
            )
        update_data["member_ids"] = [str(m) for m in member_oids]

    update_data["updated_at"] = datetime.now(timezone.utc)

    result = await db.projects.find_one_and_update(
        {"_id": ObjectId(project_id), "company_id": {"$in": [company_oid, str(company_oid), str(current_user.company_id)]}},
        {"$set": update_data},
        return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="Projet introuvable dans votre entreprise.")

    result["_id"] = str(result["_id"])
    result["company_id"] = str(result["company_id"])
    return ProjectResponse(**result)


@router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Supprimer un projet et ses tâches associées"
)
async def delete_project(
    project_id: str,
    current_user: UserResponse = Depends(get_current_admin_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Supprime un projet et ses tâches en respectant l'isolation logicielle."""
    if not ObjectId.is_valid(project_id):
        raise HTTPException(status_code=400, detail="Identifiant de projet invalide.")

    project_oid = ObjectId(project_id)
    company_oid = ObjectId(current_user.company_id)

    result = await db.projects.delete_one({
        "_id": project_oid,
        "company_id": {"$in": [company_oid, str(company_oid), str(current_user.company_id)]}
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Projet introuvable.")

    # Nettoyage des tâches rattachées
    await db.tasks.delete_many({"project_id": project_oid, "company_id": company_oid})
    return None
