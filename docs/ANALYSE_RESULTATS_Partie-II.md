# Analyse des résultats — Partie II

**Projet :** FlowSaaS — MongoDB 7.0  
**Date des vérifications :** 25 novembre 2026

## 1. Démarrage de l’infrastructure

La commande `docker compose up -d --build` a démarré avec succès l’API, le routeur `mongos`, les trois membres du Replica Set de configuration et les six membres des deux shards. Les étapes automatiques d’initialisation des Replica Sets et du cluster se sont terminées avant le démarrage de l’API. Le healthcheck de l’API a répondu :

```json
{"status":"healthy","database":"connected","database_name":"saas_pm_db"}
```

## 2. Vérification fonctionnelle de l’application

Le script fourni `python test_api.py` s’est terminé avec le code retour 0 : ses neuf étapes ont réussi sur le cluster shardé.

- L’API et sa connexion MongoDB sont saines.
- L’authentification et les opérations de gestion des utilisateurs, projets et tâches fonctionnent.
- L’isolation entre Acme Corp et Beta Inc est respectée : l’accès inter-entreprise à Bob retourne HTTP 404.
- Le contrôle RBAC refuse à un membre la suppression d’un projet (HTTP 403).
- La création, la lecture et le déplacement d’une tâche dans le Kanban ont réussi.

Les données temporaires créées par le test ont ensuite été retirées, et le nom de démonstration de Bob a été rétabli.

## 3. Réplication observée

Avant le test de panne, chaque Replica Set avait un Primary et deux Secondary :

| Replica Set | Primary observé | Secondary observés |
|---|---|---|
| `cfgRS` | `cfg1` | `cfg2`, `cfg3` |
| `shard1RS` | `shard1b` | `shard1a`, `shard1c` |
| `shard2RS` | `shard2b` | `shard2a`, `shard2c` |

`mongos` retournait bien deux shards enregistrés : `shard1RS` et `shard2RS`.

## 4. Répartition observée

La commande `getShardDistribution()` a confirmé la présence de données sur les deux shards :

| Collection | `shard1RS` | `shard2RS` | Total observé |
|---|---:|---:|---:|
| `projects` | 21 documents (50 %) | 21 documents (50 %) | 42 documents |
| `tasks` | 43 documents (50,58 %) | 42 documents (49,41 %) | 85 documents |

Un chunk contenant les documents était présent sur chaque shard et pour chacune de ces collections au moment de la mesure. La répartition presque égale confirme que les clés hachées `company_id` distribuent les fixtures et les données de démonstration entre les deux shards.

Les mesures ont été prises après le scénario fonctionnel : elles comprennent les documents de test avant leur nettoyage, ainsi que les fixtures et exemples de démonstration.

## 5. Perte du Primary et reprise

Le Primary `shard1b` a été arrêté avec `docker compose stop shard1b`. Après l’élection, l’état observé était :

| Membre de `shard1RS` | État après l’arrêt |
|---|---|
| `shard1a` | `PRIMARY` |
| `shard1b` | injoignable (arrêté volontairement) |
| `shard1c` | `SECONDARY` |

Pendant cette panne, `/health` a continué à répondre `healthy` avec `database: connected`. Après `docker compose start shard1b`, ce membre a rejoint le Replica Set en tant que `SECONDARY`, tandis que `shard1a` est resté `PRIMARY`. Cela confirme l’élection automatique et le retour du membre sans reconfiguration manuelle.

## 6. Conclusion

Les résultats observés répondent aux objectifs de la partie II : les Replica Sets ont élu leurs Primaries, les projets et les tâches ont été répartis entre deux shards, et l’application est restée accessible après l’arrêt du Primary d’un shard. Le membre redémarré a réintégré automatiquement son Replica Set. La charge d’un locataire unique demeure toutefois attachée au shard choisi par son `company_id`, conformément au compromis de cette clé de sharding.
