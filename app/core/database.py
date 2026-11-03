import logging
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import ASCENDING, IndexModel
from app.core.config import settings

logger = logging.getLogger(__name__)


class DatabaseClient:
    client: Optional[AsyncIOMotorClient] = None
    database: Optional[AsyncIOMotorDatabase] = None

    def get_db(self) -> AsyncIOMotorDatabase:
        if self.database is None:
            raise RuntimeError("La base de données n'est pas initialisée.")
        return self.database


db_client = DatabaseClient()


async def init_db_indexes(db: AsyncIOMotorDatabase) -> None:
    """
    Initialise les index MongoDB pour garantir la performance, l'unicité
    et préparer l'architecture distribuée (sharding par company_id en partie II).
    """
    try:
        # Collection Entreprises
        await db.companies.create_indexes([
            IndexModel([("name", ASCENDING)], unique=True)
        ])

        # Collection Utilisateurs : unicité de l'email + index sur company_id pour l'isolation
        await db.users.create_indexes([
            IndexModel([("email", ASCENDING)], unique=True),
            IndexModel([("company_id", ASCENDING)])
        ])

        # Collection Projets : isolation stricte par entreprise
        # L'index composé {company_id, name} couvre aussi les requêtes sur company_id seul (préfixe)
        await db.projects.create_indexes([
            IndexModel([("company_id", ASCENDING), ("name", ASCENDING)])
        ])

        # Collection Tâches (Kanban) : recherche rapide par projet, statut et entreprise
        # L'index composé {company_id, project_id, status} couvre aussi les requêtes sur company_id seul
        await db.tasks.create_indexes([
            IndexModel([("company_id", ASCENDING), ("project_id", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("assigned_user_id", ASCENDING)])
        ])

        logger.info("Index MongoDB initialisés avec succès.")
    except Exception as e:
        logger.warning(f"Avertissement lors de la création des index : {e}")


async def connect_to_mongo() -> None:
    """Établit la connexion asynchrone avec MongoDB et vérifie l'état de la connexion (ping)."""
    logger.info(f"Connexion à MongoDB sur : {settings.MONGO_URI} (DB: {settings.MONGO_DB_NAME})")
    db_client.client = AsyncIOMotorClient(
        settings.MONGO_URI,
        serverSelectionTimeoutMS=5000
    )
    db_client.database = db_client.client[settings.MONGO_DB_NAME]

    # Test de connectivité
    await db_client.client.admin.command("ping")
    logger.info("Connexion à MongoDB validée avec succès (Ping OK).")

    # Initialisation des index
    await init_db_indexes(db_client.database)


async def close_mongo_connection() -> None:
    """Ferme proprement le pool de connexions MongoDB lors de l'extinction du serveur."""
    if db_client.client is not None:
        logger.info("Fermeture de la connexion MongoDB...")
        db_client.client.close()
        db_client.client = None
        db_client.database = None
        logger.info("Connexion MongoDB fermée.")


def get_database() -> AsyncIOMotorDatabase:
    """Dépendance FastAPI retournant l'instance de la base de données."""
    return db_client.get_db()
