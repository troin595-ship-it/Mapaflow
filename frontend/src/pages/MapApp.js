import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ChevronLeft, ChevronRight, Navigation } from "lucide-react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { cameraForPoints, flyTo } from "@/lib/camera";
import { decodePolyline, fmtDist, fmtDur, offsetPoint } from "@/lib/geo";
import { MapCanvas } from "@/components/map/MapCanvas";
import { MapControls } from "@/components/map/MapControls";
import { useNavLegOverlay, useRouteOverlays, useStopMarkers, useVehicleMarker } from "@/components/map/useMapOverlays";
import { PlannerPanel } from "@/components/planner/PlannerPanel";
import { AppHeader } from "@/components/AppHeader";
import { MobileSheet, sheetHeight } from "@/components/layout/MobileSheet";
import { NavigationHUD } from "@/components/nav/NavigationHUD";
import { usePlanner } from "@/hooks/usePlanner";
import { useNavigationSession } from "@/hooks/useNavigationSession";

function useMedia(query) {
  const [m, setM] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const fn = () => setM(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [query]);
  return m;
}

function FullState({ title, msg, testid }) {
  return (
    <div className="h-[100dvh] grid place-items-center bg-[#0B0F17] p-6" data-testid={testid}>
      <div className="max-w-md rf-glass rounded-3xl p-7 text-center">
        <AlertTriangle className="h-8 w-8 text-amber-400 mx-auto" />
        <p className="mt-3 font-bold text-white text-lg">{title}</p>
        <p className="mt-2 text-sm text-slate-400">{msg}</p>
      </div>
    </div>
  );
}

function Peek({ planner, onStart }) {
  const r = planner.stale ? null : planner.routes[planner.selectedRoute];
  return (
    <div className="flex items-center gap-3" data-testid="sheet-peek">
      <div className="min-w-0 flex-1">
        {r ? (
          <>
            <p className="font-mono text-xl font-bold text-white leading-none">{fmtDur(r.duration_s)}</p>
            <p className="text-xs text-slate-400 mt-1 font-mono">{fmtDist(r.distance_m)} · {planner.stops.length} paradas</p>
          </>
        ) : (
          <>
            <p className="font-bold text-white truncate">{planner.name}</p>
            <p className="text-xs text-slate-400 mt-0.5">{planner.stops.length ? `${planner.stops.length} paradas · calcule a rota` : "Adicione paradas ao roteiro"}</p>
          </>
        )}
      </div>
      {r && (
        <button onClick={(e) => { e.stopPropagation(); onStart(); }} className="rf-btn-go h-11 px-5 rounded-2xl text-sm" data-testid="sheet-start-navigation-button">
          <Navigation className="h-4 w-4" fill="currentColor" />Iniciar
        </button>
      )}
    </div>
  );
}

