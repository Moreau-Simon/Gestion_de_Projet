"""
Script de test automatisé de validation du backend SaaS.
Utilise uniquement la bibliothèque standard Python (urllib.request, json).
Peut être exécuté localement une fois les conteneurs démarrés :
    python test_api.py
"""

import json
import sys
import urllib.error
import urllib.request

BASE_URL = "http://localhost:8000/api/v1"


def api_request(method: str, path: str, data: dict = None, token: str = None) -> tuple[int, dict]:
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req) as response:
            status_code = response.getcode()
            response_body = response.read().decode("utf-8")
            return status_code, json.loads(response_body) if response_body else {}
    except urllib.error.HTTPError as e:
        status_code = e.code
        err_body = e.read().decode("utf-8")
        try:
            return status_code, json.loads(err_body)
        except Exception:
            return status_code, {"detail": err_body}
    except Exception as e:
        print(f"[ERREUR CONNEXION] Impossible de contacter l'API sur {url}: {e}")
        print("Assurez-vous d'avoir lancé : docker compose up -d --build")
        sys.exit(1)


def main():
    print("=" * 70)
    print("TEST DE VALIDATION DU BACKEND SAAS & ISOLATION LOGICIELLE")
    print("=" * 70)

    # 1. Test du Healthcheck
    print("\n[1/7] Test de santé applicatif (/health)...")
    req = urllib.request.Request("http://localhost:8000/health", method="GET")
    with urllib.request.urlopen(req) as resp:
        health_data = json.loads(resp.read().decode("utf-8"))
        assert health_data["status"] == "healthy", "L'API n'est pas saine !"
        assert health_data["database"] == "connected", "MongoDB non connecté !"
        print(f"  OK -> MongoDB connecté : {health_data['database_name']}")

    # 2. Création de l'Entreprise A et Admin Alice
    print("\n[2/7] Enregistrement Entreprise A ('Acme Corp') et Admin Alice...")
    status_code, alice_auth = api_request("POST", "/auth/register-company", {
        "company_name": "Acme Corp",
        "company_description": "Fournisseur de solutions logicielles",
        "admin_email": "alice@acme.com",
        "admin_full_name": "Alice Dupont",
        "admin_password": "Password123!"
    })
    if status_code == 400 and "existe déjà" in str(alice_auth):
        print("  -> Acme Corp existe déjà, connexion via /auth/login-json...")
        status_code, alice_auth = api_request("POST", "/auth/login-json", {
            "email": "alice@acme.com",
            "password": "Password123!"
        })

    assert status_code in (200, 201), f"Erreur inscription Alice: {alice_auth}"
    alice_token = alice_auth["access_token"]
    acme_company_id = alice_auth["user"]["company_id"]
    print(f"  OK -> Alice authentifiée (Company ID: {acme_company_id})")

    # 3. Création d'un utilisateur collaborateur chez Acme Corp
    print("\n[3/7] Création d'un collaborateur 'Bob' chez Acme Corp par l'Admin Alice...")
    status_code, bob_user = api_request("POST", "/users/", {
        "email": "bob@acme.com",
        "full_name": "Bob Martin",
        "password": "Password123!",
        "role": "member",
        "is_active": True
    }, token=alice_token)
    if status_code == 400 and "existe déjà" in str(bob_user):
        print("  -> Bob existe déjà, récupération de la liste...")
    else:
        assert status_code == 201, f"Erreur création Bob: {bob_user}"
        assert bob_user["company_id"] == acme_company_id, "Bob n'a pas été assigné à Acme Corp !"
        print(f"  OK -> Bob créé avec succès (ID: {bob_user['id']}, Company: {bob_user['company_id']})")

    # 4. Liste des utilisateurs chez Acme Corp
    print("\n[4/7] Consultation des utilisateurs d'Acme Corp...")
    status_code, acme_users = api_request("GET", "/users/", token=alice_token)
    assert status_code == 200
    emails = [u["email"] for u in acme_users]
    print(f"  OK -> Collaborateurs trouvés chez Acme Corp : {emails}")
    assert "alice@acme.com" in emails and "bob@acme.com" in emails

    # 5. Création de l'Entreprise B ('Beta Inc') et Admin Charlie
    print("\n[5/7] Enregistrement Entreprise B ('Beta Inc') et Admin Charlie...")
    status_code, charlie_auth = api_request("POST", "/auth/register-company", {
        "company_name": "Beta Inc",
        "company_description": "Concurrent ou autre client SaaS",
        "admin_email": "charlie@beta.com",
        "admin_full_name": "Charlie Petit",
        "admin_password": "Password123!"
    })
    if status_code == 400 and "existe déjà" in str(charlie_auth):
        status_code, charlie_auth = api_request("POST", "/auth/login-json", {
            "email": "charlie@beta.com",
            "password": "Password123!"
        })

    assert status_code in (200, 201), f"Erreur inscription Charlie: {charlie_auth}"
    charlie_token = charlie_auth["access_token"]
    beta_company_id = charlie_auth["user"]["company_id"]
    print(f"  OK -> Charlie authentifié chez Beta Inc (Company ID: {beta_company_id})")
    assert acme_company_id != beta_company_id, "Les deux entreprises doivent avoir des ID distincts !"

    # 6. Test d'étanchéité stricte (Isolation Multi-Tenant)
    print("\n[6/7] Test de l'isolation logicielle stricte...")
    # Charlie liste ses utilisateurs : il ne doit voir QUE lui-même, AUCUN utilisateur d'Acme !
    status_code, beta_users = api_request("GET", "/users/", token=charlie_token)
    beta_emails = [u["email"] for u in beta_users]
    print(f"  -> Collaborateurs vus par Charlie : {beta_emails}")
    assert "alice@acme.com" not in beta_emails, "FAILLE D'ISOLATION : Charlie voit Alice !"
    assert "bob@acme.com" not in beta_emails, "FAILLE D'ISOLATION : Charlie voit Bob !"

    # Charlie tente d'accéder directement au profil de Bob avec son ID
    bob_id = next(u["id"] for u in acme_users if u["email"] == "bob@acme.com")
    status_code, res_leak = api_request("GET", f"/users/{bob_id}", token=charlie_token)
    assert status_code == 404, f"FAILLE D'ISOLATION : Charlie a pu requêter Bob ! Statut: {status_code}"
    print("  OK -> Tentative d'accès cross-tenant bloquée (HTTP 404 Not Found pour Charlie) !")

    # 7. Création d'un projet et visualisation Kanban
    print("\n[7/7] Création d'un projet et d'une tâche Kanban chez Acme Corp...")
    status_code, project = api_request("POST", "/projects/", {
        "name": "Projet Alpha",
        "description": "Lancement du produit",
        "member_ids": [bob_id]
    }, token=alice_token)
    assert status_code == 201
    project_id = project["id"]
    print(f"  OK -> Projet créé : '{project['name']}' (ID: {project_id})")

    status_code, task = api_request("POST", "/tasks/", {
        "title": "Développer le MVP",
        "description": "Architecture backend FastAPI + Mongo",
        "status": "TODO",
        "priority": "HIGH",
        "project_id": project_id,
        "assigned_user_id": bob_id
    }, token=alice_token)
    assert status_code == 201
    task_id = task["id"]
    print(f"  OK -> Tâche créée : '{task['title']}' assignée à Bob")

    # Visualisation du tableau Kanban
    status_code, kanban = api_request("GET", f"/tasks/kanban/{project_id}", token=alice_token)
    assert status_code == 200
    assert len(kanban["columns"]["TODO"]) >= 1
    print(f"  OK -> Tableau Kanban généré avec succès ({len(kanban['columns']['TODO'])} carte(s) dans TODO)")

    # 8. Test de Contrôle d'Accès par Rôle (RBAC)
    print("\n[8/8] Test de sécurité RBAC (Suppression de projet réservée à l'administrateur)...")
    # Connexion en tant que Bob (member)
    status_code, bob_auth = api_request("POST", "/auth/login-json", {
        "email": "bob@acme.com",
        "password": "Password123!"
    })
    assert status_code == 200
    bob_token = bob_auth["access_token"]

    # Bob (member) tente de supprimer le projet -> Doit échouer avec HTTP 403 Forbidden
    status_code, delete_res = api_request("DELETE", f"/projects/{project_id}", token=bob_token)
    assert status_code == 403, f"FAILLE DE SÉCURITÉ : Un simple membre a pu supprimer un projet ! Statut: {status_code}"
    print("  OK -> Tentative de suppression par un simple 'member' rejetée avec succès (HTTP 403 Forbidden) !")

    print("\n" + "=" * 70)
    print("TOUS LES TESTS SONT VALIDES AVEC SUCCES !")
    print("L'isolation logicielle stricte, la sécurité RBAC et toutes les fonctionnalités sont vérifiées.")
    print("=" * 70)


if __name__ == "__main__":
    main()
