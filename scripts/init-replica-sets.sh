#!/usr/bin/env bash
set -euo pipefail

wait_for_primary() {
  local host="$1"
  for attempt in $(seq 1 90); do
    if mongosh "mongodb://${host}:27017/admin?directConnection=true" --quiet --eval 'rs.status().members.some(member => member.stateStr === "PRIMARY")' 2>/dev/null | grep -q true; then
      echo "Primary élu pour ${host}"
      return 0
    fi
    sleep 2
  done
  echo "Échec de l'élection du Primary pour ${host}" >&2
  return 1
}

init_replica_set() {
  local set_name="$1"
  local seed_host="$2"
  local members_json="$3"

  echo "Initialisation du Replica Set ${set_name}"
  mongosh "mongodb://${seed_host}:27017/admin?directConnection=true" --quiet --eval \
    "try { rs.status(); print('Replica Set ${set_name} déjà initialisé'); } catch (e) { if (e.code === 94 || e.codeName === 'NotYetInitialized') { printjson(rs.initiate({_id: '${set_name}', members: ${members_json}})); } else { throw e; } }"
  wait_for_primary "${seed_host}"
}

init_replica_set cfgRS cfg1 "[{_id: 0, host: 'cfg1:27017'}, {_id: 1, host: 'cfg2:27017'}, {_id: 2, host: 'cfg3:27017'}]"
init_replica_set shard1RS shard1a "[{_id: 0, host: 'shard1a:27017'}, {_id: 1, host: 'shard1b:27017'}, {_id: 2, host: 'shard1c:27017'}]"
init_replica_set shard2RS shard2a "[{_id: 0, host: 'shard2a:27017'}, {_id: 1, host: 'shard2b:27017'}, {_id: 2, host: 'shard2c:27017'}]"

echo "Tous les Replica Sets sont prêts."