function Workspace({ config }) {
  const base = config.base;
  const isDesktop = useMedia("(min-width: 1024px)");
  const [map, setMap] = useState(null);
  const planner = usePlanner(base);
  const { setStopStatus } = planner;
  const completeStop = useCallback((id) => setStopStatus(id, true), [setStopStatus]);
  const session = useNavigationSession({ base, stops: planner.stops, returnToBase: planner.returnToBase, ensureSaved: planner.ensureSaved, completeStop });
  const [selectedId, setSelectedId] = useState(null);
  const [satellite, setSatellite] = useState(false);
  const [traffic, setTraffic] = useState(false);
  const [follow, setFollow] = useState(false);
  const [myLoc, setMyLoc] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [snap, setSnap] = useState("peek");
  const trafficLayer = useRef(null);
  const navStarted = useRef(false);

  useEffect(() => {
    planner.refreshSaved().then((list) => {
      const ip = list.find((i) => i.status === "em_andamento");
      if (ip) {
        planner.load(ip);
        toast("Roteiro em andamento recuperado", { description: ip.name });
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pad = useCallback(() => (isDesktop
    ? { top: 80, right: 110, bottom: 80, left: sidebarOpen ? 470 : 90 }
    : { top: 80, right: 70, bottom: sheetHeight(snap) + 30, left: 30 }), [isDesktop, sidebarOpen, snap]);

  const overview = useCallback(() => {
    if (!map) return;
    const lc = planner.legCompare?.routes?.[planner.legCompare.selected];
    const r = lc || (!planner.stale && planner.routes[planner.selectedRoute]);
    const pts = r ? decodePolyline(r.polyline) : [base, ...planner.stops];
    flyTo(map, cameraForPoints(map, pts, pad()), 1400);
  }, [map, planner.routes, planner.selectedRoute, planner.stale, planner.stops, planner.legCompare, base, pad]);

  useEffect(() => {
    if (map && planner.routes.length && !session.active) overview();
  }, [map, planner.routes, planner.legCompare?.routes]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!map || !selectedId || session.active) return;
    const s = planner.stops.find((x) => x.id === selectedId);
    if (s) flyTo(map, { center: { lat: s.lat, lng: s.lng }, zoom: 16.5, tilt: 45 }, 1100);
    if (!isDesktop) setSnap("half");
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (map) map.setMapTypeId(satellite ? "hybrid" : "roadmap");
  }, [map, satellite]);

  useEffect(() => {
    if (!map) return;
    if (!trafficLayer.current) trafficLayer.current = new window.google.maps.TrafficLayer();
    trafficLayer.current.setMap(traffic ? map : null);
  }, [map, traffic]);

  useEffect(() => {
    if (!map) return undefined;
    const l = map.addListener("dragstart", () => setFollow(false));
    return () => l.remove();
  }, [map]);

  useEffect(() => {
    if (!session.active) {
      if (navStarted.current) {
        navStarted.current = false;
        setFollow(false);
        overview();
      }
      return;
    }
    const d = session.nav?.display;
    if (!navStarted.current && d && map) {
      navStarted.current = true;
      flyTo(map, { center: offsetPoint(d, session.nav.heading, 55), zoom: 18.3, tilt: 62, heading: session.nav.heading }, 1600)
        .then((ok) => ok && setFollow(true));
    }
  }, [session.active, session.nav, map, overview]);

  const vehicle = useMemo(() => {
    if (session.active) return session.nav ? { ...session.nav.display, heading: session.nav.heading } : null;
    return myLoc;
  }, [session.active, session.nav, myLoc]);

  const lc = planner.legCompare;
  const shownRoutes = lc?.routes?.length ? lc.routes : planner.stale ? [] : planner.routes;
  const onSelectRoute = lc?.routes?.length ? (i) => planner.setLegCompare({ ...lc, selected: i }) : planner.setSelectedRoute;
  useRouteOverlays(map, shownRoutes, lc?.routes?.length ? lc.selected : planner.selectedRoute, onSelectRoute, session.active);
  useNavLegOverlay(map, session.legPath, session.leg, session.nav?.seg, session.nav?.display);
  useVehicleMarker(map, vehicle, follow && session.active);
  useStopMarkers(map, base, planner.stops, selectedId, session.active ? session.targetKey : null, (k) => {
    if (k === "base") flyTo(map, { center: { lat: base.lat, lng: base.lng }, zoom: 16.5 }, 900);
    else {
      setSelectedId(k);
      setSidebarOpen(true);
    }
  });

  const recenter = () => {
    if (session.active && session.nav) {
      const d = session.nav.display;
      flyTo(map, { center: offsetPoint(d, session.nav.heading, 55), zoom: 18.3, tilt: 62, heading: session.nav.heading }, 900).then((ok) => ok && setFollow(true));
      return;
    }
    if (!navigator.geolocation) return toast.error("GPS indisponível neste navegador.");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const loc = { lat: p.coords.latitude, lng: p.coords.longitude, heading: p.coords.heading || 0 };
        setMyLoc(loc);
        flyTo(map, { center: loc, zoom: 16.5 }, 1100);
      },
      (e) => toast.error(e.code === 1 ? "Permissão de localização negada." : "Não foi possível obter sua localização."),
      { enableHighAccuracy: true, timeout: 15000 }
    );
    return undefined;
  };

  const navOverview = () => {
    setFollow(false);
    const pts = session.legPath ? [...session.legPath.points] : [base];
    if (session.nav) pts.push(session.nav.display);
    flyTo(map, cameraForPoints(map, pts, { top: 200, right: 80, bottom: 230, left: 80 }), 1300);
  };

  const startNav = (key) => {
    setSelectedId(null);
    setSnap("peek");
    session.start(key);
  };

  const panel = (
    <PlannerPanel planner={planner} base={base} selectedId={selectedId} setSelectedId={setSelectedId}
      onStartNav={startNav} gpsMode={session.gpsMode} setGpsMode={session.setGpsMode}
      header={isDesktop ? <AppHeader /> : null} />
  );

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#0B0F17]" data-testid="map-workspace">
      <MapCanvas config={config} onReady={setMap} />

      <AnimatePresence>
        {!session.active && isDesktop && sidebarOpen && (
          <motion.aside key="sb" initial={{ x: -440, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -440, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 220 }}
            className="absolute left-4 top-4 bottom-4 w-[420px] z-20 rf-glass rounded-3xl overflow-y-auto p-5 rf-scroll" data-testid="desktop-sidebar">
            {panel}
          </motion.aside>
        )}
      </AnimatePresence>
      {!session.active && isDesktop && (
        <button onClick={() => setSidebarOpen(!sidebarOpen)} data-testid="sidebar-toggle-button"
          className="absolute top-8 z-20 rf-ctl transition-[left] duration-300" style={{ left: sidebarOpen ? 448 : 16 }} aria-label="Painel">
          {sidebarOpen ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
        </button>
      )}

      {!session.active && !isDesktop && (
        <>
          <div className="absolute top-3 left-3 right-16 z-20 rf-glass rounded-2xl px-3 py-2"><AppHeader /></div>
          <MobileSheet snap={snap} setSnap={setSnap} peek={<Peek planner={planner} onStart={() => startNav()} />}>{panel}</MobileSheet>
        </>
      )}

      <MapControls map={map} satellite={satellite} setSatellite={setSatellite} traffic={traffic} setTraffic={setTraffic}
        onRecenter={recenter} following={follow && session.active}
        className={`absolute z-20 ${session.active ? "right-3 sm:right-5 top-[38%]" : isDesktop ? "right-5 bottom-8" : "right-3 top-3"}`} />

      <AnimatePresence>
        {session.active && <NavigationHUD session={session} following={follow} onOverview={navOverview} onRecenter={recenter} />}
      </AnimatePresence>
    </div>
  );
}

export default function MapApp() {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    api.get("/config").then((r) => setConfig(r.data)).catch((e) => setError(apiError(e)));
  }, []);
  if (error) return <FullState title="Não foi possível carregar" msg={error} testid="config-error" />;
  if (!config) return <div className="h-[100dvh] grid place-items-center bg-[#0B0F17]" data-testid="config-loading"><div className="rf-spinner" /></div>;
  if (!config.maps_api_key) return <FullState title="Chave do Google Maps ausente" msg="Configure a chave GOOGLE_MAPS_API_KEY no servidor para ativar o mapa." testid="missing-key" />;
  if (!config.base) return <FullState title="Base operacional sem coordenadas" msg={config.base_error || "Não foi possível geocodificar o endereço da base."} testid="base-error" />;
  return <Workspace config={config} />;
}
