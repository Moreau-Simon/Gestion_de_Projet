from datetime import datetime, timezone
from enum import Enum
from typing import Dict, List, Optional
from pydantic import Field
from app.models.common import MongoBaseModel, PyObjectId


class TaskStatus(str, Enum):
    TODO = "TODO"
    IN_PROGRESS = "IN_PROGRESS"
    REVIEW = "REVIEW"
    DONE = "DONE"


class TaskPriority(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    URGENT = "URGENT"


class TaskBase(MongoBaseModel):
    title: str = Field(..., min_length=1, max_length=200, description="Titre descriptif de la tâche")
    description: Optional[str] = Field(None, max_length=2000, description="Détails de la tâche")
    status: TaskStatus = Field(default=TaskStatus.TODO, description="Statut de la tâche (colonne Kanban)")
    priority: TaskPriority = Field(default=TaskPriority.MEDIUM, description="Niveau de priorité")
    assigned_user_id: Optional[PyObjectId] = Field(None, description="Collaborateur assigné à la tâche")


class TaskCreate(TaskBase):
    project_id: PyObjectId = Field(..., description="Projet au sein duquel la tâche est créée")


class TaskUpdate(MongoBaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    assigned_user_id: Optional[PyObjectId] = None


class TaskResponse(TaskBase):
    id: PyObjectId = Field(alias="_id", serialization_alias="id")
    project_id: PyObjectId
    company_id: PyObjectId = Field(..., description="Entreprise propriétaire (isolation logicielle)")
    created_at: datetime
    updated_at: datetime


class TaskInDB(TaskBase):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    project_id: PyObjectId
    company_id: PyObjectId
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class KanbanBoardResponse(MongoBaseModel):
    project_id: PyObjectId
    columns: Dict[TaskStatus, List[TaskResponse]]
