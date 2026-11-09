# SaaS Project Management Backend (Trello / Notion like) — FlowSaaS v2.0

> **BUT 3 Informatique — R5.10 : Nouveaux paradigmes de bases de données**  
> **TD1 : Startup – Outil de gestion de projet SaaS – PARTIE I**

Plateforme applicative SaaS collaborative multi-entreprises développée en **Python (FastAPI)** et s'appuyant sur **MongoDB 7.0**. L'application intègre une **isolation logicielle stricte** entre organisations clientes (multi-tenancy via `company_id`), une gestion complète des utilisateurs avec authentification sécurisée par jetons **JWT**, un tableau de bord analytique en temps réel, un moteur de recherche globale multi-projets, ainsi qu'un tableau **Kanban interactif** en glisser-déposer (Drag & Drop natif).

---

## 📋 Table des matières
1. [Démarrage rapide en une seule commande](#1-démarrage-rapide-en-une-seule-commande)
2. [Architecture et Choix Techniques](#2-architecture-et-choix-techniques)
3. [Nouveautés & Évolutions Majeures (v2.0)](#3-nouveautés--évolutions-majeures-v20)
4. [Configuration & Anticipation de la Réplication / Sharding (Partie II)](#4-configuration--anticipation-de-la-réplication--sharding-partie-ii)
5. [Instructions pour tester la création d'un utilisateur et l'isolation](#5-instructions-pour-tester-la-création-dun-utilisateur-et-lisolation)
6. [Interface Graphique Web & Expérience Utilisateur](#6-interface-graphique-web--expérience-utilisateur)
7. [Documentation interactive (Swagger UI)](#7-documentation-interactive-swagger-ui)
8. [Arborescence du projet](#8-arborescence-du-projet)
9. [Spécifications techniques et fonctionnelles](#9-spécifications-techniques-et-fonctionnelles)

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
3. Peuple automatiquement des **données de démonstration réalistes** au premier démarrage si la base est vide (*Acme Corp* avec Alice, Bob, un projet et 4 tâches Kanban, ainsi que *Beta Inc* avec Charlie).
4. Construit l'image Docker optimisée pour l'application Python (`python:3.11-slim`, utilisateur non-root, cache pip).
5. Démarre le serveur FastAPI sur le port `8000` via Uvicorn une fois MongoDB prêt.

Pour vérifier que tout fonctionne :
- **Application Web SPA** : [http://localhost:8000/](http://localhost:8000/)
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
| **Frontend SPA** | **Vanilla JS + Tailwind CSS CDN** | Zéro build tool nécessaire, chargement instantané, composants modulaires et réactifs. |
| **Conteneurisation** | **Docker & Compose** | Environnement reproductible, utilisateur `appuser` non-root, dépendances isolées. |

---

## 3. Nouveautés & Évolutions Majeures (v2.0)

Cette version apporte des améliorations substantielles tant sur le plan technique (backend NoSQL) que sur l'expérience utilisateur (frontend) :

### 🚀 Améliorations Backend & MongoDB
1. **Requêtes NoSQL polymorphiques BSON/String** :
   - Prise en charge native et transparente des identifiants stockés sous forme de `ObjectId` BSON ou de chaîne hexadécimale `str` via des filtres `{"$in": [ObjectId(id), str(id)]}` sur `company_id` et `project_id`.
   - Élimine tout risque de document manquant ou masqué suite à des migrations ou des tests hétérogènes.
2. **Tri chronologique naturel** :
   - Tous les listings (`projects`, `tasks`) sont ordonnés par `.sort("created_at", -1)` pour que les nouveaux éléments créés apparaissent immédiatement au premier plan.
3. **Seeding automatique au premier lancement (`seed_initial_data`)** :
   - Dès la première initialisation de MongoDB, deux entreprises clientes indépendantes (*Acme Corp* et *Beta Inc*) sont injectées avec utilisateurs, projets et tâches Kanban complètes, rendant la plateforme immédiatement opérationnelle.
4. **Validation Pydantic v2 résiliente** :
   - Règles `min_length=1` adaptées sur les formulaires pour faciliter les tests sans contraintes bloquantes artificielles.

### 🎨 Refonte Frontend & Expérience Utilisateur
1. **Nouveau Tableau de Bord Analytique (Dashboard)** :
   - 4 cartes KPI dynamiques animées (Projets actifs, Tâches totales, Tâches terminées avec %, Collaborateurs).
   - Flux d'activité des 5 dernières tâches avec accès direct au tableau Kanban associé en un clic.
2. **Moteur de Recherche Globale Multi-Projets (`⌘K` / `Ctrl+K`)** :
   - Recherche en direct sur les **projets** ET sur les **tâches de tous les projets** (titre, description, priorité, statut, membre assigné, nom du projet parent).
   - Menu déroulant popover instantané sous la barre de recherche + vue complète des résultats organisée en sections.
   - Bouton de réinitialisation rapide (`✕`).
3. **Mode Sombre Natif (Dark Mode)** :
   - Bascule fluide clair/sombre via un bouton dédié dans la barre supérieure, avec persistance automatique dans `localStorage`.
4. **Raccourcis Clavier Productivité** :
   - `⌘K` / `Ctrl+K` : Focus sur la recherche globale.
   - `D` : Navigation vers le Tableau de bord.
   - `P` : Navigation vers les Projets.
   - `M` : Navigation vers l'Équipe.
   - `Esc` : Fermeture des modales et menus déroulants.
5. **Design System & Micro-interactions** :
   - Cartes avec bordures de priorité 4px, effet de survol `card-lift`, animation d'authentification Aurora et retour tactile `btn-press`.

---

## 4. Configuration & Anticipation de la Réplication / Sharding (Partie II)

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

## 5. Instructions pour tester la création d'un utilisateur et l'isolation

Vous pouvez tester l'application de deux façons :
1. **Via le script de test automatisé fourni (`test_api.py`)**.
2. **Manuellement via des requêtes `curl` (ou PowerShell)**.

---

### Option A — Validation automatique via le script de test

Une fois les conteneurs démarrés, exécutez simplement :

```bash
python test_api.py
```

Ce script valide l'ensemble du scénario en **9 étapes** exhaustives :
1. Vérification de `/health` et connectivité MongoDB.
2. Inscription d'une première entreprise (*Acme Corp*) et de son administrateur (*Alice*).
3. Création d'un collaborateur (*Bob*) assigné à *Acme Corp*.
4. Liste des collaborateurs de l'entreprise *Acme Corp* et mise à jour d'un profil.
5. Inscription d'une seconde entreprise concurrente (*Beta Inc*) et de son administrateur (*Charlie*).
6. **Vérification de l'isolation logicielle stricte** : Charlie ne peut ni voir Bob dans sa liste, ni consulter sa fiche via son ID (renvoie HTTP `404 Not Found`).
7. Création d'un projet et cycle de vie complet des tâches (création, consultation unitaire `GET /tasks/{id}`, transition Kanban `TODO` ➔ `IN_PROGRESS`, visualisation Kanban `GET /tasks/kanban/{id}`).
8. **Contrôle d'accès par rôle (RBAC)** : vérification qu'un simple membre ne peut pas supprimer un projet (rejet HTTP `403 Forbidden`).
9. Consultation et gestion des informations de l'entreprise (`GET /companies/me`).

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

## 6. Interface Graphique Web & Expérience Utilisateur

L'interface Single Page Application moderne (inspirée de Linear, Trello et Notion) est servie directement à la racine :
👉 **[http://localhost:8000/](http://localhost:8000/)**

### Vues & fonctionnalités disponibles :
- **Tableau de bord (Dashboard)** : Métriques synthétiques, barres d'avancement des tâches et flux des créations récentes.
- **Projets collaboratifs** : Grille avec bordures thématiques, jauge de membres et création en modal.
- **Tableau Kanban interactif** :
  - 4 colonnes d'état : *À faire*, *En cours*, *En revue*, *Terminé*.
  - **Glisser-Déposer HTML5 natif** des cartes avec mise à jour optimiste et sauvegarde immédiate dans MongoDB.
  - Création de tâches avec priorités visuelles (Urgente 🔥, Haute, Moyenne, Basse) et assignation nominative.
- **Recherche globale instantanée** : Recherche transversale multi-projets avec popover en direct et raccourci clavier `⌘K`.
- **Mode Sombre (Dark Mode)** : Thème sombre complet préservant le confort visuel.
- **Gestion d'équipe (RBAC)** : Invitation de membres, consultation des rôles et contrôle strict des suppressions réservées aux administrateurs.
- **Paramètres Entreprise & Zone de danger** : Édition des métadonnées et suppression en cascade sécurisée par confirmation du nom exact.

---

## 7. Documentation interactive (Swagger UI)

FastAPI génère la documentation interactive OpenAPI sur :
👉 **[http://localhost:8000/docs](http://localhost:8000/docs)**

1. Cliquez sur le bouton vert **"Authorize"** en haut à droite.
2. Saisissez l'email (`username`) et le mot de passe (`password`) créés lors du register (ex: `alice@acme.com` / `Password123!`).
3. Vous pouvez désormais tester l'ensemble des endpoints CRUD directement depuis votre navigateur !

---

## 8. Arborescence du projet

```text
Gestion_de_Projet/
├── .dockerignore                  # Fichiers exclus du build Docker
├── .env.example                   # Modèle de variables d'environnement
├── .env                           # Configuration active
├── .gitignore                     # Exclusion des fichiers temporaires Git
├── compose.yml                    # Déclaration Docker Compose (App + MongoDB 7.0)
├── Dockerfile                     # Image optimisée Python 3.11-slim (non-root)
├── requirements.txt               # Dépendances applicatives (FastAPI, Motor, Bcrypt...)
├── test_api.py                    # Script de validation automatisé en 9 étapes
├── README.md                      # Documentation d'installation et guide d'utilisation
│
├── docs/                          # Spécifications pour le livrable TD1
│   ├── SPECIFICATION_TECHNIQUE.md    # Architecture MongoDB, sharding et schémas JSON
│   └── SPECIFICATION_FONCTIONNELLE.md # Description détaillée des fonctionnalités & RBAC
│
├── static/                        # Interface Web Single Page Application (SPA) v2.0
│   ├── index.html                 # Structure HTML5 sémantique, dashboard et popover
│   ├── app.js                     # Logique applicative, Drag & Drop, Dark mode et recherche
│   └── style.css                  # Feuilles de styles, glassmorphism et animations
│
└── app/                           # Code source de l'application
    ├── __init__.py
    ├── main.py                    # Point d'entrée FastAPI, cycle de vie et CORS
    │
    ├── core/                      # Configuration centrale
    │   ├── config.py              # Chargement des variables d'environnement
    │   ├── database.py            # Client Motor MongoDB, ping, indexation et seeding
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
                ├── companies.py   # Consultation et gestion de l'entreprise
                ├── projects.py    # CRUD projets
                └── tasks.py       # CRUD tâches et vue Kanban groupée
```

---

## 9. Spécifications techniques et fonctionnelles

Conformément aux livrables demandés dans le sujet :
- **Spécification technique** : Retrouvez l'architecture de la base de données, la modélisation NoSQL, les index composés et la stratégie de sharding dans [`docs/SPECIFICATION_TECHNIQUE.md`](docs/SPECIFICATION_TECHNIQUE.md).
- **Spécification fonctionnelle** : Retrouvez la matrice des rôles (RBAC), les règles d'isolation et la description des endpoints dans [`docs/SPECIFICATION_FONCTIONNELLE.md`](docs/SPECIFICATION_FONCTIONNELLE.md).
