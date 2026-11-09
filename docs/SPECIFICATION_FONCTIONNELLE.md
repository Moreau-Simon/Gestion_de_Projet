# Spécification Fonctionnelle - Outil SaaS de Gestion de Projet

> **BUT 3 Informatique — R5.10 : Nouveaux paradigmes de bases de données**  
> **TD1 : Startup – Outil de gestion de projet SaaS – PARTIE I**

---

## 1. Présentation Générale du Produit
L'application est une plateforme logicielle en mode **SaaS (Software as a Service)** multi-entreprises dédiée au pilotage et à la gestion de projets agiles, inspirée d'outils collaboratifs de référence tels que **Trello**, **Notion** et **ClickUp**.

L'application permet à chaque entreprise cliente de disposer d'un espace de travail totalement étanche, d'y gérer ses équipes, ses projets, et de suivre l'avancement des tâches au sein d'un tableau **Kanban** interactif.

---

## 2. Rôles et Acteurs du Système

| Rôle | Description | Périmètre de permissions |
| :--- | :--- | :--- |
| **Administrateur d'Entreprise** (`admin`) | Responsable du compte de l'entreprise | - Création du compte initial lors de l'onboarding<br>- Gestion et mise à jour de la fiche entreprise<br>- Suppression de l'entreprise (suppression en cascade)<br>- Invitation, mise à jour et suppression des collaborateurs<br>- Création et suppression de projets<br>- Création, assignation et déplacement des tâches Kanban |
| **Collaborateur / Membre** (`member`) | Utilisateur participant aux projets | - Consultation de l'annuaire d'équipe de son entreprise<br>- Consultation des projets de l'entreprise<br>- Création et mise à jour des projets<br>- Création de tâches, assignation et modification du statut (déplacement Kanban)<br>- *Interdiction* de supprimer des projets ou d'administrer les autres utilisateurs (RBAC) |

---

## 3. Matrice Détaillée des Fonctionnalités

### 3.1 Onboarding, Entreprises & Authentification Multi-Tenant
- **Création d'Entreprise & Premier Administrateur (`POST /api/v1/auth/register-company`)** : Point d'entrée SaaS sécurisé réalisant atomiquement l'enregistrement de l'entreprise et la création de son compte administrateur initial avec délivrance d'un jeton JWT signé.
- **Connexion JWT (`POST /api/v1/auth/login` et `/login-json`)** : Authentification par email/mot de passe générant un jeton Bearer JWT incluant l'identifiant utilisateur (`sub`) et l'identifiant d'entreprise (`company_id`).
- **Profil Utilisateur Courant (`GET /api/v1/auth/me`)** : Récupération des informations d'identité de la session active.
- **Consultation de l'Entreprise (`GET /api/v1/companies/me` et `GET /api/v1/companies/{id}`)** : Récupération des informations de son entreprise cliente.
- **Mise à jour de l'Entreprise (`PUT /api/v1/companies/me` et `PUT /api/v1/companies/{id}`)** : Modification du nom et de la description (réservé au rôle `admin`).
- **Suppression d'Entreprise en Cascade (`DELETE /api/v1/companies/me` et `DELETE /api/v1/companies/{id}`)** : Suppression sécurisée de l'entreprise, supprimant en cascade l'ensemble des tâches, projets et utilisateurs associés.

