const dbName = "saas_pm_db";
const appDb = db.getSiblingDB(dbName);

print("Enregistrement des deux shards dans mongos...");
for (const shard of ["shard1RS/shard1a:27017,shard1b:27017,shard1c:27017", "shard2RS/shard2a:27017,shard2b:27017,shard2c:27017"]) {
  const known = db.adminCommand({listShards: 1}).shards.map((entry) => entry._id);
  const shardName = shard.startsWith("shard1RS") ? "shard1RS" : "shard2RS";
  if (!known.includes(shardName)) {
    printjson(db.adminCommand({addShard: shard, name: shardName}));
  }
}

print("Activation du sharding et partitionnement des collections...");
sh.enableSharding(dbName);
function ensureShardCollection(name, key, options = {}) {
  const namespace = `${dbName}.${name}`;
  if (!db.getSiblingDB("config").collections.findOne({_id: namespace})) {
    sh.shardCollection(namespace, key, false, options);
  }
}
ensureShardCollection("users", {email: 1});
ensureShardCollection("projects", {company_id: "hashed"}, {numInitialChunks: 8});
ensureShardCollection("tasks", {company_id: "hashed"}, {numInitialChunks: 8});

// Jeu de données stable et réexécutable pour rendre la distribution observable.
const companies = [];
const projects = [];
const tasks = [];
const now = new Date();
for (let index = 1; index <= 40; index += 1) {
    const suffix = index.toString(16).padStart(6, "0");
    const companyId = ObjectId(`650000000000000000${suffix}`);
    const projectId = ObjectId(`660000000000000000${suffix}`);
    const taskId1 = ObjectId(`670000000000000000${suffix}`);
    const taskId2 = ObjectId(`680000000000000000${suffix}`);
    companies.push({
      _id: companyId,
      name: `Entreprise de démonstration ${index.toString().padStart(2, "0")}`,
      description: "Fixture de démonstration du sharding (TD1 II)",
      fixture_set: "td1-ii",
      created_at: now,
      updated_at: now
    });
    projects.push({
      _id: projectId,
      name: `Projet de démonstration ${index.toString().padStart(2, "0")}`,
      description: "Projet de test de répartition MongoDB",
      company_id: companyId,
      member_ids: [],
      fixture_set: "td1-ii",
      created_at: now,
      updated_at: now
    });
    tasks.push(
      {
        _id: taskId1,
        title: `Tâche ${index} à faire`,
        description: "Fixture destinée à vérifier la distribution des tâches",
        status: "TODO",
        priority: "MEDIUM",
        project_id: projectId,
        company_id: companyId,
        assigned_user_id: null,
        fixture_set: "td1-ii",
        created_at: now,
        updated_at: now
      },
      {
        _id: taskId2,
        title: `Tâche ${index} terminée`,
        description: "Deuxième fixture de la même entreprise",
        status: "DONE",
        priority: "LOW",
        project_id: projectId,
        company_id: companyId,
        assigned_user_id: null,
        fixture_set: "td1-ii",
        created_at: now,
        updated_at: now
      }
    );
}
function insertMissingFixtures(collection, documents) {
  collection.bulkWrite(documents.map((document) => ({
    updateOne: {
      filter: document.company_id ? {_id: document._id, company_id: document.company_id} : {_id: document._id},
      update: {$setOnInsert: document},
      upsert: true
    }
  })), {ordered: false});
}
print("Insertion des fixtures réparties entre les shards...");
insertMissingFixtures(appDb.companies, companies);
insertMissingFixtures(appDb.projects, projects);
insertMissingFixtures(appDb.tasks, tasks);

print("Configuration distribuée terminée.");
printjson(db.adminCommand({listShards: 1}));
