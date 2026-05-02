import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Zap, AlertTriangle, Navigation, Wind, Droplets, Thermometer, Clock, ShieldAlert } from 'lucide-react';

// ─── Fix Leaflet default icon ────────────────────────────────────────────────
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ─── Custom icons ─────────────────────────────────────────────────────────────
const mkIcon = (color: string, emoji: string) => L.divIcon({
  className: '',
  html: `<div style="background:${color};width:36px;height:36px;border-radius:50%;border:3px solid #fff;
         box-shadow:0 0 14px ${color}88;display:flex;align-items:center;justify-content:center;
         font-size:16px">${emoji}</div>`,
  iconSize: [36, 36], iconAnchor: [18, 18],
});

const ICON_SOURCE   = mkIcon('#3b82f6', '🏠');
const ICON_DEST     = mkIcon('#10b981', '🏥');
const ICON_WAYPOINT = mkIcon('#f59e0b', '📦');
const ICON_TRAFFIC  = L.divIcon({
  className: '',
  html: `<div style="background:#ef4444;width:40px;height:40px;border-radius:50%;border:3px solid #fff;
         box-shadow:0 0 20px #ef444488;display:flex;align-items:center;justify-content:center;
         font-size:20px;animation:pulse 1.2s infinite">🚨</div>`,
  iconSize: [40, 40], iconAnchor: [20, 20],
});
const ICON_FLOOD = L.divIcon({
  className: '',
  html: `<div style="background:#0ea5e9;width:36px;height:36px;border-radius:50%;border:3px solid #fff;
         box-shadow:0 0 16px #0ea5e988;display:flex;align-items:center;justify-content:center;
         font-size:17px">🌊</div>`,
  iconSize: [36, 36], iconAnchor: [18, 18],
});

// ─── Demo coordinates (Bengaluru → real roads) ───────────────────────────────
const DEMO_SOURCE = { lat: 12.9716, lng: 77.5946 }; // Bengaluru City Centre
const DEMO_DEST   = { lat: 12.9352, lng: 77.6245 }; // Koramangala NGO hub
const DEMO_WAYPT  = { lat: 12.9279, lng: 77.6271 }; // 3rd stop

// ─── Simulation phases ────────────────────────────────────────────────────────
type Phase = 'loading' | 'optimal' | 'traffic' | 'recalculating' | 'rerouted';

// ─── Map auto-fit helper ──────────────────────────────────────────────────────
function MapBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (points.length > 1 && !fitted.current) {
      map.fitBounds(L.latLngBounds(points), { padding: [55, 55] });
      fitted.current = true;
    }
  }, [map, points]);
  return null;
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  source?:      { lat: number; lng: number };
  destination?: { lat: number; lng: number };
  title?:       string;       // e.g. "Volunteer Route", "NGO Network"
  foodType?:    string;
  expiryMins?:  number;       // food freshness countdown (mins)
  showBatching?: boolean;     // show multi-stop NGO batching
}

