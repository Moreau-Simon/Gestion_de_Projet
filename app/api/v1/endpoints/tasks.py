from datetime import datetime, timezone
from typing import Dict, List, Optional
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.api.deps import get_current_user
from app.core.database import get_database
from app.models.task import KanbanBoardResponse, TaskCreate, TaskResponse, TaskStatus, TaskUpdate
from app.models.user import UserResponse

router = APIRouter(prefix="/tasks", tags=["Gestion des Tâches & Tableau Kanban"])


@router.post(
    "/",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Créer une nouvelle tâche au sein d'un projet"
)
async def create_task(
    task_in: TaskCreate,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Crée une tâche Kanban :
    - Vérifie que le projet appartient bien à l'entreprise de l'utilisateur.
    - Vérifie que l'utilisateur assigné (si spécifié) appartient à la même entreprise.
    - Affecte automatiquement company_id pour garantir l'isolation logicielle stricte.
    """
    company_oid = ObjectId(current_user.company_id)

    # 1. Vérification du projet
    if not ObjectId.is_valid(task_in.project_id):
        raise HTTPException(status_code=400, detail="Identifiant de projet invalide.")

    project_oid = ObjectId(task_in.project_id)
    project = await db.projects.find_one({"_id": project_oid, "company_id": company_oid})
    if not project:
        raise HTTPException(status_code=404, detail="Projet inexistant au sein de votre entreprise.")

    # 2. Vérification de l'utilisateur assigné (si présent)
    assigned_oid = None
    if task_in.assigned_user_id:
        if not ObjectId.is_valid(task_in.assigned_user_id):
            raise HTTPException(status_code=400, detail="Identifiant d'utilisateur assigné invalide.")
        assigned_oid = ObjectId(task_in.assigned_user_id)
        assigned_user = await db.users.find_one({"_id": assigned_oid, "company_id": company_oid})
        if not assigned_user:
            raise HTTPException(
                status_code=400,
                detail="L'utilisateur assigné n'appartient pas à votre entreprise."
            )

    now = datetime.now(timezone.utc)
    task_doc = {
        "title": task_in.title,
        "description": task_in.description,
        "status": task_in.status.value,
        "priority": task_in.priority.value,
        "project_id": project_oid,
        "company_id": company_oid,
        "assigned_user_id": str(assigned_oid) if assigned_oid else None,
        "created_at": now,
        "updated_at": now,
    }

    result = await db.tasks.insert_one(task_doc)
    task_id = str(result.inserted_id)

    return TaskResponse(
        id=task_id,
        title=task_doc["title"],
        description=task_doc["description"],
        status=task_in.status,
        priority=task_in.priority,
        project_id=str(project_oid),
        company_id=str(company_oid),
        assigned_user_id=task_doc["assigned_user_id"],
        created_at=now,
        updated_at=now,
    )


@router.get(
    "/",
    response_model=List[TaskResponse],
    summary="Lister les tâches de son entreprise (filtrables par projet ou statut)"
)
async def list_tasks(
    project_id: Optional[str] = None,
    status_filter: Optional[TaskStatus] = None,
    assigned_user_id: Optional[str] = None,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Retourne la liste des tâches de l'entreprise connectée.
    Possibilité de filtrer par projet, statut ou utilisateur assigné.
    """
    company_oid = ObjectId(current_user.company_id)
    query: dict = {
        "company_id": {"$in": [company_oid, str(company_oid), str(current_user.company_id)]}
    }

    if project_id:
        if not ObjectId.is_valid(project_id):
            raise HTTPException(status_code=400, detail="Identifiant de projet invalide.")
        project_oid = ObjectId(project_id)
        query["project_id"] = {"$in": [project_oid, str(project_oid)]}

    if status_filter:
        query["status"] = status_filter.value

    if assigned_user_id:
        if not ObjectId.is_valid(assigned_user_id):
            raise HTTPException(status_code=400, detail="Identifiant d'utilisateur invalide.")
        query["assigned_user_id"] = assigned_user_id

    cursor = db.tasks.find(query).sort("created_at", -1)
    tasks: List[TaskResponse] = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        doc["project_id"] = str(doc["project_id"])
        doc["company_id"] = str(doc["company_id"])
        tasks.append(TaskResponse(**doc))

    return tasks


@router.get(
    "/kanban/{project_id}",
    response_model=KanbanBoardResponse,
    summary="Visualiser le tableau Kanban d'un projet (groupé par colonnes de statut)"
)
async def get_project_kanban(
    project_id: str,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Retourne les tâches organisées par statut pour affichage direct sous forme de colonnes Kanban :
    TODO | IN_PROGRESS | REVIEW | DONE.
    """
    if not ObjectId.is_valid(project_id):
        raise HTTPException(status_code=400, detail="Identifiant de projet invalide.")

    project_oid = ObjectId(project_id)
    company_oid = ObjectId(current_user.company_id)

    # Vérification d'accès au projet
    project = await db.projects.find_one({
        "_id": project_oid,
        "company_id": {"$in": [company_oid, str(company_oid), str(current_user.company_id)]}
    })
    if not project:
        raise HTTPException(status_code=404, detail="Projet introuvable dans votre entreprise.")

    # Initialisation des colonnes Kanban
    columns: Dict[TaskStatus, List[TaskResponse]] = {
        TaskStatus.TODO: [],
        TaskStatus.IN_PROGRESS: [],
        TaskStatus.REVIEW: [],
        TaskStatus.DONE: []
    }

    cursor = db.tasks.find({
        "project_id": {"$in": [project_oid, str(project_oid)]},
        "company_id": {"$in": [company_oid, str(company_oid), str(current_user.company_id)]}
    }).sort("created_at", 1)

    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        doc["project_id"] = str(doc["project_id"])
        doc["company_id"] = str(doc["company_id"])
        task_res = TaskResponse(**doc)
        if task_res.status in columns:
            columns[task_res.status].append(task_res)

    return KanbanBoardResponse(
        project_id=str(project_oid),
        columns=columns
    )


@router.get(
    "/{task_id}",
    response_model=TaskResponse,
    summary="Consulter les détails d'une tâche"
)
async def get_task_by_id(
    task_id: str,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Recherche une tâche par son identifiant sous le filtre d'isolation logicielle multi-tenant."""
    if not ObjectId.is_valid(task_id):
        raise HTTPException(status_code=400, detail="Identifiant de tâche invalide.")

    doc = await db.tasks.find_one({
        "_id": ObjectId(task_id),
        "company_id": ObjectId(current_user.company_id)
    })
    if not doc:
        raise HTTPException(status_code=404, detail="Tâche introuvable au sein de votre entreprise.")

    doc["_id"] = str(doc["_id"])
    doc["project_id"] = str(doc["project_id"])
    doc["company_id"] = str(doc["company_id"])
    return TaskResponse(**doc)


@router.put(
    "/{task_id}",
    response_model=TaskResponse,
    summary="Mettre à jour une tâche (déplacement Kanban, statut, assignation)"
)
async def update_task(
    task_id: str,
    task_in: TaskUpdate,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Permet notamment de faire glisser une carte d'une colonne Kanban à une autre via son statut."""
    if not ObjectId.is_valid(task_id):
        raise HTTPException(status_code=400, detail="Identifiant de tâche invalide.")

    task_oid = ObjectId(task_id)
    company_oid = ObjectId(current_user.company_id)

    update_data = {k: v for k, v in task_in.model_dump(mode="json", exclude_unset=True).items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="Aucun champ à mettre à jour.")

    # Vérification si réassignation d'utilisateur
    if "assigned_user_id" in update_data and update_data["assigned_user_id"]:
        user_to_assign = update_data["assigned_user_id"]
        if not ObjectId.is_valid(user_to_assign):
            raise HTTPException(status_code=400, detail="Identifiant d'utilisateur invalide.")
        assigned_user = await db.users.find_one({
            "_id": ObjectId(user_to_assign),
            "company_id": company_oid
        })
        if not assigned_user:
            raise HTTPException(
                status_code=400,
                detail="L'utilisateur ciblé n'appartient pas à votre entreprise."
            )

    update_data["updated_at"] = datetime.now(timezone.utc)

    result = await db.tasks.find_one_and_update(
        {"_id": task_oid, "company_id": company_oid},
        {"$set": update_data},
        return_document=True
    )

    if not result:
        raise HTTPException(status_code=404, detail="Tâche introuvable au sein de votre entreprise.")

    result["_id"] = str(result["_id"])
    result["project_id"] = str(result["project_id"])
    result["company_id"] = str(result["company_id"])
    return TaskResponse(**result)


@router.delete(
    "/{task_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Supprimer une tâche"
)
async def delete_task(
    task_id: str,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Supprime une tâche en garantissant l'étanchéité multi-tenant."""
    if not ObjectId.is_valid(task_id):
        raise HTTPException(status_code=400, detail="Identifiant de tâche invalide.")

    result = await db.tasks.delete_one({
        "_id": ObjectId(task_id),
        "company_id": ObjectId(current_user.company_id)
    })

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Tâche introuvable.")

    return None
