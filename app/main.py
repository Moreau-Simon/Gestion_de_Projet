import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import close_mongo_connection, connect_to_mongo, db_client

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("saas-backend")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Gestionnaire du cycle de vie ASGI :
    Initialise la connexion MongoDB et les index au démarrage,
    et libère les ressources à l'extinction.
    """
    logger.info("Démarrage du backend SaaS...")
    await connect_to_mongo()
    yield
    logger.info("Arrêt du backend SaaS...")
    await close_mongo_connection()


app = FastAPI(
    title=settings.PROJECT_NAME,
    description=(
        "Plateforme SaaS de gestion de projet multi-entreprises (type Trello / Notion) "
        "propulsée par FastAPI et MongoDB. Isolation logicielle stricte par locataire (tenant), "
        "authentification JWT, gestion Kanban des tâches et architecture préparée pour le sharding."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configuration CORS compatible développement et intégration front-end (Bearer Tokens)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,  # Bearer JWT transmis via header Authorization, pas via cookies
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get(
    "/health",
    tags=["Santé & Monitoring"],
    summary="Bilan de santé applicatif et connectivité MongoDB"
)
async def health_check():
    """Vérification de l'état de l'API et de la base de données (utilisé pour les Healthchecks Docker)."""
    mongo_status = "disconnected"
    try:
        if db_client.client:
            await db_client.client.admin.command("ping")
            mongo_status = "connected"
    except Exception as e:
        logger.error(f"Erreur de ping MongoDB : {e}")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "unhealthy", "database": "error", "detail": str(e)}
        )

    return {
        "status": "healthy",
        "database": mongo_status,
        "database_name": settings.MONGO_DB_NAME,
        "environment": settings.ENV,
    }


# Montage des fichiers statiques de l'interface web utilisateur
STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")
if os.path.isdir(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get(
    "/",
    tags=["Interface Utilisateur"],
    summary="Page d'accueil et tableau de bord de l'application SaaS"
)
async def serve_frontend():
    """Sert l'application web Single Page Application (SPA)."""
    index_file = os.path.join(STATIC_DIR, "index.html")
    if os.path.isfile(index_file):
        return FileResponse(index_file)
    return {
        "message": f"Bienvenue sur {settings.PROJECT_NAME}",
        "documentation": "/docs",
        "version": "1.0.0",
        "health": "/health"
    }


@app.get(
    "/api",
    tags=["Accueil API"],
    summary="Racine des métadonnées API"
)
async def api_info():
    return {
        "project": settings.PROJECT_NAME,
        "docs": "/docs",
        "version": "1.0.0",
        "health": "/health"
    }


# Branchement des routes de l'API v1
app.include_router(api_router, prefix=settings.API_V1_STR)
