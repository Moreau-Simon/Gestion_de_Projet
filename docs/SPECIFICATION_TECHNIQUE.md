# Spécification Technique - Architecture Base de Données MongoDB

## 1. Choix du paradigme et principes d'architecture

Le système repose sur **MongoDB**, une base de données orientée documents (NoSQL), particulièrement adaptée aux structures hiérarchiques et évolutives d'un outil SaaS de gestion de projet (Entreprises, Utilisateurs, Projets, Tâches Kanban).

### Isolation Logicielle Multi-Tenant (Tenant-Discriminator)
Pour garantir une isolation logicielle stricte sans surcoût d'infrastructure (base partagée, schéma partagé), chaque document métier (`users`, `projects`, `tasks`) intègre un identifiant d'entreprise obligatoire : `company_id`.
Toutes les requêtes de l'application imposent ce prédicat au niveau de la couche applicative et des index MongoDB.

### Anticipation de la Réplication et du Sharding (Partie II)
1. **Connexion dynamique** : La variable d'environnement `MONGO_URI` permet de basculer d'une instance standalone à un Replica Set (`mongodb://mongo1:27017,mongo2:27017/?replicaSet=rs0`) ou à un cluster shardé via mongos (`mongodb://mongos1:27017,mongos2:27017`).
2. **Clé de Sharding naturelle** : Dans un cluster distribué, la clé de partitionnement optimale est `{"company_id": "hashed"}` ou `{"company_id": 1, "_id": 1}`. L'ensemble des index composés créés dans le code intègrent `company_id` en première position pour maximiser le "query routing" et éviter les "scatter-gather queries".

---

## 2. Collections et Schémas JSON

### 2.1 Collection `companies` (Entreprises clientes / Tenants)
Stocke les entités clientes de la plateforme.

```json
{
  "_id": { "$oid": "6727b14d2b270769a68a25c1" },
  "name": "Acme Technologies",
  "description": "Entreprise spécialisée dans les solutions cloud",
  "created_at": { "$date": "2026-11-03T18:00:00.000Z" },
  "updated_at": { "$date": "2026-11-03T18:00:00.000Z" }
}
```

**Index :**
- `{"name": 1}` (Unique)

---

### 2.2 Collection `users` (Utilisateurs et Collaborateurs)
Stocke les comptes utilisateurs, avec hashage sécurisé du mot de passe (bcrypt) et rattachement strict à une entreprise.

```json
{
  "_id": { "$oid": "6727b14d2b270769a68a25c2" },
  "email": "alice@acme.com",
  "full_name": "Alice Dupont",
  "hashed_password": "$2b$12$e8YkZ...",
  "role": "admin",
  "company_id": { "$oid": "6727b14d2b270769a68a25c1" },
  "is_active": true,
  "created_at": { "$date": "2026-11-03T18:05:00.000Z" }
}
```

**Index :**
- `{"email": 1}` (Unique)
- `{"company_id": 1}`

---

### 2.3 Collection `projects` (Projets)
Stocke les projets d'une entreprise et la liste des collaborateurs membres.

```json
{
  "_id": { "$oid": "6727b14d2b270769a68a25c3" },
  "name": "Refonte Portail Client",
  "description": "Migration vers une architecture moderne",
  "company_id": { "$oid": "6727b14d2b270769a68a25c1" },
  "member_ids": [
    "6727b14d2b270769a68a25c2",
    "6727b14d2b270769a68a25c4"
  ],
  "created_at": { "$date": "2026-11-03T18:10:00.000Z" },
  "updated_at": { "$date": "2026-11-03T18:10:00.000Z" }
}
```

**Index :**
- `{"company_id": 1, "name": 1}` (Index composé couvrant également les requêtes filtrées sur `company_id` seul en préfixe)

---

### 2.4 Collection `tasks` (Tâches Kanban)
Représente les cartes du tableau Kanban. Chaque tâche appartient à un projet, à une entreprise, dispose d'un statut d'avancement et d'une assignation.

```json
{
  "_id": { "$oid": "6727b14d2b270769a68a25c5" },
  "title": "Concevoir le schéma NoSQL",
  "description": "Définir les collections JSON et index pour MongoDB",
  "status": "IN_PROGRESS",
  "priority": "HIGH",
  "project_id": { "$oid": "6727b14d2b270769a68a25c3" },
  "company_id": { "$oid": "6727b14d2b270769a68a25c1" },
  "assigned_user_id": "6727b14d2b270769a68a25c2",
  "created_at": { "$date": "2026-11-03T18:15:00.000Z" },
  "updated_at": { "$date": "2026-11-03T18:20:00.000Z" }
}
```

**Index :**
- `{"company_id": 1, "project_id": 1, "status": 1}` (Index composé optimisé pour l'affichage Kanban et couvrant `company_id` en préfixe)
- `{"assigned_user_id": 1}`