### 3.2 Gestion des Utilisateurs & Isolation Stricte
- **Création de Collaborateur (`POST /api/v1/users/`)** : Réservé aux administrateurs. L'utilisateur créé hérite automatiquement et immuablement du `company_id` de l'administrateur connecté. Il est impossible d'injecter un utilisateur dans une autre entreprise.
- **Liste des Collaborateurs (`GET /api/v1/users/`)** : Retourne exclusivement les utilisateurs de la même entreprise.
- **Consultation d'un Profil (`GET /api/v1/users/{id}`)** : Accès strictement restreint. Toute tentative d'accès à un utilisateur d'une autre entreprise renvoie une erreur `HTTP 404 Not Found`.
- **Mise à jour d'un Collaborateur (`PUT /api/v1/users/{id}`)** : Modification du nom complet, du rôle (`admin`/`member`), du mot de passe ou de l'état actif/inactif par un administrateur.
- **Suppression d'un Collaborateur (`DELETE /api/v1/users/{id}`)** : Suppression contrôlée au sein de l'entreprise (l'auto-suppression de son propre compte administrateur est bloquée).

### 3.3 Gestion des Projets
- **Création de Projet (`POST /api/v1/projects/`)** : Rattachement automatique au `company_id` du créateur et vérification que tous les membres spécifiés dans `member_ids` appartiennent bien à la même entreprise.
- **Liste des Projets (`GET /api/v1/projects/`)** : Récupération exclusive des projets de l'entreprise connectée.
- **Détails d'un Projet (`GET /api/v1/projects/{id}`)** : Consultation des détails d'un projet sous contrôle d'accès multi-tenant.
- **Mise à jour de Projet (`PUT /api/v1/projects/{id}`)** : Modification du nom, de la description ou de l'équipe de membres assignés.
- **Suppression de Projet (`DELETE /api/v1/projects/{id}`)** : Réservé aux administrateurs. Supprime le projet et nettoie automatiquement toutes les tâches associées.

### 3.4 Pilotage des Tâches & Tableau Kanban
- **Création de Tâche (`POST /api/v1/tasks/`)** : Création d'une tâche au sein d'un projet de l'entreprise avec :
  - Un titre et une description détaillée
  - Un statut initial parmi les colonnes Kanban (`TODO`, `IN_PROGRESS`, `REVIEW`, `DONE`)
  - Un niveau de priorité (`LOW`, `MEDIUM`, `HIGH`, `URGENT`)
  - L'assignation optionnelle à un collaborateur appartenant à l'entreprise
- **Liste et Recherche de Tâches (`GET /api/v1/tasks/`)** : Liste filtrable par projet (`project_id`), statut (`status_filter`) ou collaborateur assigné (`assigned_user_id`).
- **Consultation Unitaire (`GET /api/v1/tasks/{id}`)** : Récupération des détails d'une tâche sous filtre d'isolation logicielle.
- **Visualisation Kanban Groupée (`GET /api/v1/tasks/kanban/{project_id}`)** : Structure les tâches d'un projet par colonnes de statut (`TODO`, `IN_PROGRESS`, `REVIEW`, `DONE`) pour alimenter directement l'interface Kanban.
- **Mise à jour et Déplacement Kanban (`PUT /api/v1/tasks/{id}`)** : Changement d'état (transition de colonne), réassignation de membre ou modification de titre/priorité.
- **Suppression de Tâche (`DELETE /api/v1/tasks/{id}`)** : Suppression de la tâche sous contrôle d'accès d'entreprise.

---

## 4. Interface Utilisateur & Expérience Collaborateur
L'application propose une interface Single Page Application moderne (servie sur `http://localhost:8000/`) :
- **Tableau de bord multi-projets** : Visualisation sous forme de cartes d'espaces de travail avec compteurs de membres.
- **Tableau Kanban dynamique avec Drag & Drop HTML5 natif** :
  - Déplacement fluide des cartes de tâches d'une colonne à une autre par simple glisser-déposer.
  - Mise à jour optimiste de l'affichage et persistance asynchrone instantanée dans MongoDB.
  - Badges visuels de priorité colorés (Urgente, Haute, Moyenne, Basse).
  - Indicateur visuel d'avatar pour le collaborateur assigné.
- **Espace Gestion de l'Équipe** : Tableau des collaborateurs avec rôles et statuts actifs.
- **Espace Paramètres Entreprise** : Modification des informations ou suppression de l'organisation.
- **Documentation API interactive Swagger UI intégrée** (`/docs`) avec authentification directe via Bearer token.
