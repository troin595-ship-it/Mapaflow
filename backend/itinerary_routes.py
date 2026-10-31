import uuid
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core import db, BaseDocument, get_current_user, to_object_id, now_iso

router = APIRouter(prefix="/api/itineraries")


class Stop(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), max_length=64)
    label: str = Field(min_length=1, max_length=200)
    address: str = Field(default="", max_length=400)
    place_id: Optional[str] = Field(default=None, max_length=300)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    status: Literal["pendente", "concluida"] = "pendente"
    completed_at: Optional[str] = None


class RouteSummary(BaseModel):
    distance_m: int = Field(ge=0)
    duration_s: int = Field(ge=0)


class ItineraryIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    stops: List[Stop] = Field(default_factory=list, max_length=25)
    return_to_base: bool = True
    last_route_summary: Optional[RouteSummary] = None


class Itinerary(BaseDocument):
    owner_id: str
    name: str
    stops: List[Stop]
    return_to_base: bool = True
    status: Literal["planejado", "em_andamento", "concluido"] = "planejado"
    last_route_summary: Optional[RouteSummary] = None
    created_at: str
    updated_at: str


def _check_duplicates(stops: List[Stop]):
    ids, coords = set(), set()
    for s in stops:
        key = (round(s.lat, 5), round(s.lng, 5))
        if s.id in ids or key in coords:
            raise HTTPException(status_code=400, detail=f"Parada duplicada: {s.label}")
        ids.add(s.id)
        coords.add(key)


def _status_for(stops: List[Stop], current: str) -> str:
    if stops and all(s.status == "concluida" for s in stops):
        return "concluido"
    return current


async def _get_owned(itinerary_id: str, user: dict) -> Itinerary:
    doc = await db.itineraries.find_one({"_id": to_object_id(itinerary_id), "owner_id": user["id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Roteiro não encontrado")
    return Itinerary.from_mongo(doc)


async def _save(it: Itinerary) -> dict:
    it.updated_at = now_iso()
    await db.itineraries.replace_one({"_id": to_object_id(it.id), "owner_id": it.owner_id}, it.to_mongo())
    return it.model_dump()


@router.get("")
async def list_itineraries(user: dict = Depends(get_current_user)):
    docs = await db.itineraries.find({"owner_id": user["id"]}).sort("updated_at", -1).to_list(50)
    return [Itinerary.from_mongo(d).model_dump() for d in docs]


@router.post("")
async def create_itinerary(body: ItineraryIn, user: dict = Depends(get_current_user)):
    _check_duplicates(body.stops)
    ts = now_iso()
    it = Itinerary(owner_id=user["id"], created_at=ts, updated_at=ts, **body.model_dump())
    res = await db.itineraries.insert_one(it.to_mongo())
    it.id = str(res.inserted_id)
    return it.model_dump()


@router.get("/{itinerary_id}")
async def get_itinerary(itinerary_id: str, user: dict = Depends(get_current_user)):
    return (await _get_owned(itinerary_id, user)).model_dump()


@router.put("/{itinerary_id}")
async def update_itinerary(itinerary_id: str, body: ItineraryIn, user: dict = Depends(get_current_user)):
    _check_duplicates(body.stops)
    it = await _get_owned(itinerary_id, user)
    it.name, it.stops, it.return_to_base = body.name, body.stops, body.return_to_base
    it.last_route_summary = body.last_route_summary
    it.status = _status_for(it.stops, "planejado" if it.status == "concluido" else it.status)
    return await _save(it)


@router.post("/{itinerary_id}/start")
async def start_itinerary(itinerary_id: str, user: dict = Depends(get_current_user)):
    it = await _get_owned(itinerary_id, user)
    it.status = _status_for(it.stops, "em_andamento")
    return await _save(it)


@router.post("/{itinerary_id}/stops/{stop_id}/complete")
async def complete_stop(itinerary_id: str, stop_id: str, user: dict = Depends(get_current_user)):
    it = await _get_owned(itinerary_id, user)
    stop = next((s for s in it.stops if s.id == stop_id), None)
    if not stop:
        raise HTTPException(status_code=404, detail="Parada não encontrada neste roteiro")
    if stop.status != "concluida":
        stop.status, stop.completed_at = "concluida", now_iso()
    it.status = _status_for(it.stops, "em_andamento")
    return await _save(it)


@router.post("/{itinerary_id}/stops/{stop_id}/reopen")
async def reopen_stop(itinerary_id: str, stop_id: str, user: dict = Depends(get_current_user)):
    it = await _get_owned(itinerary_id, user)
    stop = next((s for s in it.stops if s.id == stop_id), None)
    if not stop:
        raise HTTPException(status_code=404, detail="Parada não encontrada neste roteiro")
    stop.status, stop.completed_at = "pendente", None
    if it.status == "concluido":
        it.status = "em_andamento"
    return await _save(it)


@router.delete("/{itinerary_id}")
async def delete_itinerary(itinerary_id: str, user: dict = Depends(get_current_user)):
    res = await db.itineraries.delete_one({"_id": to_object_id(itinerary_id), "owner_id": user["id"]})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Roteiro não encontrado")
    return {"ok": True}
