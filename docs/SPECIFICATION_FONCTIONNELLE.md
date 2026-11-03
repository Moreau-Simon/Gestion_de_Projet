# Spécification Fonctionnelle - Outil SaaS de Gestion de Projet

## 1. Présentation du Produit
L'application est une plateforme SaaS (Software as a Service) multi-entreprises dédiée au pilotage et à la gestion de projets agiles, inspirée d'outils collaboratifs majeurs tels que Trello, Notion et ClickUp.

---

## 2. Rôles et Acteurs
1. **Administrateur d'Entreprise (Tenant Admin)** :
   - Crée l'organisation lors du parcours d'inscription initial.
   - Gère le cycle de vie de son entreprise (consultation, mise à jour, suppression).
   - Invite et administre les comptes utilisateurs au sein de sa structure.
   - Crée et supprime des projets.
2. **Collaborateur / Membre (Member)** :
   - Participe aux projets de son entreprise auxquels il est affecté.
   - Crée, consulte, déplace et met à jour les tâches sur le tableau Kanban.

---

## 3. Matrice des Fonctionnalités

### 3.1 Authentification & Onboarding Multi-Tenant
- **Inscription Entreprise + Admin (`POST /api/v1/auth/register-company`)** : Crée en une opération atomique le tenant d'entreprise et son premier compte administrateur.
- **Connexion JWT (`POST /api/v1/auth/login` et `/login-json`)** : Authentification par email/mot de passe générant un jeton Bearer JWT incluant l'identifiant utilisateur et l'identifiant d'entreprise.
- **Consultation du profil (`GET /api/v1/auth/me`)** : Récupère les données d'identité de la session active.

### 3.2 Gestion des Utilisateurs & Isolation Stricte
- **Création de collaborateur (`POST /api/v1/users/`)** : Réservé aux administrateurs. L'utilisateur créé hérite automatiquement et immuablement du `company_id` de l'administrateur.
- **Liste des collaborateurs (`GET /api/v1/users/`)** : Affiche uniquement les utilisateurs de la même entreprise.
- **Consultation d'un profil (`GET /api/v1/users/{id}`)** : Accès refusé (404) si l'utilisateur ciblé appartient à un autre locataire.
- **Suppression d'un compte (`DELETE /api/v1/users/{id}`)** : Suppression contrôlée au sein de l'entreprise.

### 3.3 Gestion des Projets
- **Création de projet (`POST /api/v1/projects/`)** : Association au `company_id` et assignation d'une équipe de membres internes à l'entreprise.
- **Liste des projets (`GET /api/v1/projects/`)** : Récupération exclusive des projets de l'entreprise connectée.
- **Mise à jour et suppression en cascade (`PUT/DELETE /api/v1/projects/{id}`)** : Modification des informations et suppression propre incluant toutes les tâches rattachées.

### 3.4 Pilotage des Tâches & Tableau Kanban
- **Création de tâche (`POST /api/v1/tasks/`)** : Rattachement à un projet, niveau de priorité (`LOW`, `MEDIUM`, `HIGH`, `URGENT`), statut initial et assignation à un membre de l'entreprise.
- **Visualisation Kanban (`GET /api/v1/tasks/kanban/{project_id}`)** : Renvoie les tâches directement structurées par colonnes de statut (`TODO`, `IN_PROGRESS`, `REVIEW`, `DONE`) pour alimenter l'interface visuelle.
- **Déplacement de carte (`PUT /api/v1/tasks/{task_id}`)** : Transition d'état dans le tableau Kanban et réassignation de collaborateur.
