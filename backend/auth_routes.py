import os
from datetime import datetime, timezone, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field

from core import (db, hash_password, verify_password, create_access_token, create_refresh_token,
                  decode_token, public_user, get_current_user, require_admin, to_object_id, now_iso)

router = APIRouter(prefix="/api")

MAX_ATTEMPTS = 5
LOCK_MINUTES = 15


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=6, max_length=200)
    role: Literal["tecnico", "admin"] = "tecnico"


def _set_cookies(response: Response, access: str, refresh: str | None = None):
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="lax", max_age=900, path="/")
    if refresh:
        response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="lax", max_age=604800, path="/")


@router.post("/auth/login")
async def login(body: LoginIn, request: Request, response: Response):
    email = body.email.lower()
    ip = request.client.host if request.client else "unknown"
    identifier = f"{ip}:{email}"
    attempt = await db.login_attempts.find_one({"identifier": identifier})
    if attempt and attempt.get("locked_until") and datetime.fromisoformat(attempt["locked_until"]) > datetime.now(timezone.utc):
        raise HTTPException(status_code=429, detail="Muitas tentativas. Tente novamente em 15 minutos.")
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        count = (attempt or {}).get("count", 0) + 1
        update = {"identifier": identifier, "count": count}
        if count >= MAX_ATTEMPTS:
            update["locked_until"] = (datetime.now(timezone.utc) + timedelta(minutes=LOCK_MINUTES)).isoformat()
            update["count"] = 0
        await db.login_attempts.update_one({"identifier": identifier}, {"$set": update}, upsert=True)
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos")
    await db.login_attempts.delete_many({"identifier": identifier})
    uid = str(user["_id"])
    _set_cookies(response, create_access_token(uid, email), create_refresh_token(uid))
    return public_user(user)


@router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@router.post("/auth/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="Sessão expirada")
    payload = decode_token(token, "refresh")
    user = await db.users.find_one({"_id": to_object_id(payload["sub"])})
    if not user:
        raise HTTPException(status_code=401, detail="Usuário não encontrado")
    _set_cookies(response, create_access_token(str(user["_id"]), user["email"]))
    return public_user(user)


@router.get("/users")
async def list_users(_: dict = Depends(require_admin)):
    users = await db.users.find({}, {"password_hash": 0}).sort("created_at", 1).to_list(500)
    return [public_user(u) for u in users]


@router.post("/users")
async def create_user(body: UserCreate, _: dict = Depends(require_admin)):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Já existe um usuário com este e-mail")
    doc = {"email": email, "name": body.name.strip(), "role": body.role,
           "password_hash": hash_password(body.password), "created_at": now_iso()}
    res = await db.users.insert_one(doc)
    doc["_id"] = res.inserted_id
    return public_user(doc)


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(require_admin)):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Você não pode remover a própria conta")
    res = await db.users.delete_one({"_id": to_object_id(user_id)})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    await db.itineraries.delete_many({"owner_id": user_id})
    return {"ok": True}


async def seed_admin():
    email = os.environ["ADMIN_EMAIL"].lower()
    if await db.users.find_one({"email": email}) is None:
        await db.users.insert_one({"email": email, "name": "Administrador", "role": "admin",
                                   "password_hash": hash_password(os.environ["ADMIN_PASSWORD"]), "created_at": now_iso()})
