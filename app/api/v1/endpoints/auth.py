from datetime import datetime, timezone
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.api.deps import get_current_user
from app.core.database import get_database
from app.core.security import create_access_token, get_password_hash, verify_password
from app.models.user import (
    CompanyRegisterRequest,
    LoginRequest,
    TokenResponse,
    UserResponse,
    UserRole,
)

router = APIRouter(prefix="/auth", tags=["Authentification & Inscription"])


@router.post(
    "/register-company",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Inscription d'une nouvelle entreprise cliente et de son premier compte administrateur"
)
async def register_company(
    payload: CompanyRegisterRequest,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Point d'entrée SaaS pour onboarder un nouveau client :
    1. Crée l'organisation / entreprise (Tenant).
    2. Crée le premier utilisateur avec le rôle ADMIN rattaché à cette entreprise.
    3. Délivre le jeton JWT d'authentification scellant l'isolation logicielle.
    """
    # 1. Vérification de l'unicité du nom d'entreprise
    existing_company = await db.companies.find_one({"name": payload.company_name})
    if existing_company:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Une entreprise avec ce nom existe déjà."
        )

    # 2. Vérification de l'unicité de l'email
    existing_user = await db.users.find_one({"email": payload.admin_email.lower()})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cette adresse email est déjà utilisée par un compte."
        )

    now = datetime.now(timezone.utc)

    # 3. Insertion de l'entreprise
    company_doc = {
        "name": payload.company_name,
        "description": payload.company_description,
        "created_at": now,
        "updated_at": now,
    }
    company_result = await db.companies.insert_one(company_doc)
    company_id = str(company_result.inserted_id)

    # 4. Insertion du compte administrateur lié à l'entreprise
    user_doc = {
        "email": payload.admin_email.lower(),
        "full_name": payload.admin_full_name,
        "hashed_password": get_password_hash(payload.admin_password),
        "role": UserRole.ADMIN.value,
        "company_id": ObjectId(company_id),
        "is_active": True,
        "created_at": now,
    }
    user_result = await db.users.insert_one(user_doc)
    user_id = str(user_result.inserted_id)

    # 5. Génération du token JWT scellé avec le company_id
    token = create_access_token({
        "sub": user_id,
        "company_id": company_id,
        "role": UserRole.ADMIN.value,
        "email": payload.admin_email.lower(),
    })

    user_response = UserResponse(
        id=user_id,
        email=payload.admin_email.lower(),
        full_name=payload.admin_full_name,
        role=UserRole.ADMIN,
        company_id=company_id,
        is_active=True,
        created_at=now,
    )

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=user_response
    )


async def _authenticate_user(
    email: str,
    password: str,
    db: AsyncIOMotorDatabase
) -> TokenResponse:
    """Logique d'authentification commune factorisée (OAuth2 Form & JSON)."""
    email_clean = email.lower()
    user_doc = await db.users.find_one({"email": email_clean})

    if not user_doc or not verify_password(password, user_doc.get("hashed_password", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identifiants incorrects (email ou mot de passe).",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user_doc.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ce compte utilisateur est désactivé."
        )

    user_id = str(user_doc["_id"])
    company_id = str(user_doc["company_id"])
    role = user_doc.get("role", UserRole.MEMBER.value)

    token = create_access_token({
        "sub": user_id,
        "company_id": company_id,
        "role": role,
        "email": email_clean,
    })

    user_response = UserResponse(
        id=user_id,
        email=email_clean,
        full_name=user_doc["full_name"],
        role=role,
        company_id=company_id,
        is_active=user_doc.get("is_active", True),
        created_at=user_doc["created_at"],
    )

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=user_response
    )


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Connexion utilisateur (compatible Swagger OAuth2 form et JSON)"
)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Authentifie l'utilisateur via son email et mot de passe.
    Retourne un jeton JWT contenant le subject (user_id) et le claim company_id.
    Compatible avec le bouton vert 'Authorize' de Swagger UI.
    """
    return await _authenticate_user(form_data.username, form_data.password, db)


@router.post(
    "/login-json",
    response_model=TokenResponse,
    summary="Connexion utilisateur via corps JSON (alternative API REST)"
)
async def login_json(
    credentials: LoginRequest,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Permet de s'authentifier en envoyant directement un corps JSON {'email': '...', 'password': '...'}."""
    return await _authenticate_user(credentials.email, credentials.password, db)


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Informations sur le profil connecté et son entreprise"
)
async def read_current_user_profile(
    current_user: UserResponse = Depends(get_current_user)
):
    """Retourne l'utilisateur actuellement connecté après vérification du jeton JWT."""
    return current_user
