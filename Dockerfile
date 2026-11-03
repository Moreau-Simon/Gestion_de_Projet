# Image de base officielle Python légère
FROM python:3.11-slim

# Optimisation de l'environnement Python
# 1. Empêche la génération de fichiers .pyc inutiles dans le conteneur
# 2. Force l'affichage immédiat des logs stdout/stderr sans mise en tampon (idéal pour docker logs)
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Création d'un utilisateur non-root pour des raisons de sécurité
RUN groupadd -g 1000 appgroup && \
    useradd -u 1000 -g appgroup -s /bin/bash -m appuser

# Installation des dépendances applicatives
# Cette étape est séparée de la copie du code source pour tirer parti du cache des layers Docker
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install -r requirements.txt

# Copie de l'ensemble du code source
COPY --chown=appuser:appgroup . .

# Passage à l'utilisateur non-root
USER appuser

# Exposition du port HTTP de FastAPI
EXPOSE 8000

# Vérification de l'état de santé du conteneur (Healthcheck)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# Démarrage du serveur ASGI Uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