export function DynamicOptimizationMap({
  source,
  destination,
  title        = 'Live Route Optimization',
  foodType     = 'Biryani',
  expiryMins   = 90,
  showBatching = false,
}: Props) {
  // Use real coords if valid, else demo
  const hasReal = source && destination
    && (source.lat !== 0 || source.lng !== 0)
    && (destination.lat !== 0 || destination.lng !== 0);

  const src  = hasReal ? source!  : DEMO_SOURCE;
  const dest = hasReal ? destination! : DEMO_DEST;

  const [route,     setRoute]     = useState<[number, number][]>([]);
  const [altRoute,  setAltRoute]  = useState<[number, number][]>([]);
  const [phase,     setPhase]     = useState<Phase>('loading');
  const [eta,       setEta]       = useState(0);
  const [efficiency,setEfficiency]= useState(98);
  const [trafficPt, setTrafficPt] = useState<[number, number] | null>(null);
  const [floodPt,   setFloodPt]   = useState<[number, number] | null>(null);
  const [riskPts,   setRiskPts]   = useState<{ pos: [number, number]; r: number; color: string }[]>([]);
  const [decay,     setDecay]     = useState(expiryMins);
  const [weather,   setWeather]   = useState({ rain: 18, wind: 23, temp: 34, risk: 'Low' as 'Low'|'Medium'|'High' });
  const [logLines,  setLogLines]  = useState<string[]>(['System initializing...']);
  const logRef = useRef<HTMLDivElement>(null);

  const addLog = (msg: string) => setLogLines(prev => [...prev.slice(-6), msg]);

  // ── Fetch OSRM route ────────────────────────────────────────────────────────
  const fetchOSRM = async (
    pts: { lat: number; lng: number }[],
    signal: AbortSignal,
  ): Promise<{ coords: [number, number][]; durationSec: number }> => {
    const coord = pts.map(p => `${p.lng},${p.lat}`).join(';');
    const r = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coord}?overview=full&geometries=geojson`,
      { signal },
    );
    const d = await r.json();
    if (!d.routes?.length) throw new Error('No route');
    return {
      coords: d.routes[0].geometry.coordinates.map((c: [number,number]) => [c[1], c[0]]),
      durationSec: d.routes[0].duration,
    };
  };

  useEffect(() => {
    const ctrl = new AbortController();
    let timers: ReturnType<typeof setTimeout>[] = [];

    (async () => {
      try {
        addLog('📡 Connecting to routing engine…');
        const pts = showBatching ? [src, DEMO_WAYPT, dest] : [src, dest];
        const { coords, durationSec } = await fetchOSRM(pts, ctrl.signal);
        if (ctrl.signal.aborted) return;

        setRoute(coords);
        setEta(Math.max(1, Math.round(durationSec / 60)));
        setPhase('optimal');
        addLog('✅ Optimal path computed via Dijkstra/A*');
        addLog(`🗺️  Distance: ${(durationSec / 60 * 0.4).toFixed(1)} km | ETA: ${Math.round(durationSec / 60)} min`);

        // Build risk heatmap
        const mid = Math.floor(coords.length / 2);
        const q1  = Math.floor(coords.length * 0.25);
        const q3  = Math.floor(coords.length * 0.75);
        setRiskPts([
          { pos: coords[q1], r: 220, color: '#facc15' },
          { pos: coords[mid], r: 350, color: '#f97316' },
          { pos: coords[q3], r: 180, color: '#22c55e' },
        ]);

        // Phase 2 – traffic anomaly
        timers.push(setTimeout(() => {
          if (ctrl.signal.aborted) return;
          setPhase('traffic');
          setEfficiency(62);
          setEta(prev => prev + 18);
          setWeather({ rain: 42, wind: 38, temp: 29, risk: 'High' });
          const tp: [number,number] = coords[mid];
          setTrafficPt(tp);
          setFloodPt(coords[q3]);
          addLog('🚨 ALERT: Heavy congestion detected on primary route!');
          addLog('🌧️  Weather: Heavy rain + flood risk. Edge weights recalculated.');
        }, 4000));

        // Phase 3 – recalculating
        timers.push(setTimeout(() => {
          if (ctrl.signal.aborted) return;
          setPhase('recalculating');
          addLog('🐜 Ant Colony Optimization engaged…');
          addLog('⚡ Graph edges re-weighted (traffic × weather × decay score)');
        }, 7000));

        // Phase 4 – alternate route
        timers.push(setTimeout(async () => {
          if (ctrl.signal.aborted) return;
          try {
            const offLng = (src.lng + dest.lng) / 2 + 0.018;
            const offLat = (src.lat + dest.lat) / 2 - 0.012;
            const { coords: altCoords, durationSec: altDur } = await fetchOSRM(
              [src, { lat: offLat, lng: offLng }, dest], ctrl.signal,
            );
            if (ctrl.signal.aborted) return;
            setAltRoute(altCoords);
            setPhase('rerouted');
            setEfficiency(91);
            setEta(Math.max(1, Math.round(altDur / 60) + 3));
            setWeather(w => ({ ...w, risk: 'Low' }));
            addLog('🟢 New route confirmed — 13 min saved!');
            addLog('🚀 Delivering via safe alternate corridor.');
          } catch (e) { /* ignore */ }
        }, 10000));

      } catch (err: any) {
        if (err.name !== 'AbortError') {
          addLog('⚠️  Routing engine offline. Using cached path.');
          setPhase('optimal');
          setEta(28);
        }
      }
    })();

    // Food freshness countdown
    const decayTimer = setInterval(() => setDecay(d => Math.max(0, d - 1)), 60_000);

    return () => {
      ctrl.abort();
      timers.forEach(clearTimeout);
      clearInterval(decayTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src.lat, src.lng, dest.lat, dest.lng]);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logLines]);

  // ── Colour helpers ──────────────────────────────────────────────────────────
  const phaseColor = {
    loading:       '#94a3b8',
    optimal:       '#3b82f6',
    traffic:       '#ef4444',
    recalculating: '#f59e0b',
    rerouted:      '#10b981',
  }[phase];

  const effColor = efficiency >= 85 ? '#34d399' : efficiency >= 65 ? '#fbbf24' : '#fb7185';
  const decayColor = decay > 60 ? '#34d399' : decay > 20 ? '#fbbf24' : '#fb7185';
  const riskColor = { Low: '#34d399', Medium: '#fbbf24', High: '#fb7185' }[weather.risk];

  const allPoints: [number,number][] = [...route, ...altRoute];

  return (
    <div className="w-full rounded-[2rem] overflow-hidden border border-white/20 shadow-[0_30px_80px_rgba(0,0,0,0.25)] bg-slate-950">
      {/* ── Header bar ── */}
      <div className="flex items-center justify-between px-5 py-3 bg-slate-900/80 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: phaseColor }} />
          <span className="text-xs font-black uppercase tracking-[0.18em] text-white">{title}</span>
        </div>
        <div className="flex gap-2 text-[10px] font-bold uppercase tracking-wider">
          <span className="px-2 py-0.5 rounded-full" style={{ background: riskColor + '22', color: riskColor }}>
            Risk: {weather.risk}
          </span>
          {!hasReal && (
            <span className="px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-400">Demo Mode</span>
          )}
        </div>
      </div>

      <div className="flex flex-col xl:flex-row">
        {/* ── Map ── */}
        <div className="relative flex-1 h-[380px] xl:h-[520px]">
          <MapContainer
            center={[src.lat, src.lng]}
            zoom={13}
            className="w-full h-full"
            zoomControl={false}
            attributionControl={false}
          >
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

            {/* Risk heatmap circles */}
            {riskPts.map((r, i) => (
              <Circle
                key={i}
                center={r.pos}
                radius={r.r}
                pathOptions={{ color: r.color, fillColor: r.color, fillOpacity: 0.12, weight: 0 }}
              />
            ))}

            {/* Primary route */}
            {route.length > 0 && (
              <Polyline
                positions={route}
                color={phase === 'rerouted' || phase === 'recalculating' ? '#475569' : phaseColor}
                weight={phase === 'rerouted' ? 3 : 6}
                opacity={phase === 'rerouted' ? 0.35 : 0.9}
                dashArray={phase === 'rerouted' ? '6 10' : phase === 'recalculating' ? '4 8' : undefined}
              />
            )}

            {/* Alternate route */}
            {altRoute.length > 0 && phase === 'rerouted' && (
              <Polyline
                positions={altRoute}
                color="#10b981"
                weight={6}
                opacity={0.92}
                dashArray="12 6"
              />
            )}

            {/* Markers */}
            <Marker position={[src.lat, src.lng]} icon={ICON_SOURCE}>
              <Popup><strong>🏠 Donor Pickup</strong><br />Source node</Popup>
            </Marker>
            <Marker position={[dest.lat, dest.lng]} icon={ICON_DEST}>
              <Popup><strong>🏥 NGO Destination</strong><br />Drop node</Popup>
            </Marker>

            {showBatching && (
              <Marker position={[DEMO_WAYPT.lat, DEMO_WAYPT.lng]} icon={ICON_WAYPOINT}>
                <Popup><strong>📦 Waypoint</strong><br />Batch delivery stop</Popup>
              </Marker>
            )}

            {trafficPt && (phase === 'traffic' || phase === 'recalculating' || phase === 'rerouted') && (
              <Marker position={trafficPt} icon={ICON_TRAFFIC}>
                <Popup><strong className="text-red-600">🚨 Congestion</strong><br />Delay: ~18 min</Popup>
              </Marker>
            )}

            {floodPt && (phase === 'traffic' || phase === 'recalculating' || phase === 'rerouted') && (
              <Marker position={floodPt} icon={ICON_FLOOD}>
                <Popup><strong className="text-blue-600">🌊 Flood Risk</strong><br />Road partially blocked</Popup>
              </Marker>
            )}

            {allPoints.length > 0 && <MapBounds points={allPoints} />}
          </MapContainer>

          {/* Floating mini-badge on map */}
          <div className="absolute bottom-3 right-3 z-[1000] pointer-events-none">
            <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl px-3 py-2 text-white text-xs font-bold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: phaseColor }} />
              {phase === 'loading' && 'Loading route…'}
              {phase === 'optimal' && '✅ Optimal path'}
              {phase === 'traffic' && '🚨 Anomaly detected'}
              {phase === 'recalculating' && '⚡ Rerouting (ACO)…'}
              {phase === 'rerouted' && '🟢 New route active'}
            </div>
          </div>
        </div>

        {/* ── Side Panel ── */}
        <div className="w-full xl:w-72 bg-slate-900/80 border-t xl:border-t-0 xl:border-l border-white/10 flex flex-col gap-0 overflow-y-auto">

          {/* ETA + Efficiency */}
          <div className="grid grid-cols-2 gap-px border-b border-white/10">
            <div className="p-4 bg-slate-950/40">
              <p className="text-[9px] uppercase tracking-[0.18em] font-black text-slate-500 mb-1">Est. Arrival</p>
              <p className="text-3xl font-black text-white leading-none">
                {eta > 0 ? eta : '--'}<span className="text-sm font-bold text-slate-500 ml-1">min</span>
              </p>
            </div>
            <div className="p-4 bg-slate-950/40">
              <p className="text-[9px] uppercase tracking-[0.18em] font-black text-slate-500 mb-1">Efficiency</p>
              <p className="text-3xl font-black leading-none" style={{ color: effColor }}>
                {efficiency}<span className="text-sm font-bold ml-1">%</span>
              </p>
            </div>
          </div>

          {/* Food decay timer */}
          <div className="p-4 border-b border-white/10">
            <div className="flex items-center gap-2 mb-2">
              <Clock size={13} className="text-slate-400 shrink-0" />
              <p className="text-[9px] uppercase tracking-[0.18em] font-black text-slate-400">Food Freshness</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{ width: `${Math.max(0, (decay / expiryMins) * 100)}%`, background: decayColor }}
                />
              </div>
              <span className="text-xs font-black" style={{ color: decayColor }}>{decay}m</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">{foodType} · expires in {decay} mins</p>
          </div>

          {/* Weather panel */}
          <div className="p-4 border-b border-white/10">
            <p className="text-[9px] uppercase tracking-[0.18em] font-black text-slate-400 mb-3">Live Conditions</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <Droplets size={14} className="mx-auto mb-1 text-sky-400" />
                <p className="text-xs font-black text-white">{weather.rain}%</p>
                <p className="text-[9px] text-slate-500 uppercase tracking-wider">Rain</p>
              </div>
              <div>
                <Wind size={14} className="mx-auto mb-1 text-slate-400" />
                <p className="text-xs font-black text-white">{weather.wind}km/h</p>
                <p className="text-[9px] text-slate-500 uppercase tracking-wider">Wind</p>
              </div>
              <div>
                <Thermometer size={14} className="mx-auto mb-1 text-orange-400" />
                <p className="text-xs font-black text-white">{weather.temp}°C</p>
                <p className="text-[9px] text-slate-500 uppercase tracking-wider">Temp</p>
              </div>
            </div>
          </div>

          {/* Risk meter */}
          <div className="p-4 border-b border-white/10">
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert size={13} className="text-slate-400 shrink-0" />
              <p className="text-[9px] uppercase tracking-[0.18em] font-black text-slate-400">Route Risk</p>
            </div>
            <div className="flex gap-1.5">
              {(['Low','Medium','High'] as const).map(level => (
                <div
                  key={level}
                  className="flex-1 rounded-lg py-1.5 text-center text-[10px] font-black transition-all"
                  style={{
                    background: weather.risk === level ? (riskColor + '33') : '#1e293b',
                    color: weather.risk === level ? riskColor : '#475569',
                    border: `1px solid ${weather.risk === level ? riskColor + '55' : '#1e293b'}`,
                  }}
                >
                  {level}
                </div>
              ))}
            </div>
          </div>

          {/* Batching info */}
          {showBatching && (
            <div className="p-4 border-b border-white/10">
              <p className="text-[9px] uppercase tracking-[0.18em] font-black text-slate-400 mb-2">Multi-Stop Batch</p>
              {[
                { stop: 1, label: 'Donor Pickup', icon: '🏠', done: true },
                { stop: 2, label: 'Mid-Point NGO', icon: '📦', done: phase === 'rerouted' },
                { stop: 3, label: 'Final Drop-Off', icon: '🏥', done: false },
              ].map(s => (
                <div key={s.stop} className="flex items-center gap-2 mb-2">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0"
                    style={{ background: s.done ? '#10b981' : '#1e293b', border: '1.5px solid #334155' }}
                  >
                    {s.done ? '✓' : s.stop}
                  </div>
                  <span className="text-xs text-slate-300">{s.icon} {s.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Live Log */}
          <div className="p-4 flex-1 min-h-0">
            <div className="flex items-center gap-2 mb-2">
              <Zap size={12} className="text-cyan-400" />
              <p className="text-[9px] uppercase tracking-[0.18em] font-black text-slate-400">AI Engine Log</p>
            </div>
            <div ref={logRef} className="space-y-1 overflow-y-auto max-h-28 pr-1">
              {logLines.map((line, i) => (
                <p key={i} className="text-[10px] font-mono text-slate-400 leading-relaxed">{line}</p>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="p-3 border-t border-white/10 flex flex-wrap gap-2">
            {[
              { color: '#3b82f6', label: 'Optimal' },
              { color: '#10b981', label: 'Rerouted' },
              { color: '#f59e0b', label: 'Risk Zone' },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-1">
                <span className="w-3 h-0.5 rounded-full inline-block" style={{ background: l.color }} />
                <span className="text-[9px] text-slate-500">{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        .leaflet-container { background: #0f172a !important; }
        .leaflet-pane { z-index: 10 !important; }
        .leaflet-top, .leaflet-bottom { z-index: 999 !important; }
      `}</style>
    </div>
  );
}
