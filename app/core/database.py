import logging
from datetime import datetime, timezone
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


async def seed_initial_data(db: AsyncIOMotorDatabase) -> None:
    """
    Pré-charge les données de démonstration au premier lancement si la base est vide.
    Permet à l'utilisateur et au correcteur de tester immédiatement l'interface web
    avec les comptes pré-remplis (Alice / Acme Corp et Charlie / Beta Inc).
    """
    try:
        company_count = await db.companies.count_documents({})
        if company_count > 0:
            return

        logger.info("Base de données vierge détectée. Initialisation des données de démonstration...")
        now = datetime.now(timezone.utc)
        from app.core.security import get_password_hash

        # 1. Entreprise Acme Corp (Tenant 1)
        acme_doc = {
            "name": "Acme Corp",
            "description": "Fournisseur de solutions logicielles et cloud",
            "created_at": now,
            "updated_at": now,
        }
        acme_res = await db.companies.insert_one(acme_doc)
        acme_id = acme_res.inserted_id

        # 1.1 Administrateur Alice
        alice_doc = {
            "email": "alice@acme.com",
            "full_name": "Alice Dupont",
            "hashed_password": get_password_hash("Password123!"),
            "role": "admin",
            "company_id": acme_id,
            "is_active": True,
            "created_at": now,
        }
        alice_res = await db.users.insert_one(alice_doc)
        alice_id = alice_res.inserted_id

        # 1.2 Membre Bob
        bob_doc = {
            "email": "bob@acme.com",
            "full_name": "Bob Martin",
            "hashed_password": get_password_hash("Password123!"),
            "role": "member",
            "company_id": acme_id,
            "is_active": True,
            "created_at": now,
        }
        bob_res = await db.users.insert_one(bob_doc)
        bob_id = bob_res.inserted_id

        # 1.3 Projet Alpha
        project_doc = {
            "name": "Refonte Plateforme SaaS",
            "description": "Migration vers une architecture moderne FastAPI & MongoDB 7.0 avec tableau Kanban",
            "company_id": acme_id,
            "member_ids": [str(alice_id), str(bob_id)],
            "created_at": now,
            "updated_at": now,
        }
        project_res = await db.projects.insert_one(project_doc)
        project_id = project_res.inserted_id

        # 1.4 Tâches Kanban pour Projet Alpha
        sample_tasks = [
            {
                "title": "Concevoir le schéma NoSQL",
                "description": "Définir les collections JSON et index pour MongoDB avec isolation multi-tenant",
                "status": "DONE",
                "priority": "HIGH",
                "project_id": project_id,
                "company_id": acme_id,
                "assigned_user_id": str(alice_id),
                "created_at": now,
                "updated_at": now,
            },
            {
                "title": "Développer l'API REST FastAPI",
                "description": "Implémenter les endpoints CRUD sécurisés par JWT Bearer pour les entreprises, projets et tâches",
                "status": "DONE",
                "priority": "HIGH",
                "project_id": project_id,
                "company_id": acme_id,
                "assigned_user_id": str(bob_id),
                "created_at": now,
                "updated_at": now,
            },
            {
                "title": "Intégrer le tableau Kanban interactif",
                "description": "Permettre le déplacement des cartes de tâches par Drag & Drop avec persistance en base",
                "status": "IN_PROGRESS",
                "priority": "URGENT",
                "project_id": project_id,
                "company_id": acme_id,
                "assigned_user_id": str(alice_id),
                "created_at": now,
                "updated_at": now,
            },
            {
                "title": "Anticiper la réplication et le sharding (Partie II)",
                "description": "Préparer la configuration dynamique de l'URI et les index composés préfixés par company_id",
                "status": "TODO",
                "priority": "MEDIUM",
                "project_id": project_id,
                "company_id": acme_id,
                "assigned_user_id": str(bob_id),
                "created_at": now,
                "updated_at": now,
            },
        ]
        await db.tasks.insert_many(sample_tasks)

        # 2. Entreprise Beta Inc (Tenant 2 pour tester l'isolation stricte)
        beta_doc = {
            "name": "Beta Inc",
            "description": "Organisation cliente concurrente ou indépendante",
            "created_at": now,
            "updated_at": now,
        }
        beta_res = await db.companies.insert_one(beta_doc)
        beta_id = beta_res.inserted_id

        charlie_doc = {
            "email": "charlie@beta.com",
            "full_name": "Charlie Petit",
            "hashed_password": get_password_hash("Password123!"),
            "role": "admin",
            "company_id": beta_id,
            "is_active": True,
            "created_at": now,
        }
        await db.users.insert_one(charlie_doc)

        logger.info("Données de démonstration initialisées avec succès (Acme Corp & Beta Inc).")
    except Exception as e:
        logger.warning(f"Avertissement lors du peuplement initial des données : {e}")


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

    # Initialisation des données de démonstration
    await seed_initial_data(db_client.database)


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
