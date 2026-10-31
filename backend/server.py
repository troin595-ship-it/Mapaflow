from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

import os
import logging
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from core import db, client
from auth_routes import router as auth_router, seed_admin
from maps_routes import router as maps_router
from itinerary_routes import router as itinerary_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")

app = FastAPI(title="RotaFlow API")
app.include_router(auth_router)
app.include_router(maps_router)
app.include_router(itinerary_router)

_origins = os.environ["CORS_ORIGINS"].split(",")
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[] if "*" in _origins else _origins,
    allow_origin_regex=r"https://[a-z0-9-]+\.preview\.emergentagent\.com|https://[a-z0-9.-]+\.emergent\.host" if "*" in _origins else None,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"ok": True}


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.itineraries.create_index([("owner_id", 1), ("updated_at", -1)])
    await db.geocode_cache.create_index("query", unique=True)
    await db.place_cache.create_index("place_id", unique=True)
    await seed_admin()


@app.on_event("shutdown")
async def shutdown():
    client.close()
