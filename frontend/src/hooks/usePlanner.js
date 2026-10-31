import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { fmtDist, fmtDur, haversine } from "@/lib/geo";

const defaultName = () => `Roteiro ${new Date().toLocaleDateString("pt-BR")}`;
const newId = () => (window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export function usePlanner(base) {
  const [stops, setStops] = useState([]);
  const [returnToBase, setReturnToBase] = useState(true);
  const [name, setName] = useState(defaultName);
  const [itinerary, setItinerary] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stale, setStale] = useState(false);
  const [saved, setSaved] = useState([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [legCompare, setLegCompare] = useState(null);
  const itRef = useRef(null);
  itRef.current = itinerary;
  const nameRef = useRef(name);
  nameRef.current = name;

  const refreshSaved = useCallback(async () => {
    try {
      const { data } = await api.get("/itineraries");
      setSaved(data);
      return data;
    } catch (e) {
      toast.error(apiError(e));
      return [];
    } finally {
      setSavedLoading(false);
    }
  }, []);

  const persist = useCallback(async (list, route, rtb) => {
    const payload = {
      name: nameRef.current.trim() || defaultName(),
      stops: list,
      return_to_base: rtb,
      last_route_summary: route ? { distance_m: route.distance_m, duration_s: route.duration_s } : null,
    };
    const id = itRef.current?.id;
    const { data } = id ? await api.put(`/itineraries/${id}`, payload) : await api.post("/itineraries", payload);
    setItinerary(data);
    itRef.current = data;
    refreshSaved();
    return data;
  }, [refreshSaved]);

  const compute = useCallback(async (list, { optimize = false, rtb } = {}) => {
    const useRtb = rtb ?? returnToBase;
    if (!base || !list.length) return;
    setLoading(true);
    setError(null);
    setLegCompare(null);
    const pts = list.map((s) => ({ lat: s.lat, lng: s.lng }));
    const b = { lat: base.lat, lng: base.lng };
    const body = {
      origin: b,
      destination: useRtb ? b : pts[pts.length - 1],
      intermediates: useRtb ? pts : pts.slice(0, -1),
      optimize,
      alternatives: true,
    };
    try {
      const { data } = await api.post("/routes/compute-route", body);
      const r0 = data.routes[0];
      let ordered = list;
      if (optimize && r0.optimized_order?.length) {
        const inter = useRtb ? list : list.slice(0, -1);
        const re = r0.optimized_order.map((i) => inter[i]);
        ordered = useRtb ? re : [...re, list[list.length - 1]];
        toast.success(`Ordem otimizada: ${fmtDist(r0.distance_m)} · ${fmtDur(r0.duration_s)}`);
      }
      setStops(ordered);
      setRoutes(data.routes);
      setSelectedRoute(0);
      setStale(false);
      await persist(ordered, r0, useRtb);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  }, [base, returnToBase, persist]);

  const markChanged = useCallback(() => {
    setStale(true);
    setLegCompare(null);
  }, []);

  const addStop = useCallback((place) => {
    const dup = stops.find((s) => (place.place_id && s.place_id === place.place_id) || haversine(s, place) < 15);
    if (dup) {
      toast.error(`"${dup.label}" já está no roteiro`);
      return false;
    }
    setStops((prev) => [...prev, { id: newId(), label: place.label || place.address, address: place.address || "", place_id: place.place_id || null, lat: place.lat, lng: place.lng, status: "pendente" }]);
    markChanged();
    return true;
  }, [stops, markChanged]);

  const removeStop = useCallback((id) => {
    setStops((prev) => prev.filter((s) => s.id !== id));
    markChanged();
  }, [markChanged]);

  const reorder = useCallback((list) => {
    setStops(list);
    markChanged();
  }, [markChanged]);

  const toggleReturn = useCallback((v) => {
    setReturnToBase(v);
    markChanged();
  }, [markChanged]);

  const setStopStatus = useCallback(async (id, done) => {
    const it = itRef.current;
    if (!it) return;
    try {
      const { data } = await api.post(`/itineraries/${it.id}/stops/${id}/${done ? "complete" : "reopen"}`);
      setItinerary(data);
      setStops((prev) => prev.map((s) => data.stops.find((d) => d.id === s.id) || s));
      refreshSaved();
    } catch (e) {
      toast.error(apiError(e));
    }
  }, [refreshSaved]);

  const ensureSaved = useCallback(async () => {
    try {
      if (itRef.current && !stale) return itRef.current;
      return await persist(stops, stale ? null : routes[selectedRoute], returnToBase);
    } catch (e) {
      toast.error(apiError(e));
      return null;
    }
  }, [stale, persist, stops, routes, selectedRoute, returnToBase]);

  const load = useCallback((it) => {
    setItinerary(it);
    itRef.current = it;
    setStops(it.stops);
    setName(it.name);
    setReturnToBase(it.return_to_base);
    setRoutes([]);
    setLegCompare(null);
    if (it.stops.length) compute(it.stops, { rtb: it.return_to_base });
  }, [compute]);

  const reset = useCallback(() => {
    setItinerary(null);
    itRef.current = null;
    setStops([]);
    setName(defaultName());
    setReturnToBase(true);
    setRoutes([]);
    setStale(false);
    setError(null);
    setLegCompare(null);
  }, []);

  const removeSaved = useCallback(async (id) => {
    try {
      await api.delete(`/itineraries/${id}`);
      if (itRef.current?.id === id) reset();
      refreshSaved();
      toast.success("Roteiro excluído");
    } catch (e) {
      toast.error(apiError(e));
    }
  }, [refreshSaved, reset]);

  const compareLeg = useCallback(async (legIdx) => {
    const leg = routes[selectedRoute]?.legs[legIdx];
    if (!leg) return;
    setLegCompare({ legIdx, routes: [], selected: 0, loading: true });
    try {
      const { data } = await api.post("/routes/compute-route", { origin: leg.start, destination: leg.end, intermediates: [], alternatives: true });
      setLegCompare({ legIdx, routes: data.routes, selected: 0, loading: false });
    } catch (e) {
      setLegCompare(null);
      toast.error(apiError(e));
    }
  }, [routes, selectedRoute]);

  return {
    stops, returnToBase, name, setName, itinerary, routes, selectedRoute, setSelectedRoute, loading, error, stale,
    saved, savedLoading, legCompare, setLegCompare, refreshSaved, compute, addStop, removeStop, reorder, toggleReturn,
    setStopStatus, ensureSaved, load, reset, removeSaved, compareLeg,
  };
}
