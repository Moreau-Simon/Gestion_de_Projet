# SaaS Project Management Backend (Trello / Notion like)

> **BUT 3 Informatique — R5.10 : Nouveaux paradigmes de bases de données**  
> **TD1 : Startup – Outil de gestion de projet SaaS – PARTIE I**

Backend applicatif SaaS multi-entreprises développé en **Python (FastAPI)** et s'appuyant sur **MongoDB**. L'application intègre une **isolation logicielle stricte** entre organisations clientes (multi-tenancy), une gestion complète des utilisateurs avec authentification sécurisée par jetons **JWT**, ainsi que la modélisation de projets et tâches visualisables sous forme de tableau **Kanban**.

---

## 📋 Table des matières
1. [Démarrage rapide en une seule commande](#1-démarrage-rapide-en-une-seule-commande)
2. [Architecture et Choix Techniques](#2-architecture-et-choix-techniques)
3. [Configuration & Anticipation de la Réplication / Sharding (Partie II)](#3-configuration--anticipation-de-la-réplication--sharding-partie-ii)
4. [Instructions pour tester la création d'un utilisateur et l'isolation](#4-instructions-pour-tester-la-création-dun-utilisateur-et-lisolation)
5. [Interface Graphique Web (Application SaaS)](#5-interface-graphique-web-application-saas)
6. [Documentation interactive (Swagger UI)](#6-documentation-interactive-swagger-ui)
7. [Arborescence du projet](#7-arborescence-du-projet)
8. [Spécifications techniques et fonctionnelles](#8-spécifications-techniques-et-fonctionnelles)

---

## 1. Démarrage rapide en une seule commande

Conformément aux exigences strictes du livrable, aucune installation manuelle de dépendances n'est requise. Seuls Docker et Docker Compose sont nécessaires.

> **Note après clonage Git** : Un fichier `.env` prêt à l'emploi est inclus dans le projet. Si vous le clonez sur un environnement neuf sans `.env`, copiez simplement le modèle : `cp .env.example .env` (ou `copy .env.example .env` sous Windows PowerShell).

À la racine du projet, lancez :

```bash
docker compose up -d --build
```

*(Si vous utilisez une version plus ancienne de Docker Compose, la commande équivalente est `docker-compose up -d --build`)*.

### Que fait cette commande ?
1. Lance le conteneur de base de données **MongoDB 7.0** avec un volume persistant `saas_mongo_data`.
2. Exécute un **Healthcheck** sur MongoDB afin de s'assurer que le moteur est prêt à accepter des requêtes.
3. Construit l'image Docker optimisée pour l'application Python (`python:3.11-slim`, utilisateur non-root, cache pip).
4. Démarre le serveur FastAPI sur le port `8000` via Uvicorn une fois MongoDB prêt.

Pour vérifier que tout fonctionne :
- **Santé de l'API & MongoDB** : [http://localhost:8000/health](http://localhost:8000/health)
- **Documentation Swagger UI** : [http://localhost:8000/docs](http://localhost:8000/docs)

Pour stopper les conteneurs :
```bash
docker compose down
```

---

## 2. Architecture et Choix Techniques

| Composant | Technologie | Justification |
| :--- | :--- | :--- |
| **Framework Web** | **FastAPI** | Moderne, asynchrone, validation stricte avec Pydantic v2 et documentation interactive OpenAPI/Swagger native. |
| **Pilote MongoDB** | **Motor (AsyncIOMotorClient)** | Driver asynchrone officiel MongoDB pour Python, garantissant de très hautes performances I/O non-bloquantes. |
| **Base de données** | **MongoDB 7.0** | Paradigme orienté document NoSQL idéal pour les structures hiérarchiques (Entreprise ➔ Projets ➔ Tâches). |
| **Sécurité** | **Bcrypt & JWT (PyJWT)** | Hachage avec sel des mots de passe et jetons signés véhiculant l'identité et le `company_id`. |
| **Conteneurisation** | **Docker & Compose** | Environnement reproductible, utilisateur `appuser` non-root, dépendances isolées. |

---

## 3. Configuration & Anticipation de la Réplication / Sharding (Partie II)

Dans la Partie II du TD, l'architecture MongoDB évoluera vers un cluster distribué avec **Replica Set** et **Sharding**.

L'application a été spécialement conçue pour s'adapter **sans aucune modification du code source** :
Toute la connectivité est pilotée par les variables d'environnement (`.env` ou `compose.yml`).

### Format de la chaîne de connexion (`MONGO_URI`) :

- **Phase actuelle (Standalone)** :
  ```env
  MONGO_URI=mongodb://mongodb:27017
  MONGO_DB_NAME=saas_pm_db
  ```

- **Évolution future vers un Replica Set (Haute disponibilité)** :
  ```env
  MONGO_URI=mongodb://mongo1:27017,mongo2:27017,mongo3:27017/?replicaSet=rs0
  ```

- **Évolution future vers un Cluster Shardé (Montée en charge distribuée)** :
  ```env
  MONGO_URI=mongodb://mongos1:27017,mongos2:27017
  ```

### Clé de Sharding anticipée
L'isolation logicielle associe chaque document à un champ `company_id`. Les index MongoDB créés au démarrage (`init_db_indexes`) intègrent `company_id` en préfixe. Dès lors, le sharding par clé de tenant (`sh.shardCollection("saas_pm_db.users", { "company_id": "hashed" })`) s'effectuera naturellement sans réusinage applicatif.

---

## 4. Instructions pour tester la création d'un utilisateur et l'isolation

Vous pouvez tester l'application de deux façons :
1. **Via le script de test automatisé fourni (`test_api.py`)**.
2. **Manuellement via des requêtes `curl` (ou PowerShell)**.

---

### Option A — Validation automatique via le script de test

Une fois les conteneurs démarrés, exécutez simplement :

```bash
python test_api.py
```

Ce script valide l'ensemble du scénario en 7 étapes :
1. Vérification de `/health` et connectivité MongoDB.
2. Inscription d'une première entreprise (*Acme Corp*) et de son administrateur (*Alice*).
3. Création d'un collaborateur (*Bob*) assigné à *Acme Corp*.
4. Liste des collaborateurs de l'entreprise *Acme Corp*.
5. Inscription d'une seconde entreprise concurrente (*Beta Inc*) et de son administrateur (*Charlie*).
6. **Vérification de l'isolation logicielle stricte** : Charlie ne peut ni voir Bob dans sa liste, ni consulter sa fiche via son ID (renvoie HTTP `404 Not Found`).
7. Création d'un projet et d'une tâche visualisée sur le tableau Kanban.

---

### Option B — Validation manuelle pas-à-pas (cURL / HTTP)

#### Étape 1 : Inscription de l'entreprise "Acme Corp" et de l'administrateur "Alice"
Cette route crée l'entreprise cliente (Tenant) et son premier compte utilisateur `admin`, puis retourne le jeton JWT.

```bash
curl -X POST "http://localhost:8000/api/v1/auth/register-company" \
  -H "Content-Type: application/json" \
  -d '{
    "company_name": "Acme Corp",
    "company_description": "Editeur SaaS",
    "admin_email": "alice@acme.com",
    "admin_full_name": "Alice Dupont",
    "admin_password": "Password123!"
  }'
```

*Copiez la valeur de `"access_token"` reçue dans la réponse.*

---

#### Étape 2 : Création d'un utilisateur collaborateur (Bob)
Grâce au token d'Alice, nous créons un nouvel utilisateur au sein d'Acme Corp. Le serveur assigne **automatiquement** le `company_id` d'Alice à Bob.

*(Remplacez `<TOKEN_ALICE>` par le jeton obtenu à l'étape 1)* :

```bash
curl -X POST "http://localhost:8000/api/v1/users/" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN_ALICE>" \
  -d '{
    "email": "bob@acme.com",
    "full_name": "Bob Martin",
    "password": "Password123!",
    "role": "member",
    "is_active": true
  }'
```

---

#### Étape 3 : Vérifier la liste des collaborateurs d'Acme Corp

```bash
curl -X GET "http://localhost:8000/api/v1/users/" \
  -H "Authorization: Bearer <TOKEN_ALICE>"
```

*Réponse attendue : Alice et Bob apparaissent avec le même `company_id`.*

---

#### Étape 4 : Démonstration de l'isolation logicielle stricte (Multi-Tenancy)

Créons une **seconde entreprise** ("Beta Inc") avec l'administrateur Charlie :

```bash
curl -X POST "http://localhost:8000/api/v1/auth/register-company" \
  -H "Content-Type: application/json" \
  -d '{
    "company_name": "Beta Inc",
    "admin_email": "charlie@beta.com",
    "admin_full_name": "Charlie Petit",
    "admin_password": "Password123!"
  }'
```

*Copiez la valeur de `"access_token"` de Charlie.*

Interrogeons la liste des utilisateurs avec le token de Charlie :

```bash
curl -X GET "http://localhost:8000/api/v1/users/" \
  -H "Authorization: Bearer <TOKEN_CHARLIE>"
```

*Résultat : Seul Charlie apparaît ! Ni Alice ni Bob (qui appartiennent à Acme Corp) ne sont visibles.*

---

## 5. Interface Graphique Web (Application SaaS)

Une interface moderne Single Page Application (inspirée de Trello et Notion) est servie directement à la racine du projet :
👉 **[http://localhost:8000/](http://localhost:8000/)**

### Fonctionnalités disponibles dans le navigateur :
- **Onboarding SaaS & Connexion** : Inscription d'entreprises clientes ou connexion rapide avec les comptes de démonstration (Alice / Charlie).
- **Gestion des Projets** : Création de projets collaboratifs, affectation d'équipes et suppression.
- **Tableau Kanban Interactif** :
  - Colonnes d'état : *À faire*, *En cours*, *En revue*, *Terminé*.
  - **Glisser-Déposer (Drag & Drop natif)** des cartes de tâches en temps réel avec persistance automatique dans MongoDB.
  - Création de tâches avec niveaux de priorité (Urgente, Haute, Moyenne, Basse) et assignation de collaborateur.
- **Gestion de l'Équipe (Multi-tenant)** : Invitation de nouveaux membres, consultation des statuts et contrôle d'accès RBAC.
- **Paramètres de l'Organisation** : Mise à jour du nom de l'entreprise et suppression sécurisée en cascade.

---

## 6. Documentation interactive (Swagger UI)

FastAPI génère également la documentation interactive OpenAPI sur :
👉 **[http://localhost:8000/docs](http://localhost:8000/docs)**

1. Cliquez sur le bouton vert **"Authorize"** en haut à droite.
2. Saisissez l'email (`username`) et le mot de passe (`password`) créés lors du register.
3. Vous pouvez désormais tester l'ensemble des endpoints directement depuis votre navigateur web !

---

## 7. Arborescence du projet

```text
Gestion_de_Projet/
├── .dockerignore                  # Fichiers exclus du build Docker
├── .env.example                   # Modèle de variables d'environnement
├── .env                           # Configuration active
├── .gitignore                     # Exclusion des fichiers temporaires Git
├── compose.yml                    # Déclaration Docker Compose (App + MongoDB)
├── Dockerfile                     # Image optimisée Python 3.11-slim
├── requirements.txt               # Dépendances applicatives (FastAPI, Motor, Bcrypt...)
├── test_api.py                    # Script de test automatisé (stdlib Python)
├── README.md                      # Documentation d'installation et d'utilisation
│
├── docs/                          # Spécifications pour le livrable TD1
│   ├── SPECIFICATION_TECHNIQUE.md    # Architecture MongoDB et schémas JSON
│   └── SPECIFICATION_FONCTIONNELLE.md # Description détaillée des fonctionnalités
│
├── static/                        # Interface Web Single Page Application (SPA)
│   ├── index.html                 # Structure de l'interface utilisateur
│   ├── app.js                     # Logique applicative, API et Drag & Drop Kanban
│   └── style.css                  # Feuilles de styles et animations
│
└── app/                           # Code source de l'application
    ├── __init__.py
    ├── main.py                    # Point d'entrée FastAPI, cycle de vie et CORS
    │
    ├── core/                      # Configuration centrale
    │   ├── config.py              # Chargement des variables d'environnement
    │   ├── database.py            # Client Motor MongoDB, ping et indexation
    │   └── security.py            # Hachage bcrypt et signature des JWT
    │
    ├── models/                    # Modèles Pydantic & Schémas BSON
    │   ├── common.py              # PyObjectId et sérialiseurs BSON
    │   ├── company.py             # Modèle Entreprise (Tenant)
    │   ├── user.py                # Modèle Utilisateur et authentification
    │   ├── project.py             # Modèle Projet
    │   └── task.py                # Modèle Tâche & Tableau Kanban
    │
    └── api/                       # Couche Web REST
        ├── deps.py                # Dépendances de sécurité et d'isolation logicielle
        └── v1/
            ├── router.py          # Agrégateur des routes v1
            └── endpoints/
                ├── auth.py        # Inscription et connexion
                ├── users.py       # CRUD utilisateurs scoped par entreprise
                ├── companies.py   # Gestion de l'entreprise
                ├── projects.py    # CRUD projets
                └── tasks.py       # CRUD tâches et vue Kanban
```

---

## 8. Spécifications techniques et fonctionnelles

Conformément aux livrables demandés dans le sujet :
- **Spécification technique** : Retrouvez l'architecture de la base de données et les structures JSON détaillées dans [`docs/SPECIFICATION_TECHNIQUE.md`](docs/SPECIFICATION_TECHNIQUE.md).
- **Spécification fonctionnelle** : Retrouvez le détail des cas d'usage et des rôles dans [`docs/SPECIFICATION_FONCTIONNELLE.md`](docs/SPECIFICATION_FONCTIONNELLE.md).
