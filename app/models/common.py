from typing import Annotated, Any
from bson import ObjectId
from pydantic import BaseModel, BeforeValidator, ConfigDict


def validate_object_id(v: Any) -> str:
    """Valide qu'une valeur est un ObjectId MongoDB valide ou une chaîne hexadécimale de 24 caractères."""
    if isinstance(v, ObjectId):
        return str(v)
    if isinstance(v, str) and ObjectId.is_valid(v):
        return v
    raise ValueError(f"Identifiant ObjectId BSON invalide : {v}")


PyObjectId = Annotated[str, BeforeValidator(validate_object_id)]


class MongoBaseModel(BaseModel):
    """Classe de base pour tous les modèles Pydantic interagissant avec MongoDB."""
    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str}
    )
