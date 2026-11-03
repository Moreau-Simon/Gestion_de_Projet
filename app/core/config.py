from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Configuration de l'application chargée via variables d'environnement
    ou fichier .env. Aucune modification de code n'est nécessaire pour changer
    les paramètres de connexion ou de sécurité.
    """
    PROJECT_NAME: str = "SaaS Project Management API"
    API_V1_STR: str = "/api/v1"
    ENV: str = "development"

    # Configuration MongoDB
    # Le format URI standard permet de pointer vers :
    # - un conteneur unique (ex: mongodb://mongodb:27017)
    # - un Replica Set (ex: mongodb://mongo1:27017,mongo2:27017/?replicaSet=rs0)
    # - un routeur de Sharding (ex: mongodb://mongos1:27017,mongos2:27017)
    MONGO_URI: str = "mongodb://mongodb:27017"
    MONGO_DB_NAME: str = "saas_pm_db"

    # Paramètres d'authentification et chiffrement JWT
    JWT_SECRET_KEY: str = "dev_secret_key_change_in_production_9f8d7e6c5b4a321"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 heures

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_ignore_empty=True,
        extra="ignore",
        case_sensitive=True
    )


settings = Settings()
