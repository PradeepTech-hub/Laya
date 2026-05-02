import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import DonorDashboard from './components/DonorDashboard';
import L from 'leaflet';
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock3,
  LayoutDashboard,
  LogOut,
  LocateFixed,
  MapPin,
  Menu,
  Package,
  Plus,
  Route,
  ShieldCheck,
  Sparkles,
  Truck,
  UserRound,
  X,
  Zap,
} from 'lucide-react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup } from 'react-leaflet';
import { DynamicOptimizationMap } from './components/DynamicOptimizationMap';
import {
  isFirebaseConfigured,
  signUpWithEmail,
  signInWithEmail as fbSignInWithEmail,
  signOut as fbSignOut,
  onAuthStateChanged as fbOnAuthStateChanged,
  getUserProfile as fbGetUserProfile,
  setUserProfile as fbSetUserProfile,
  signInWithGoogle,
  listenToNeeds,
  listenToDonations,
  listenToDeliveries,
  createNeed,
  createDonation as createDonationRecord,
  createDelivery,
  acceptDeliveryAssignment,
  updateDonation,
  updateNeed,
  updateDelivery,
  startMatchingEngine,
  isInOfflineMode,
  type NeedRecord as FirestoreNeedRecord,
  type DonationRecord as FirestoreDonationRecord,
  type DeliveryRecord as FirestoreDeliveryRecord,
} from './lib/firebase';
import { getRouteDistanceAndTime, type RouteResult } from './lib/routing';

type Role = 'customer' | 'delivery-agent';
type AuthMode = 'signin' | 'signup';
type AppPage = 'landing' | 'auth' | 'app';
type DashboardView = 'overview' | 'requests' | 'needs' | 'tracking' | 'history' | 'profile';

type Account = {
  name: string;
  email: string;
  password: string;
  role: Role;
};

type Session = {
  uid: string;
  name: string;
  email: string;
  role: Role;
  uiRole: UiRole;
  displayRoleLabel?: string;
};

type UiRole = 'donor' | 'ngo' | 'volunteer';

type NeedUrgency = 'high' | 'medium' | 'low';
type MealType = 'veg' | 'non-veg' | 'any';
type FoodCategory = 'prepared-food' | 'raw-food' | 'packed-food' | 'any';
type DeliveryStatus = 'pending' | 'assigned' | 'accepted' | 'picked' | 'in_transit' | 'delivered' | 'cancelled';
type Coordinates = { lat: number; lng: number };

type NeedRecord = FirestoreNeedRecord;
type DonationRecord = FirestoreDonationRecord;
type DeliveryRecord = FirestoreDeliveryRecord;

type DonationFormState = {
  foodType: string;
  mealType: MealType;
  category: FoodCategory;
  quantity: string;
  pickupLocation: string;
  pickupLat: string;
  pickupLng: string;
  expiryTime: 'within-1-hour' | 'within-2-hours' | 'within-4-hours' | 'today';
  notificationEnabled: boolean;
  notes: string;
};

type NeedFormState = {
  address: string;
  lat: string;
  lng: string;
  peopleCount: string;
  foodType: string;
  mealType: MealType;
  category: FoodCategory;
  urgency: NeedUrgency;
  requiredBefore: string;
};

type LocationPickerMapProps = {
  selected: Coordinates | null;
  onSelect: (coords: Coordinates) => void;
};

type MetricCardProps = {
  icon: ReactNode;
  value: string;
  label: string;
  accent: string;
};

type AuthPageProps = {
  mode: AuthMode;
  role: Role;
  setMode: (mode: AuthMode) => void;
  setRole: (role: Role) => void;
  form: { name: string; email: string; password: string };
  setForm: (form: { name: string; email: string; password: string }) => void;
  notice: string | null;
  setNotice: (notice: string | null) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>, uiRole: UiRole) => void;
  onGoogleSignIn: (uiRole: UiRole) => Promise<void>;
  onBack: () => void;
};

type LandingPageProps = {
  onStart: (mode: AuthMode, role: Role) => void;
};

type AppShellProps = {
  session: Session;
  dashboardView: DashboardView;
  setDashboardView: (view: DashboardView) => void;
  onLogout: () => void;
  needs: NeedRecord[];
  donations: DonationRecord[];
  deliveries: DeliveryRecord[];
};

const ACCOUNTS_KEY = 'laya.accounts.v1';
const SESSION_KEY = 'laya.session.v1';
const PROFILE_CACHE_KEY = 'laya.profile-cache.v1';
const GOOGLE_AUTH_PENDING_KEY = 'laya.google-auth-pending.v1';

const DEFAULT_ACCOUNTS: Account[] = [
  { name: 'Demo Donor', email: 'customer@laya.com', password: 'customer123', role: 'customer' },
  { name: 'Demo NGO', email: 'ngo@laya.com', password: 'ngo123', role: 'customer' },
  { name: 'Demo Volunteer', email: 'agent@laya.com', password: 'agent123', role: 'delivery-agent' },
];

const ROLE_META: Record<Role, { label: string; shortLabel: string; accent: string; description: string }> = {
  customer: {
    label: 'Donor',
    shortLabel: 'Donor portal',
    accent: 'bg-cyan-50 text-cyan-700 border-cyan-100',
    description: 'Post surplus food, coordinate pickups, and track impact.',
  },
  'delivery-agent': {
    label: 'Volunteer',
    shortLabel: 'Volunteer console',
    accent: 'bg-amber-50 text-amber-700 border-amber-100',
    description: 'Pick up and deliver donations to partner NGOs.',
  },
};

const UI_ROLE_LABELS: Record<UiRole, string> = {
  donor: 'Donor',
  ngo: 'NGO',
  volunteer: 'Volunteer',
};

const NAV_ITEMS: Record<Role, { key: DashboardView; label: string; icon: ReactNode }[]> = {
  customer: [
    { key: 'overview', label: 'Overview', icon: <LayoutDashboard size={16} /> },
    { key: 'requests', label: 'Food Donations', icon: <ClipboardList size={16} /> },
    { key: 'needs', label: 'Live Needs', icon: <MapPin size={16} /> },
    { key: 'tracking', label: 'Delivery Tracking', icon: <Route size={16} /> },
    { key: 'profile', label: 'Profile', icon: <UserRound size={16} /> },
  ],
  'delivery-agent': [
    { key: 'overview', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
    { key: 'requests', label: 'Pickup Queue', icon: <ClipboardList size={16} /> },
    { key: 'tracking', label: 'In Transit', icon: <Route size={16} /> },
    { key: 'history', label: 'Completed Runs', icon: <CheckCircle2 size={16} /> },
    { key: 'profile', label: 'Profile', icon: <UserRound size={16} /> },
  ],
};

const UI_NAV_ITEMS: Record<UiRole, { key: DashboardView; label: string; icon: ReactNode }[]> = {
  donor: NAV_ITEMS.customer,
  ngo: [
    { key: 'overview', label: 'Overview', icon: <LayoutDashboard size={16} /> },
    { key: 'requests', label: 'Intake', icon: <ClipboardList size={16} /> },
    { key: 'needs', label: 'Live Needs', icon: <MapPin size={16} /> },
    { key: 'tracking', label: 'Network', icon: <Route size={16} /> },
    { key: 'profile', label: 'Profile', icon: <UserRound size={16} /> },
  ],
  volunteer: NAV_ITEMS['delivery-agent'],
};

const DELIVERY_STATUS_STEPS: Array<'pending' | 'accepted' | 'picked' | 'in_transit' | 'delivered'> = ['pending', 'accepted', 'picked', 'in_transit', 'delivered'];

const EMPTY_DELIVERIES: DeliveryRecord[] = [];
const EMPTY_DONATIONS: DonationRecord[] = [];
const EMPTY_NEEDS: NeedRecord[] = [];

const MEAL_TYPE_OPTIONS: { value: MealType; label: string }[] = [
  { value: 'veg', label: 'Veg' },
  { value: 'non-veg', label: 'Non-Veg' },
  { value: 'any', label: 'Any' },
];

const CATEGORY_OPTIONS: { value: FoodCategory; label: string }[] = [
  { value: 'prepared-food', label: 'Prepared Food' },
  { value: 'raw-food', label: 'Raw Food' },
  { value: 'packed-food', label: 'Packed Food' },
  { value: 'any', label: 'Any' },
];

const EXPIRY_TIME_OPTIONS: { value: 'within-1-hour' | 'within-2-hours' | 'within-4-hours' | 'today'; label: string }[] = [
  { value: 'within-1-hour', label: 'Within 1 hour' },
  { value: 'within-2-hours', label: 'Within 2 hours' },
  { value: 'within-4-hours', label: 'Within 4 hours' },
  { value: 'today', label: 'Today' },
];

const AGENT_METRICS = [
  { icon: <Truck size={22} className="text-cyan-600" />, value: '7', label: 'Jobs assigned today', accent: 'bg-cyan-50' },
  { icon: <Clock3 size={22} className="text-amber-600" />, value: '91%', label: 'On-time completion', accent: 'bg-amber-50' },
  { icon: <BadgeCheck size={22} className="text-emerald-600" />, value: '4.9', label: 'Driver rating', accent: 'bg-emerald-50' },
];

const NGO_METRICS = [
  { icon: <Building2 size={22} className="text-cyan-600" />, value: '18', label: 'Partner groups', accent: 'bg-cyan-50' },
  { icon: <ClipboardList size={22} className="text-amber-600" />, value: '42', label: 'Active intakes', accent: 'bg-amber-50' },
  { icon: <CheckCircle2 size={22} className="text-emerald-600" />, value: '96%', label: 'Matched donations', accent: 'bg-emerald-50' },
];

const ROUTE_STEPS = ['Pickup Confirmed', 'In Transit', 'Delivered to Need Location', 'Completed'];

function getInitialAccounts() {
  if (typeof window === 'undefined') {
    return DEFAULT_ACCOUNTS;
  }

  const raw = window.localStorage.getItem(ACCOUNTS_KEY);

  if (!raw) {
    window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(DEFAULT_ACCOUNTS));
    return DEFAULT_ACCOUNTS;
  }

  try {
    const parsed = JSON.parse(raw) as Account[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_ACCOUNTS;
  } catch {
    window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(DEFAULT_ACCOUNTS));
    return DEFAULT_ACCOUNTS;
  }
}

function getInitialSession() {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(SESSION_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

function getProfileCache() {
  if (typeof window === 'undefined') {
    return {} as Record<string, { name?: string; displayRoleLabel?: string; uiRole?: UiRole }>;
  }

  const raw = window.localStorage.getItem(PROFILE_CACHE_KEY);

  if (!raw) {
    return {} as Record<string, { name?: string; displayRoleLabel?: string; uiRole?: UiRole }>;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, { name?: string; displayRoleLabel?: string; uiRole?: UiRole }>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {} as Record<string, { name?: string; displayRoleLabel?: string; uiRole?: UiRole }>;
  }
}

function setProfileCache(uid: string, profile: { name?: string; displayRoleLabel?: string; uiRole?: UiRole }) {
  if (typeof window === 'undefined') {
    return;
  }

  const current = getProfileCache();
  current[uid] = profile;
  window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(current));
}

function formatRole(role: Role) {
  return ROLE_META[role].label;
}

function formatUiRole(role: UiRole) {
  return UI_ROLE_LABELS[role];
}

function getDisplayRoleLabel(session: Session) {
  return session.displayRoleLabel || ROLE_META[session.role].label;
}

function getUrgencyScore(urgency: NeedUrgency) {
  return urgency === 'high' ? 0 : urgency === 'medium' ? 1 : 2;
}

function toCoordinates(lat: string, lng: string): Coordinates | null {
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);

  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
    return null;
  }

  return { lat: parsedLat, lng: parsedLng };
}

function calculateDistanceKm(a: Coordinates | null, b: Coordinates | null) {
  if (!a || !b) {
    return Number.POSITIVE_INFINITY;
  }

  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const latitudeA = toRadians(a.lat);
  const latitudeB = toRadians(b.lat);

  const haversine =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function openGoogleMapsRoute(destination: Coordinates) {
  if (typeof window === 'undefined') {
    return;
  }

  const url = `https://www.google.com/maps/dir/?api=1&destination=${destination.lat},${destination.lng}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function sortNeedsForDonation(openNeeds: NeedRecord[], donorLocation: Coordinates | null) {
  return [...openNeeds].sort((left, right) => {
    const urgencyDelta = getUrgencyScore(left.urgency) - getUrgencyScore(right.urgency);
    if (urgencyDelta !== 0) {
      return urgencyDelta;
    }

    const leftDistance = calculateDistanceKm(donorLocation, { lat: left.location.lat, lng: left.location.lng });
    const rightDistance = calculateDistanceKm(donorLocation, { lat: right.location.lat, lng: right.location.lng });
    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }

    return left.requiredBefore - right.requiredBefore;
  });
}

function getTimeUrgencyScore(requiredBefore: number) {
  const hoursUntilNeed = Math.max((requiredBefore - Date.now()) / (1000 * 60 * 60), 0);
  return Math.max(0, 100 - hoursUntilNeed * 10);
}

function getUrgencyWeight(urgency: NeedUrgency) {
  return urgency === 'high' ? 300 : urgency === 'medium' ? 180 : 90;
}

function convertExpiryTimeToTimestamp(expiryTimeValue: string): number {
  const now = Date.now();
  switch (expiryTimeValue) {
    case 'within-1-hour':
      return now + 1 * 60 * 60 * 1000;
    case 'within-2-hours':
      return now + 2 * 60 * 60 * 1000;
    case 'within-4-hours':
      return now + 4 * 60 * 60 * 1000;
    case 'today': {
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      return endOfToday.getTime();
    }
    default:
      return now + 2 * 60 * 60 * 1000;
  }
}

function isDeliveryPossibleBeforeExpiry(expiryTime: number, donorDistance: number): boolean {
  const estimatedDeliveryMinutes = (donorDistance / 20) * 60;
  const timeUntilExpiry = Math.max((expiryTime - Date.now()) / (1000 * 60), 0);
  return timeUntilExpiry > estimatedDeliveryMinutes;
}

function isNeedCompatible(need: NeedRecord, mealType: MealType, category: FoodCategory) {
  const needMealType = (need.mealType as MealType | undefined) || 'any';
  const needCategory = (need.category as FoodCategory | undefined) || 'any';

  const mealTypeMatches = mealType === 'any' || needMealType === 'any' || needMealType === mealType;
  const categoryMatches = category === 'any' || needCategory === 'any' || needCategory === category;

  return mealTypeMatches && categoryMatches;
}

function selectBestNeedByScore(openNeeds: NeedRecord[], donorLocation: Coordinates | null, mealType: MealType, category: FoodCategory, expiryTime: number) {
  const compatibleNeeds = openNeeds.filter((need) => {
    if (!isNeedCompatible(need, mealType, category)) {
      return false;
    }
    const distanceKm = calculateDistanceKm(donorLocation, { lat: need.location.lat, lng: need.location.lng });
    return isDeliveryPossibleBeforeExpiry(expiryTime, distanceKm);
  });

  if (compatibleNeeds.length === 0) {
    return null;
  }

  const scoredNeeds = compatibleNeeds.map((need) => {
    const distanceKm = calculateDistanceKm(donorLocation, { lat: need.location.lat, lng: need.location.lng });
    const score = getUrgencyWeight(need.urgency) + getDistanceScore(distanceKm) + getTimeUrgencyScore(need.requiredBefore);
    return { need, score };
  });

  scoredNeeds.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return left.need.requiredBefore - right.need.requiredBefore;
  });

  return scoredNeeds[0].need;
}

function LocationPickerMap({ selected, onSelect }: LocationPickerMapProps) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) {
      return;
    }

    const map = L.map(mapElementRef.current).setView([12.9716, 77.5946], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    map.on('click', (event: L.LeafletMouseEvent) => {
      onSelectRef.current({ lat: event.latlng.lat, lng: event.latlng.lng });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const center = selected || { lat: 12.9716, lng: 77.5946 };
    map.setView([center.lat, center.lng], map.getZoom(), { animate: true });

    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }

    if (selected) {
      markerRef.current = L.circleMarker([selected.lat, selected.lng], {
        radius: 9,
        color: '#0369a1',
        fillColor: '#0891b2',
        fillOpacity: 0.8,
      }).addTo(map);
    }
  }, [selected]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
      <div ref={mapElementRef} className="h-64 w-full" />
      <div className="border-t border-slate-200 bg-white px-4 py-2 text-xs text-slate-500">Click on the map to set the need location.</div>
    </div>
  );
}

function MetricCard({ icon, value, label, accent }: MetricCardProps) {
  return (
    <div className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl ${accent}`}>{icon}</div>
      <p className="text-3xl font-bold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{label}</p>
    </div>
  );
}

function SectionTitle({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-600">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-500 sm:text-base">{text}</p>
    </div>
  );
}

function LandingPage({ onStart }: LandingPageProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#F3D1C2] via-[#EADFD7] to-[#7FAFE0] text-[#333333]">
      {/* Subtle blurred wave layers for depth */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-white/20 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-blue-300/20 blur-[150px] pointer-events-none"></div>

      <style>{`
        @keyframes fadeInSlideUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes float {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-15px); }
          100% { transform: translateY(0px); }
        }
        .animate-fade-slide { animation: fadeInSlideUp 0.8s ease-out forwards; }
        .animate-fade-slide-delay-1 { animation-delay: 0.1s; opacity: 0; }
        .animate-fade-slide-delay-2 { animation-delay: 0.2s; opacity: 0; }
        .animate-fade-slide-delay-3 { animation-delay: 0.3s; opacity: 0; }
        .animate-float { animation: float 6s ease-in-out infinite; }
        
        .glass-btn-primary {
          background: rgba(255, 255, 255, 0.4);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.5);
          box-shadow: 0 8px 32px rgba(255, 165, 0, 0.15);
          transition: all 0.3s ease;
        }
        .glass-btn-primary:hover {
          background: rgba(255, 255, 255, 0.5);
          box-shadow: 0 8px 32px rgba(255, 165, 0, 0.3);
          transform: translateY(-2px);
        }
        
        .glass-btn-secondary {
          background: rgba(255, 255, 255, 0.2);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.3);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05);
          transition: all 0.3s ease;
        }
        .glass-btn-secondary:hover {
          background: rgba(255, 255, 255, 0.3);
          transform: translateY(-2px);
        }

        .glass-card {
          background: linear-gradient(180deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.1) 100%);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.3);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.05);
          transition: all 0.3s ease;
        }
        .glass-card:hover {
          transform: translateY(-8px);
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.08);
          background: linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.2) 100%);
        }
      `}</style>

      {/* Navigation */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 lg:px-12 backdrop-blur-md bg-white/30 border-b border-white/20 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#333333] text-[#F5F5DC] shadow-sm">
            <Sparkles size={24} />
          </div>
          <span className="text-2xl font-bold tracking-tight text-[#333333]">Laya</span>
        </div>
        <div className="flex items-center gap-6">
          <button
            onClick={() => onStart('signin', 'customer')}
            className="text-sm font-bold text-[#333333]/80 hover:text-[#333333] transition-colors"
          >
            Sign in
          </button>
          <button
            onClick={() => onStart('signup', 'customer')}
            className="glass-btn-primary rounded-full px-6 py-2.5 text-sm font-bold text-[#333333]"
          >
            Get Started
          </button>
        </div>
      </nav>

      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
          {/* Left Column */}
          <div className="animate-fade-slide animate-fade-slide-delay-1 pt-8 lg:pt-0">
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.1]">
              <span className="text-[#333333]">Reduce Food Waste.</span>
              <br />
              <span className="bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent">Feed Communities.</span>
            </h1>

            <p className="mt-8 text-lg leading-relaxed text-[#555555] max-w-xl font-medium">
              Laya connects donors, NGOs, and volunteers using AI to deliver food before it expires. Together, we reduce waste and nourish communities.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row gap-4">
              <button
                type="button"
                onClick={() => onStart('signup', 'customer')}
                className="glass-btn-primary inline-flex items-center justify-center gap-2 rounded-2xl px-8 py-4 text-base font-bold text-[#333333]"
              >
                <Package size={20} />
                Donate Food
              </button>
              <button
                type="button"
                onClick={() => onStart('signin', 'customer')}
                className="glass-btn-secondary inline-flex items-center justify-center gap-2 rounded-2xl px-8 py-4 text-base font-bold text-[#333333]"
              >
                Sign in
              </button>
            </div>
          </div>

          {/* Right Column - Image & Stats */}
          <div className="space-y-8 lg:pl-10">
            {/* Main Visual */}
            <div className="animate-fade-slide animate-fade-slide-delay-2">
              <div className="relative overflow-hidden rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] animate-float">
                {/* Subtle glass overlay on image */}
                <div className="absolute inset-0 bg-white/10 mix-blend-overlay pointer-events-none z-10"></div>
                <img 
                  src="https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80" 
                  alt="Happy children eating together" 
                  className="h-[400px] w-full object-cover sm:h-[500px]"
                />
              </div>
            </div>

            {/* Stats Bar */}
            <div className="grid grid-cols-3 gap-4">
              <div className="animate-fade-slide animate-fade-slide-delay-3 rounded-2xl bg-white/30 backdrop-blur-md border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.03)] p-4 text-center">
                <p className="text-xl sm:text-2xl font-bold text-[#333333]">12.5K</p>
                <p className="mt-1 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-blue-600">Meals Saved</p>
              </div>
              <div className="animate-fade-slide animate-fade-slide-delay-3 rounded-2xl bg-white/30 backdrop-blur-md border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.03)] p-4 text-center">
                <p className="text-xl sm:text-2xl font-bold text-[#333333]">847</p>
                <p className="mt-1 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-blue-600">Active Deliveries</p>
              </div>
              <div className="animate-fade-slide animate-fade-slide-delay-3 rounded-2xl bg-white/30 backdrop-blur-md border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.03)] p-4 text-center">
                <p className="text-xl sm:text-2xl font-bold text-[#333333]">156</p>
                <p className="mt-1 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-blue-600">NGOs Connected</p>
              </div>
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div className="mt-32 pb-32">
          <div className="animate-fade-slide animate-fade-slide-delay-3 text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-black text-[#333333] mb-6 tracking-tight">
              Stories of Hope: How It Works
            </h2>
            <p className="text-lg text-[#555555] max-w-2xl mx-auto font-medium">
              Seamless coordination between donors, NGOs, and volunteers to ensure no food goes to waste.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            <div className="glass-card w-full p-8 rounded-2xl">
              <div className="mb-6 inline-flex items-center justify-center text-blue-500 bg-white/50 p-3 rounded-xl shadow-sm">
                <Building2 size={32} strokeWidth={2} />
              </div>
              <h3 className="text-xl font-bold text-[#333333] mb-3">1. Donors Share</h3>
              <p className="text-[#555555] leading-relaxed">Restaurants, stores, and families list surplus food with details and expiry times, writing the first chapter of giving.</p>
            </div>

            <div className="glass-card w-full p-8 rounded-2xl">
              <div className="mb-6 inline-flex items-center justify-center text-cyan-500 bg-white/50 p-3 rounded-xl shadow-sm">
                <BarChart3 size={32} strokeWidth={2} />
              </div>
              <h3 className="text-xl font-bold text-[#333333] mb-3">2. AI Matches</h3>
              <p className="text-[#555555] leading-relaxed">Our intelligent system instantly pairs donors with nearby NGOs and designs optimal routes, connecting those in need.</p>
            </div>

            <div className="glass-card w-full p-8 rounded-2xl">
              <div className="mb-6 inline-flex items-center justify-center text-blue-500 bg-white/50 p-3 rounded-xl shadow-sm">
                <Truck size={32} strokeWidth={2} />
              </div>
              <h3 className="text-xl font-bold text-[#333333] mb-3">3. Volunteers Deliver</h3>
              <p className="text-[#555555] leading-relaxed">Community members pick up and deliver the food, bringing warmth and nourishment right to the doorstep.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AuthPage({ mode, role, setMode, setRole, form, setForm, notice, setNotice, onSubmit, onGoogleSignIn, onBack }: AuthPageProps) {
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [authStep, setAuthStep] = useState<1 | 2>(1);
  const [uiRole, setUiRole] = useState<'donor' | 'ngo' | 'volunteer' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (uiRole === 'donor') setRole('customer');
    else if (uiRole === 'ngo' || uiRole === 'volunteer') setRole('delivery-agent');
  }, [uiRole, setRole]);

  const handleGoogleClick = async () => {
    if (!uiRole) return;
    try {
      setIsGoogleLoading(true);
      setNotice(null);
      await onGoogleSignIn(uiRole);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Google sign-in failed');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!uiRole) return;
    setIsSubmitting(true);
    await onSubmit(event, uiRole);
    setTimeout(() => setIsSubmitting(false), 2000);
  };

  const getCtaText = () => {
    if (uiRole === 'donor') return 'Start donating surplus food';
    if (uiRole === 'ngo') return 'Request food support';
    if (uiRole === 'volunteer') return 'Start delivering food';
    return 'Continue';
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 sm:p-8 font-sans overflow-hidden bg-gradient-to-br from-[#F3D1C2] via-[#EADFD7] to-[#7FAFE0]">
      {/* Background animated blurred gradient waves */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-gradient-to-br from-yellow-100/40 to-pink-200/40 blur-[100px] animate-[slowFloat_10s_ease-in-out_infinite]" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-gradient-to-tl from-[#5D8FCB]/40 to-[#7FAFE0]/40 blur-[120px] animate-[slowFloat_12s_ease-in-out_infinite_reverse]" />

      <style>{`
        @keyframes slowFloat {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(20px, -20px) scale(1.05); }
        }
        @keyframes fadeInSlideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .apple-glass-card {
          background: rgba(255, 255, 255, 0.25);
          backdrop-filter: blur(30px);
          -webkit-backdrop-filter: blur(30px);
          border: 1px solid rgba(255, 255, 255, 0.4);
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.05), inset 0 0 0 1px rgba(255,255,255,0.2);
          border-radius: 40px;
        }
        .role-card-active {
          background: rgba(255, 255, 255, 0.7) !important;
          border-color: rgba(255, 255, 255, 0.9) !important;
          transform: scale(1.02);
          box-shadow: 0 12px 30px rgba(0,0,0,0.08);
        }
        .input-glow:focus {
          box-shadow: 0 0 0 4px rgba(127, 175, 224, 0.2);
          border-color: rgba(127, 175, 224, 0.5);
          background: rgba(255, 255, 255, 0.9);
        }
        .btn-loading {
          opacity: 0.8;
          cursor: wait;
        }
      `}</style>

      {/* Main Container Layout */}
      <div className="relative z-10 w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
        
        {/* Left Card: Impact & Preview */}
        <div className="hidden lg:flex flex-col justify-between apple-glass-card p-10 h-full min-h-[600px] relative overflow-hidden">
          {/* Abstract overlapping shape in background */}
          <div className="absolute -top-10 -left-10 w-64 h-64 bg-gradient-to-br from-yellow-200/50 via-pink-200/50 to-cyan-200/50 blur-[40px] rounded-full mix-blend-multiply opacity-70" />
          
          <div className="relative z-10 space-y-10">
            {/* Header & AI Badge */}
            <div>
              <div className="group inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/40 border border-white/50 backdrop-blur-md mb-6 cursor-default transition-all hover:bg-white/60 relative">
                <span>🤖</span>
                <span className="text-xs font-bold text-slate-700 tracking-wide uppercase">AI-powered food system</span>
                {/* Tooltip */}
                <div className="absolute left-0 top-full mt-2 w-56 p-3 rounded-xl bg-white/90 shadow-xl backdrop-blur-xl border border-white/50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none text-xs text-slate-600 font-medium z-20">
                  <ul className="space-y-1">
                    <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-[#7FAFE0]" />Predicts surplus food</li>
                    <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-[#F3D1C2]" />Optimizes delivery routes</li>
                    <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-[#EADFD7]" />Reduces waste in real time</li>
                  </ul>
                </div>
              </div>
              
              <h1 className="text-4xl font-black text-slate-800 tracking-tight leading-[1.1]">
                Zero Hunger.<br/>
                <span className="text-[#5D8FCB]">Maximum Impact.</span>
              </h1>
            </div>

            {/* Impact Metrics */}
            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: '🍽️', label: '12,450', sub: 'meals rescued' },
                { icon: '🚚', label: '1,200+', sub: 'deliveries optimized' },
                { icon: '🌍', label: '3.2 tons', sub: 'CO₂ reduced' },
                { icon: '⏱️', label: 'Zero', sub: 'expiry waste' }
              ].map((m, i) => (
                <div key={i} className="bg-white/30 backdrop-blur-md border border-white/40 rounded-2xl p-4 transition-all hover:bg-white/40">
                  <div className="text-2xl mb-2">{m.icon}</div>
                  <div className="font-black text-xl text-slate-800">{m.label}</div>
                  <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{m.sub}</div>
                </div>
              ))}
            </div>

            {/* Dashboard Preview */}
            <div className="bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                <BarChart3 size={16} className="text-[#5D8FCB]" /> What you'll see after joining
              </h3>
              <div className="space-y-2.5">
                {[
                  { label: 'Live food requests map', color: 'bg-emerald-400' },
                  { label: 'Expiry countdown alerts', color: 'bg-amber-400' },
                  { label: 'AI optimized delivery routes', color: 'bg-blue-400' },
                  { label: 'NGO demand heatmap', color: 'bg-purple-400' }
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${item.color}`} />
                    <span className="text-sm font-medium text-slate-700">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Card: Auth Flow */}
        <div className="apple-glass-card p-8 sm:p-12 w-full max-w-[500px] mx-auto relative min-h-[600px] flex flex-col justify-center">
          
          {/* Glossy Infinity Symbol overlay */}
          <div className="absolute top-8 right-8 text-6xl opacity-20 pointer-events-none drop-shadow-md text-white font-serif select-none mix-blend-overlay">
            ∞
          </div>

          <div className="relative z-10 w-full flex flex-col h-full justify-center">
            {/* Header / Logo */}
            <div className="text-center mb-10">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-[20px] bg-gradient-to-br from-white/80 to-white/30 border border-white/60 shadow-lg shadow-black/5 mb-4 backdrop-blur-xl">
                <Package size={32} className="text-[#5D8FCB]" />
              </div>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">Join Laya</h2>
              <p className="text-sm font-medium text-slate-500 mt-1">
                {authStep === 1 ? 'Choose how you want to make an impact.' : `Creating your ${uiRole} profile`}
              </p>
            </div>

            {/* STEP 1: Role Selection */}
            {authStep === 1 && (
              <div className="space-y-4 animate-[fadeInSlideUp_0.4s_ease-out]">
                {[
                  { id: 'donor', title: 'Donor', icon: '🍱', desc: 'Share surplus food from events, restaurants, homes' },
                  { id: 'ngo', title: 'NGO', icon: '🏢', desc: 'Receive and distribute food to communities' },
                  { id: 'volunteer', title: 'Volunteer', icon: '🚴', desc: 'Deliver food using optimized AI routes' }
                ].map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setUiRole(r.id as 'donor' | 'ngo' | 'volunteer');
                      setTimeout(() => setAuthStep(2), 300); // slight delay for visual feedback
                    }}
                    className={`w-full text-left p-5 rounded-3xl border border-white/40 bg-white/40 backdrop-blur-md transition-all duration-300 hover:bg-white/60 hover:-translate-y-1 hover:shadow-lg hover:shadow-black/5 ${uiRole === r.id ? 'role-card-active' : ''}`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="text-3xl bg-white/50 p-2 rounded-2xl shadow-sm border border-white/60">{r.icon}</div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-800">{r.title}</h3>
                        <p className="text-sm font-medium text-slate-600 mt-1">{r.desc}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* STEP 2: Auth Form */}
            {authStep === 2 && uiRole && (
              <div className="animate-[fadeInSlideUp_0.4s_ease-out]">
                {/* Tabs */}
                <div className="flex p-1 bg-black/5 rounded-2xl mb-6 backdrop-blur-md border border-white/20">
                  <button
                    type="button"
                    onClick={() => setMode('signup')}
                    className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${mode === 'signup' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Sign Up
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('signin')}
                    className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${mode === 'signin' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Sign In
                  </button>
                </div>

                <form onSubmit={handleFormSubmit} className="space-y-4 mb-6">
                  {mode === 'signup' && (
                    <input
                      type="text"
                      required
                      placeholder="Full Name"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="input-glow w-full px-5 py-3.5 rounded-2xl border border-white/50 bg-white/40 backdrop-blur-sm text-sm text-slate-800 placeholder:text-slate-500 outline-none transition-all"
                    />
                  )}
                  <input
                    type="email"
                    required
                    placeholder="Email Address"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="input-glow w-full px-5 py-3.5 rounded-2xl border border-white/50 bg-white/40 backdrop-blur-sm text-sm text-slate-800 placeholder:text-slate-500 outline-none transition-all"
                  />
                  <input
                    type="password"
                    required
                    minLength={4}
                    placeholder="Password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="input-glow w-full px-5 py-3.5 rounded-2xl border border-white/50 bg-white/40 backdrop-blur-sm text-sm text-slate-800 placeholder:text-slate-500 outline-none transition-all"
                  />

                  {/* Volunteer-specific fields */}
                  {mode === 'signup' && uiRole === 'volunteer' && (
                    <>
                      <input
                        type="text"
                        required
                        placeholder="Vehicle Number (e.g., KA-05-AB-1234)"
                        value={form.vehicleNumber}
                        onChange={(e) => setForm({ ...form, vehicleNumber: e.target.value })}
                        className="input-glow w-full px-5 py-3.5 rounded-2xl border border-white/50 bg-white/40 backdrop-blur-sm text-sm text-slate-800 placeholder:text-slate-500 outline-none transition-all"
                      />
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-600">Profile Picture (Optional)</label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (event) => {
                                const base64 = event.target?.result as string;
                                setForm({ ...form, profileImageUrl: base64 });
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                          className="input-glow w-full px-5 py-3.5 rounded-2xl border border-white/50 bg-white/40 backdrop-blur-sm text-sm text-slate-800 placeholder:text-slate-500 outline-none transition-all"
                        />
                        {form.profileImageUrl && (
                          <div className="flex items-center gap-3 p-3 bg-white/30 rounded-xl">
                            <img src={form.profileImageUrl} alt="Preview" className="w-12 h-12 rounded-full object-cover" />
                            <span className="text-xs text-slate-600">Image uploaded</span>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {notice && (
                    <div className="rounded-xl bg-red-50/80 border border-red-100 p-3 text-xs font-medium text-red-600">
                      {notice}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={`w-full py-4 rounded-2xl bg-gradient-to-r from-[#5D8FCB] to-[#7FAFE0] text-white font-bold text-sm shadow-[0_8px_20px_rgba(93,143,203,0.3)] transition-all hover:shadow-[0_12px_24px_rgba(93,143,203,0.4)] hover:-translate-y-0.5 ${isSubmitting ? 'btn-loading' : ''}`}
                  >
                    {isSubmitting ? 'Creating your impact profile...' : getCtaText()}
                  </button>
                </form>

                <div className="flex items-center gap-4 mb-6">
                  <div className="h-px flex-1 bg-white/50" />
                  <span className="text-xs font-bold text-slate-400">OR</span>
                  <div className="h-px flex-1 bg-white/50" />
                </div>

                <button
                  type="button"
                  onClick={handleGoogleClick}
                  disabled={isGoogleLoading || isSubmitting}
                  className={`w-full py-3.5 rounded-2xl border border-white/60 bg-white/50 backdrop-blur-md text-slate-700 font-bold text-sm transition-all hover:bg-white/70 hover:shadow-sm flex items-center justify-center gap-3 ${isGoogleLoading ? 'btn-loading' : ''}`}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  {isGoogleLoading ? 'Signing in...' : 'Continue with Google'}
                </button>
              </div>
            )}

            {/* Back to Home / Roles */}
            <div className="mt-8 flex flex-col sm:flex-row justify-center gap-4 text-center">
              {authStep === 2 && (
                <button 
                  onClick={() => { setAuthStep(1); setNotice(null); }}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
                >
                  ← Back to roles
                </button>
              )}
              <button 
                onClick={onBack}
                className="text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
              >
                Back to Home
              </button>
            </div>

            {/* Trust Signals */}
            <div className="mt-8 pt-6 border-t border-white/30">
              <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                  <ShieldCheck size={14} className="text-emerald-500" /> Verified NGOs only
                </span>
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                  <MapPin size={14} className="text-[#5D8FCB]" /> Secure matching
                </span>
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                  <Route size={14} className="text-purple-500" /> Delivery tracking
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AppShell({ session, dashboardView, setDashboardView, onLogout, needs, donations, deliveries }: AppShellProps) {
  const navItems = UI_NAV_ITEMS[session.uiRole];
  const dashboard = session.uiRole === 'volunteer' && dashboardView === 'needs' ? 'requests' : dashboardView;

  return (
    <div 
      className={`min-h-screen w-full text-slate-900 pb-12 font-sans relative ${session.uiRole === 'donor' || session.uiRole === 'ngo' || session.uiRole === 'volunteer' ? '' : 'bg-[#FAFAFA]'}`}
      style={session.uiRole === 'donor' || session.uiRole === 'ngo' || session.uiRole === 'volunteer' ? { background: 'linear-gradient(to bottom, #F3D1C2, #EADFD7, #7FAFE0, #5D8FCB)' } : {}}
    >
      <style>{`
        @keyframes liquidProgress {
          0% { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }
        @keyframes slowFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        @keyframes fadeInSlideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-slide {
          animation: fadeInSlideUp 0.6s ease-out forwards;
        }
        .animate-slow-float {
          animation: slowFloat 8s ease-in-out infinite;
        }
        .animate-liquid {
          background-size: 200% 100%;
          animation: liquidProgress 3s linear infinite;
        }
        .donor-glass-card {
          background: rgba(255, 255, 255, 0.4);
          backdrop-filter: blur(30px);
          -webkit-backdrop-filter: blur(30px);
          border: 1px solid rgba(255, 255, 255, 0.8);
          box-shadow: 0 10px 40px rgba(0,0,0,0.03);
          border-radius: 32px;
        }
        .donor-glass-panel {
          background: rgba(255, 255, 255, 0.6);
          backdrop-filter: blur(40px);
          -webkit-backdrop-filter: blur(40px);
          border: 1px solid rgba(255, 255, 255, 0.5);
          box-shadow: 0 20px 50px rgba(0,0,0,0.04);
          border-radius: 36px;
        }
        .donor-glass-btn {
          background: rgba(255, 255, 255, 0.5);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.6);
          transition: all 0.3s ease;
        }
        .donor-glass-btn:hover {
          background: rgba(255, 255, 255, 0.8);
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.05);
        }
      `}</style>
      
      {/* Dynamic Background */}
      {session.uiRole === 'donor' && (
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-gradient-to-br from-[#FDFBF7] via-[#F3D1C2]/30 to-[#7FAFE0]/20">
          <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] rounded-full bg-[#EADFD7] opacity-40 blur-[120px]"></div>
          <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-[#5D8FCB] opacity-20 blur-[140px]"></div>
        </div>
      )}

      <div className="relative z-10 w-full px-4 pt-6 sm:px-8">
        {/* TOP HEADER (The Floating Island) */}
        <header className="mx-auto max-w-7xl flex items-center justify-between rounded-[32px] border border-white/60 bg-white/40 p-3 pr-4 shadow-[0_8px_32px_rgba(0,0,0,0.04)] backdrop-blur-[30px]">
          <div className="flex items-center gap-3 pl-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-800 text-white shadow-md">
              <Truck size={18} />
            </div>
            <div>
              <p className="text-sm font-black tracking-widest text-slate-800 uppercase">Laya</p>
              <p className="text-[10px] font-medium tracking-wide text-slate-500 uppercase">Delivering Surplus Food</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Primary CTA */}
            {session.uiRole === 'donor' && (
              <button 
                onClick={() => setDashboardView('requests')}
                className="flex items-center gap-1.5 rounded-full bg-gradient-to-b from-[#D4AF37]/90 to-[#CD7F32] px-4 py-2 text-xs font-bold text-white shadow-[0_4px_12px_rgba(205,127,50,0.3)] transition hover:scale-105"
              >
                <Plus size={14} /> Donate Food
              </button>
            )}
            {/* Sign Out */}
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-1.5 rounded-full border border-white/50 bg-white/40 px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-white hover:text-rose-500"
            >
              <LogOut size={13} /> Sign out
            </button>
          </div>
        </header>

        {/* Navigation Tabs (Glass Pills) */}
        <div className="mx-auto mt-6 max-w-7xl flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setDashboardView(item.key)}
              className={`flex shrink-0 items-center gap-2 rounded-[20px] px-5 py-2.5 text-xs font-bold transition-all ${
                dashboard === item.key 
                  ? 'bg-slate-800 text-white shadow-md scale-105' 
                  : 'donor-glass-btn text-slate-600 hover:bg-white/60'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>

        <main className="mx-auto mt-8 max-w-7xl">
          {dashboard === 'overview' && <OverviewPanel session={session} needs={needs} donations={donations} deliveries={deliveries} setDashboardView={setDashboardView} />}
          {dashboard === 'requests' && <RequestsPanel session={session} needs={needs} donations={donations} deliveries={deliveries} />}
          {dashboard === 'needs' && session.uiRole !== 'volunteer' && <NeedsPanel session={session} needs={needs} />}
          {dashboard === 'tracking' && (session.uiRole === 'volunteer' ? <VolunteerActiveDeliveryPanel session={session} deliveries={deliveries} /> : <TrackingPanel session={session} donations={donations} deliveries={deliveries} />)}
          {dashboard === 'history' && session.uiRole === 'volunteer' ? <VolunteerHistoryPanel session={session} deliveries={deliveries} /> : null}
          {dashboard === 'profile' && <ProfilePanel session={session} onLogout={onLogout} />}
        </main>
      </div>
    </div>
  );
}

function OverviewPanel({ session, needs, donations, deliveries, setDashboardView }: { session: Session; needs: NeedRecord[]; donations: DonationRecord[]; deliveries: DeliveryRecord[]; setDashboardView: (v: DashboardView) => void }) {
  if (session.uiRole === 'donor') {
    return <CustomerOverview session={session} needs={needs} donations={donations} deliveries={deliveries} setDashboardView={setDashboardView} />;
  }

  const metrics = session.uiRole === 'ngo' ? NGO_METRICS : AGENT_METRICS;
  const displayRoleLabel = getDisplayRoleLabel(session);
  const openNeeds = needs.filter((need) => need.status === 'open').length;
  const activeDeliveries = deliveries.filter((delivery) => delivery.status !== 'delivered').length;

  if (session.uiRole === 'volunteer') {
    return (
      <div className="space-y-6 w-full max-w-5xl mx-auto">
        <AgentOverview session={session} deliveries={deliveries} />
        <VolunteerActiveDeliveryPanel session={session} deliveries={deliveries} compact />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[2rem] border border-white/80 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-6 text-white shadow-[0_30px_90px_rgba(15,23,42,0.2)] sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-200">Welcome back</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Hi {session.name.split(' ')[0]}, your donation dashboard is ready</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              {session.uiRole === 'ngo'
                ? 'Post live needs, match donations, and close the loop at the beneficiary location.'
                : 'Manage your food donations and track impact'}
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm text-cyan-100">
            <Sparkles size={16} />
            {displayRoleLabel}
          </div>
        </div>
      </div>

      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </div>

      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
        <MetricCard icon={<MapPin size={22} className="text-cyan-600" />} value={String(openNeeds)} label="Open Needs" accent="bg-cyan-50" />
        <MetricCard icon={<Truck size={22} className="text-emerald-600" />} value={String(activeDeliveries)} label="Active Deliveries" accent="bg-emerald-50" />
      </div>

      {session.uiRole === 'ngo' ? <NgoOverview session={session} needs={needs} deliveries={deliveries} /> : <AgentOverview session={session} deliveries={deliveries} />}
    </div>
  );
}

function NgoOverview({ session, needs, deliveries }: { session: Session; needs: NeedRecord[]; deliveries: DeliveryRecord[] }) {
  const myNeeds = needs.filter((need) => need.ngoId === session.email);
  const myNeedIds = new Set(myNeeds.map(n => n.id));
  
  const activeRequests = myNeeds.filter((need) => need.status === 'open').length;
  const urgentRequests = myNeeds.filter((need) => need.status === 'open' && need.urgency === 'high').length;
  const ongoingDeliveries = deliveries.filter((delivery) => myNeedIds.has(delivery.needId) && delivery.status !== 'delivered').length;
  const completedToday = deliveries.filter((delivery) => {
    if (!myNeedIds.has(delivery.needId) || delivery.status !== 'delivered') return false;
    const deliveredAt = new Date(delivery.deliveredAt || delivery.createdAt);
    return deliveredAt.toDateString() === new Date().toDateString();
  }).length;

  return (
    <div className="flex flex-col gap-6 animate-fade-slide pb-12 w-full max-w-5xl mx-auto">
      <div className="donor-glass-panel relative overflow-hidden px-8 py-10 border-l-8 border-l-[#5D8FCB]">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-800">
              {activeRequests === 0 
                ? 'All quiet — network is stable' 
                : `${activeRequests} live needs require fulfillment`}
            </h1>
            <p className="mt-2 text-sm font-bold text-[#5D8FCB] uppercase tracking-widest">
              Hunger Response Control Panel
            </p>
          </div>
        </div>

        {ongoingDeliveries > 0 && deliveries.filter(d => d.status !== 'delivered')[0] && (
          <div className="mt-8">
            <DynamicOptimizationMap 
              source={{ lat: deliveries.find(d => d.status !== 'delivered')?.pickupLocation?.lat || 0, lng: deliveries.find(d => d.status !== 'delivered')?.pickupLocation?.lng || 0 }}
              destination={{ lat: deliveries.find(d => d.status !== 'delivered')?.dropLocation?.lat || 0, lng: deliveries.find(d => d.status !== 'delivered')?.dropLocation?.lng || 0 }}
            />
          </div>
        )}

        <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-900">{session.name}</p>
          <p className="mt-1">Post a new need from the Requests tab, then track all open beneficiary requests from Live Needs.</p>
        </div>
      </div>

      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="donor-glass-card p-6 flex flex-col justify-between border-l-4 border-l-[#5D8FCB] hover:-translate-y-1 transition-all">
          <p className="text-2xl">📋</p>
          <div>
            <p className="text-2xl font-black text-slate-800 mt-2">{activeRequests}</p>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Active Requests</p>
          </div>
        </div>
        <div className="donor-glass-card p-6 flex flex-col justify-between border-l-4 border-l-[#FDB1C9] hover:-translate-y-1 transition-all">
          <p className="text-2xl">⚡</p>
          <div>
            <p className="text-2xl font-black text-slate-800 mt-2">{urgentRequests}</p>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Urgent Requests</p>
          </div>
        </div>
        <div className="donor-glass-card p-6 flex flex-col justify-between border-l-4 border-l-[#F5C97A] hover:-translate-y-1 transition-all">
          <p className="text-2xl">🚚</p>
          <div>
            <p className="text-2xl font-black text-slate-800 mt-2">{ongoingDeliveries}</p>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Ongoing Deliveries</p>
          </div>
        </div>
        <div className="donor-glass-card p-6 flex flex-col justify-between border-l-4 border-l-[#A8D5A2] hover:-translate-y-1 transition-all">
          <p className="text-2xl">✅</p>
          <div>
            <p className="text-2xl font-black text-slate-800 mt-2">{completedToday}</p>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Completed Today</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Auto-Match Modal ────────────────────────────────────────────────────────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface MatchScoreBreakdown { urgency: number; timeDecay: number; distance: number; capacity: number; foodCompat: number; feasibility: number; total: number; }

function computeFullMatchScore(need: NeedRecord, donorLat?: number, donorLng?: number, expiryMs?: number, donorMealType?: string, donorCategory?: string, donorServings?: number): MatchScoreBreakdown {
  const b: MatchScoreBreakdown = { urgency: 0, timeDecay: 0, distance: 0, capacity: 0, foodCompat: 0, feasibility: 0, total: 0 };
  b.urgency = need.urgency === 'high' ? 20 : need.urgency === 'medium' ? 12 : 5;
  if (expiryMs) { const h = (expiryMs - Date.now()) / 3_600_000; b.timeDecay = h < 0 ? 0 : h < 1 ? 20 : h < 2 ? 16 : h < 4 ? 10 : 5; } else { b.timeDecay = 8; }
  if (donorLat && donorLng && need.location?.lat && need.location?.lng) { const d = haversineKm(donorLat, donorLng, need.location.lat, need.location.lng); b.distance = d < 2 ? 20 : d < 5 ? 16 : d < 10 ? 12 : d < 15 ? 8 : d < 25 ? 4 : 1; } else { b.distance = 10; }
  const ppl = parseInt(String(need.peopleCount)) || 0; const serv = donorServings || 0;
  if (serv > 0 && ppl > 0) { const ratio = serv / ppl; b.capacity = ratio >= 1 ? 15 : ratio >= 0.5 ? 10 : 5; } else { b.capacity = ppl > 100 ? 15 : ppl > 50 ? 10 : ppl > 20 ? 7 : 4; }
  const nM = (need.mealType || 'any').toLowerCase(); const dM = (donorMealType || 'any').toLowerCase();
  const nC = (need.category || 'any').toLowerCase(); const dC = (donorCategory || 'any').toLowerCase();
  let compat = 0; if (dM === 'any' || nM === 'any' || dM === nM) compat += 8; else compat += 2;
  if (dC === 'any' || nC === 'any' || dC === nC) compat += 7; else compat += 1; b.foodCompat = compat;
  if (donorLat && donorLng && need.location?.lat && need.location?.lng) { const d = haversineKm(donorLat, donorLng, need.location.lat, need.location.lng); const hLeft = expiryMs ? (expiryMs - Date.now()) / 3_600_000 : 4; b.feasibility = (d / 30 < hLeft) ? (d < 5 ? 10 : d < 15 ? 7 : 4) : 0; } else { b.feasibility = 5; }
  b.total = Math.min(100, b.urgency + b.timeDecay + b.distance + b.capacity + b.foodCompat + b.feasibility);
  return b;
}

type MatchResult = { need: NeedRecord; score: number; breakdown: MatchScoreBreakdown; distKm: number | null };
type AutoMatchPhase = 'form' | 'scanning' | 'results' | 'routing' | 'done';

function AutoMatchModal({ needs, donations, session, onClose, onMatchComplete }: {
  needs: NeedRecord[];
  donations: DonationRecord[];
  session: Session;
  onClose: () => void;
  onMatchComplete: () => void;
}) {
  const [phase, setPhase] = useState<AutoMatchPhase>('form');
  const [scanStep, setScanStep] = useState(0);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [routeStatus, setRouteStatus] = useState('');
  const [error, setError] = useState('');
  const [foodType, setFoodType] = useState('');
  const [mealType, setMealType] = useState('any');
  const [category, setCategory] = useState('any');
  const [quantity, setQuantity] = useState('');
  const [expiryTime, setExpiryTime] = useState('within-2-hours');
  const [pickupLocation, setPickupLocation] = useState('');
  const [donorPos, setDonorPos] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setDonorPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}
    );
  }, []);

  const getExpiryMs = (): number => {
    const now = Date.now();
    if (expiryTime === 'within-1-hour') return now + 3_600_000;
    if (expiryTime === 'within-2-hours') return now + 7_200_000;
    if (expiryTime === 'within-4-hours') return now + 14_400_000;
    return now + 28_800_000;
  };

  const startMatching = () => {
    if (!foodType.trim() || !quantity.trim()) { setError('Please fill food type and quantity.'); return; }
    setError('');
    setPhase('scanning');
    setScanStep(0);
    const expMs = getExpiryMs();
    const openNeeds = needs.filter((n) => n.status === 'open');
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setScanStep(1), 800));
    timers.push(setTimeout(() => setScanStep(2), 1800));
    timers.push(setTimeout(() => setScanStep(3), 2800));
    timers.push(setTimeout(() => setScanStep(4), 3800));
    timers.push(setTimeout(() => {
      const scored: MatchResult[] = openNeeds.map((n) => {
        const bd = computeFullMatchScore(n, donorPos?.lat, donorPos?.lng, expMs, mealType, category, parseInt(quantity) || 0);
        return { need: n, score: bd.total, breakdown: bd, distKm: donorPos && n.location?.lat && n.location?.lng ? haversineKm(donorPos.lat, donorPos.lng, n.location.lat, n.location.lng) : null };
      }).filter((m) => m.breakdown.feasibility > 0 || !donorPos).sort((a, b) => b.score - a.score).slice(0, 5);
      setMatches(scored);
      setScanStep(5);
      setPhase('results');
    }, 4800));
  };

  const confirmMatch = async (matchIdx: number) => {
    const m = matches[matchIdx];
    if (!m) return;
    setSelectedIdx(matchIdx);
    setPhase('routing');
    try {
      setRouteStatus('Registering food donation...');
      const donationId = await createDonationRecord({
        donorId: session.email, foodType, mealType: mealType as MealType, category: category as FoodCategory,
        quantity, expiryTime: getExpiryMs(),
        location: { address: pickupLocation || 'Auto-detected', lat: donorPos?.lat ?? 0, lng: donorPos?.lng ?? 0 },
        status: 'assigned', assignedNeedId: m.need.id,
      });
      setRouteStatus('Assigning delivery agent & route...');
      await new Promise((r) => setTimeout(r, 800));
      await createDelivery({
        donorId: session.email, donorName: session.name, ngoId: m.need.ngoId, agentId: null, donationId,
        pickupLocation: { address: pickupLocation || 'Auto-detected', lat: donorPos?.lat ?? 0, lng: donorPos?.lng ?? 0 },
        dropLocation: m.need.location || { address: 'Unknown', lat: 0, lng: 0 }, needId: m.need.id, agentLocation: null,
        foodType, mealType: mealType as MealType, category: category as FoodCategory, quantity, status: 'pending',
      });
      setRouteStatus('Updating need status...');
      await updateNeed(m.need.id, { status: 'assigned' });
      setRouteStatus('Match confirmed!');
      await new Promise((r) => setTimeout(r, 600));
      setPhase('done');
    } catch (err) {
      setError(`Match failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setPhase('results');
      if (matchIdx + 1 < matches.length) setSelectedIdx(matchIdx + 1);
    }
  };

  const SCAN_STEPS = [
    { icon: '\uD83C\uDF71', label: 'Registering your food supply' },
    { icon: '\uD83E\uDDED', label: 'Scanning NGOs within 15km radius' },
    { icon: '\uD83E\uDD16', label: 'Computing AI match scores' },
    { icon: '\uD83D\uDCCA', label: 'Ranking beneficiary NGOs by score' },
    { icon: '\uD83D\uDE9A', label: 'Checking delivery feasibility' },
    { icon: '\u2705', label: `Found ${matches.length} match${matches.length !== 1 ? 'es' : ''}!` },
  ];
  const glassInput = "w-full rounded-2xl border border-white/60 bg-white/50 backdrop-blur px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-[#7FAFE0] focus:ring-4 focus:ring-[#7FAFE0]/20";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(12px)' }}>
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[36px] shadow-[0_40px_100px_rgba(0,0,0,0.25)]" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(243,209,194,0.85) 50%, rgba(127,175,224,0.85) 100%)' }}>
        <button onClick={onClose} className="absolute top-5 right-5 z-10 w-8 h-8 rounded-full bg-white/60 backdrop-blur flex items-center justify-center text-slate-500 hover:text-rose-500 hover:bg-white transition"><X size={16} /></button>
        <div className="p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FDB1C9] to-[#7FAFE0] flex items-center justify-center text-2xl shadow-lg">{'\u26A1'}</div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[#5D8FCB]">Laya Intelligence</p>
              <h2 className="text-xl font-black text-slate-800">Auto-Match Food</h2>
            </div>
          </div>

          {phase === 'form' && (
            <div className="animate-fade-slide space-y-4">
              <p className="text-sm text-slate-600">Enter what you are donating. Our AI will find the best-matched NGO instantly.</p>
              {error && <p className="text-sm text-rose-600 font-bold">{error}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Food Type *</label><input value={foodType} onChange={(e) => setFoodType(e.target.value)} placeholder="e.g. Prepared meals, bread" className={glassInput} /></div>
                <div><label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Quantity (servings) *</label><input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="e.g. 50" type="number" className={glassInput} /></div>
                <div><label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Meal Type</label><select value={mealType} onChange={(e) => setMealType(e.target.value)} className={glassInput}><option value="any">Any</option><option value="veg">Veg</option><option value="non-veg">Non-Veg</option><option value="vegan">Vegan</option></select></div>
                <div><label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Category</label><select value={category} onChange={(e) => setCategory(e.target.value)} className={glassInput}><option value="any">Any</option><option value="cooked">Cooked</option><option value="raw">Raw</option><option value="packaged">Packaged</option><option value="beverages">Beverages</option></select></div>
                <div><label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Expires In</label><select value={expiryTime} onChange={(e) => setExpiryTime(e.target.value)} className={glassInput}><option value="within-1-hour">Within 1 hour</option><option value="within-2-hours">Within 2 hours</option><option value="within-4-hours">Within 4 hours</option><option value="today">Today</option></select></div>
                <div><label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Pickup Location</label><input value={pickupLocation} onChange={(e) => setPickupLocation(e.target.value)} placeholder="Address (or auto-detect GPS)" className={glassInput} /></div>
              </div>
              <button onClick={startMatching} className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-[#7FAFE0] to-[#5D8FCB] px-6 py-4 text-sm font-black text-white shadow-lg hover:scale-[1.02] transition mt-2"><Zap size={18} /> Find Best Match Now</button>
            </div>
          )}

          {phase === 'scanning' && (
            <div className="space-y-3 animate-fade-slide">
              <p className="text-sm text-slate-600 mb-4"><strong>{foodType}</strong> - {quantity} servings - expires {expiryTime.replace('within-', '').replace('-', ' ')}</p>
              {SCAN_STEPS.map((s, i) => (
                <div key={i} className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition-all duration-500 ${scanStep > i ? 'bg-white/70 border border-white/60 shadow-sm' : scanStep === i ? 'bg-white/50 border border-white/40 animate-pulse' : 'opacity-30'}`}>
                  <span className="text-xl">{s.icon}</span>
                  <span className="text-sm font-bold text-slate-700 flex-1">{s.label}</span>
                  {scanStep > i && <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">Done</span>}
                  {scanStep === i && <span className="text-xs font-bold text-[#5D8FCB] bg-blue-50 px-2 py-1 rounded-full animate-pulse">Running</span>}
                </div>
              ))}
            </div>
          )}

          {phase === 'results' && (
            <div className="animate-fade-slide">
              {error && <p className="text-sm text-amber-600 font-bold mb-3">{error} Re-allocating to next best match.</p>}
              {matches.length === 0 ? (
                <div className="rounded-3xl border border-white/60 bg-white/40 p-8 text-center">
                  <p className="text-3xl mb-2">{'\uD83C\uDF3F'}</p>
                  <p className="font-bold text-slate-700">No matching NGOs found right now</p>
                  <p className="text-sm text-slate-500 mt-1">Your donation will be saved. We will auto-match when an NGO posts a need.</p>
                  <button onClick={onClose} className="mt-4 rounded-2xl bg-gradient-to-b from-[#D4AF37]/90 to-[#CD7F32] px-5 py-2.5 text-sm font-bold text-white shadow-md hover:scale-105 transition">Got it</button>
                </div>
              ) : (
                <>
                  <p className="text-xs font-bold uppercase tracking-widest text-[#5D8FCB] mb-1">Top {matches.length} Matches - Ranked by AI</p>
                  <p className="text-xs text-slate-500 mb-4">Score = Urgency + Time Decay + Distance + Capacity + Food Compatibility + Delivery Feasibility</p>
                  <div className="space-y-3 mb-6">
                    {matches.map((m, i) => (
                      <div key={m.need.id} className={`rounded-2xl p-4 border cursor-pointer transition-all hover:shadow-md ${i === selectedIdx ? 'bg-white/80 border-[#A8D5A2]/60 shadow-md ring-2 ring-emerald-300' : 'bg-white/50 border-white/40'}`} onClick={() => setSelectedIdx(i)}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {i === 0 && <span className="text-xs font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Best Match</span>}
                              <span className="text-xs font-bold text-slate-500 uppercase">{m.need.urgency} urgency</span>
                            </div>
                            <p className="font-black text-slate-800 mt-1">{m.need.foodType || 'Food needed'}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{m.need.location?.address || 'Unknown'} - {m.need.peopleCount} people</p>
                            {m.distKm !== null && <p className="text-xs text-[#5D8FCB] font-bold mt-0.5">{m.distKm.toFixed(1)} km away</p>}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-2xl font-black" style={{ color: m.score >= 75 ? '#16a34a' : m.score >= 50 ? '#d97706' : '#dc2626' }}>{m.score}%</p>
                            <p className="text-xs text-slate-400 font-bold">score</p>
                          </div>
                        </div>
                        <div className="mt-2 h-2 w-full rounded-full bg-white/50 overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${m.score}%`, background: m.score >= 75 ? 'linear-gradient(90deg,#A8D5A2,#22c55e)' : m.score >= 50 ? 'linear-gradient(90deg,#F5C97A,#f59e0b)' : 'linear-gradient(90deg,#FDB1C9,#ef4444)' }} />
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold text-slate-500">
                          <span className="bg-white/60 px-2 py-0.5 rounded-full">Urgency {m.breakdown.urgency}/20</span>
                          <span className="bg-white/60 px-2 py-0.5 rounded-full">Decay {m.breakdown.timeDecay}/20</span>
                          <span className="bg-white/60 px-2 py-0.5 rounded-full">Dist {m.breakdown.distance}/20</span>
                          <span className="bg-white/60 px-2 py-0.5 rounded-full">Cap {m.breakdown.capacity}/15</span>
                          <span className="bg-white/60 px-2 py-0.5 rounded-full">Food {m.breakdown.foodCompat}/15</span>
                          <span className="bg-white/60 px-2 py-0.5 rounded-full">Route {m.breakdown.feasibility}/10</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => confirmMatch(selectedIdx)} className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-emerald-400 to-emerald-600 px-6 py-3.5 text-sm font-black text-white shadow-lg hover:scale-105 transition"><Zap size={16} /> Confirm Match #{selectedIdx + 1}</button>
                    <button onClick={onClose} className="px-5 py-3.5 rounded-2xl border border-white/60 bg-white/40 text-sm font-bold text-slate-600 hover:bg-white transition">Cancel</button>
                  </div>
                </>
              )}
            </div>
          )}

          {phase === 'routing' && (
            <div className="animate-fade-slide text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-3xl bg-gradient-to-br from-emerald-100 to-blue-100 flex items-center justify-center text-3xl animate-pulse">{'\uD83D\uDE80'}</div>
              <p className="font-black text-slate-800 text-lg">{routeStatus}</p>
              <p className="text-sm text-slate-500 mt-2">Creating donation - Assigning agent - Generating fastest route</p>
              <div className="mt-4 h-2 w-48 mx-auto rounded-full bg-white/50 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-blue-400 animate-pulse" style={{ width: '60%' }} /></div>
            </div>
          )}

          {phase === 'done' && (
            <div className="animate-fade-slide text-center py-8">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-emerald-100 flex items-center justify-center text-4xl">{'\u2705'}</div>
              <h3 className="text-2xl font-black text-emerald-700">Match Confirmed!</h3>
              <p className="text-sm text-slate-600 mt-2">Your <strong>{foodType}</strong> ({quantity} servings) is matched to <strong>{matches[selectedIdx]?.need.location?.address || 'Unknown'}</strong></p>
              <div className="mt-4 grid grid-cols-3 gap-2 max-w-xs mx-auto text-xs">
                <div className="bg-white/60 rounded-xl p-2"><p className="font-black text-emerald-600">{matches[selectedIdx]?.score}%</p><p className="text-slate-500">Score</p></div>
                <div className="bg-white/60 rounded-xl p-2"><p className="font-black text-blue-600">{matches[selectedIdx]?.distKm?.toFixed(1) || '?'} km</p><p className="text-slate-500">Distance</p></div>
                <div className="bg-white/60 rounded-xl p-2"><p className="font-black text-amber-600">{matches[selectedIdx]?.need.peopleCount}</p><p className="text-slate-500">People</p></div>
              </div>
              <button onClick={() => { onMatchComplete(); onClose(); }} className="mt-6 rounded-2xl bg-gradient-to-b from-emerald-400 to-emerald-600 px-8 py-3 text-sm font-black text-white shadow-lg hover:scale-105 transition">View Delivery Tracking</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


function CustomerOverview({ session, needs, donations, deliveries, setDashboardView }: { session: Session; needs: NeedRecord[]; donations: DonationRecord[]; deliveries: DeliveryRecord[]; setDashboardView: (v: DashboardView) => void }) {
  const [showAutoMatch, setShowAutoMatch] = useState(false);

  const donorDonations = donations.filter((d) => d.donorId === session.email);
  const donorDeliveries = deliveries.filter((d) => d.donorId === session.email);
  const completedDeliveries = donorDeliveries.filter((d) => d.status === 'delivered');
  const totalMeals = donorDonations.reduce((sum, d) => sum + (d.servings || 0), 0);
  const peopleServed = completedDeliveries.reduce((sum, d) => sum + (d.servings || 1), 0);
  const goalMeals = Math.max(200, totalMeals + 50);
  const progressPct = goalMeals > 0 ? Math.min(100, Math.round((totalMeals / goalMeals) * 100)) : 0;

  // Build last-7-days chart data from real donations
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const label = d.toLocaleDateString('en-IN', { weekday: 'short' });
    const count = donorDonations.filter((don) => {
      const created = new Date(don.createdAt || '');
      return created.toDateString() === d.toDateString();
    }).reduce((s, don) => s + (don.servings || 1), 0);
    return { label, count };
  });
  const maxCount = Math.max(...last7.map((p) => p.count), 1);
  const toY = (v: number) => 100 - Math.round((v / maxCount) * 90);
  const pathD = last7.map((p, i) => {
    const x = (i / 6) * 360 + 20;
    const y = toY(p.count);
    return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
  }).join(' ');
  const areaD = pathD + ` L 380 120 L 20 120 Z`;

  return (
    <div className="flex flex-col gap-8 pb-12 animate-fade-slide">
      {/* Auto-Match Modal */}
      {showAutoMatch && (
        <AutoMatchModal
          needs={needs}
          donations={donations}
          session={session}
          onClose={() => setShowAutoMatch(false)}
          onMatchComplete={() => {
            setShowAutoMatch(false);
            setDashboardView('tracking');
          }}
        />
      )}
      {/* 2. HERO SECTION */}
      <div className="donor-glass-panel relative overflow-hidden px-8 py-12">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-800">
              Hi {session.name.split(' ')[0]} 👋<br/>
              Ready to make an impact today?
            </h1>
            <div className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-white/60 px-4 py-2 text-xs font-bold text-slate-700 shadow-sm backdrop-blur-md border border-white/40">
              💡 Donating early increases delivery success by 60%
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4">
            <button onClick={() => setDashboardView('requests')} className="flex items-center justify-center gap-2 rounded-[24px] bg-[#FDB1C9]/30 border border-[#FDB1C9]/50 backdrop-blur-md px-8 py-5 text-sm font-bold text-[#b13560] shadow-[0_8px_24px_rgba(253,177,201,0.2)] hover:-translate-y-1 hover:shadow-[0_12px_30px_rgba(253,177,201,0.3)] transition-all">
              <Plus size={18} /> Add Donation
            </button>
            <button onClick={() => setShowAutoMatch(true)} className="flex items-center justify-center gap-2 rounded-[24px] bg-[#7FAFE0]/30 border border-[#7FAFE0]/50 backdrop-blur-md px-8 py-5 text-sm font-bold text-[#1F548C] shadow-[0_8px_24px_rgba(127,175,224,0.1)] hover:-translate-y-1 hover:shadow-[0_12px_30px_rgba(127,175,224,0.2)] transition-all">
              <Zap size={18} /> Auto-Match Food
            </button>
          </div>
        </div>
      </div>

      {/* 3. OVERVIEW (The Impact Dashboard) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left Card: Real Data Spline Chart */}
        <div className="donor-glass-card relative overflow-hidden p-8 flex flex-col justify-between min-h-[300px]">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-gradient-to-br from-[#F5E6D3]/60 to-[#FDB1C9]/40 blur-[40px]"></div>
          <div className="relative z-10 flex items-start justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-800 tracking-tight">Meals Donated</h2>
              <p className="text-sm font-medium text-slate-500 mt-0.5">Last 7 days · real data</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-black text-slate-800">{totalMeals > 0 ? totalMeals : '–'}</p>
              <p className="text-xs font-bold text-emerald-500 mt-0.5">total servings</p>
            </div>
          </div>
          <div className="relative z-10 mt-6 h-36 w-full">
            <svg viewBox="0 0 400 130" className="h-full w-full overflow-visible">
              <defs>
                <linearGradient id="areaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#7FAFE0" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#F3D1C2" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#7FAFE0" />
                  <stop offset="100%" stopColor="#FDB1C9" />
                </linearGradient>
              </defs>
              {/* Grid lines */}
              {[25, 50, 75, 100].map((y) => (
                <line key={y} x1="20" y1={y} x2="380" y2={y} stroke="rgba(0,0,0,0.04)" strokeWidth="1" />
              ))}
              <path d={areaD} fill="url(#areaGrad)" />
              <path d={pathD} fill="none" stroke="url(#lineGrad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              {/* Data point dots */}
              {last7.map((p, i) => {
                const x = (i / 6) * 360 + 20;
                const y = toY(p.count);
                return (
                  <g key={i}>
                    <circle cx={x} cy={y} r="5" fill="white" stroke="#7FAFE0" strokeWidth="2" />
                    <text x={x} y={125} fontSize="9" textAnchor="middle" fill="#94a3b8">{p.label}</text>
                    {p.count > 0 && <text x={x} y={y - 9} fontSize="9" textAnchor="middle" fill="#5D8FCB" fontWeight="bold">{p.count}</text>}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Right Card: Real Metric Tiles */}
        <div className="donor-glass-card p-8 flex flex-col justify-between">
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'My Donations', value: donorDonations.length, color: '#7FAFE0', emoji: '🍱' },
              { label: 'People Served', value: peopleServed || completedDeliveries.length, color: '#FDB1C9', emoji: '🤝' },
              { label: 'Deliveries Done', value: completedDeliveries.length, color: '#A8D5A2', emoji: '✅' },
              { label: 'In Transit', value: donorDeliveries.filter((d) => d.status !== 'delivered').length, color: '#F5C97A', emoji: '🚚' },
            ].map((m) => (
              <div key={m.label} className="rounded-2xl p-4" style={{ background: m.color + '22', border: `1px solid ${m.color}44` }}>
                <p className="text-2xl">{m.emoji}</p>
                <p className="text-2xl font-black text-slate-800 mt-1">{m.value}</p>
                <p className="text-xs font-bold text-slate-500 mt-0.5 uppercase tracking-wide">{m.label}</p>
              </div>
            ))}
          </div>
          <div className="mt-6">
            <div className="flex justify-between text-xs font-bold text-slate-500 mb-2">
              <span>🎯 Weekly Goal</span>
              <span>{progressPct}% · {totalMeals}/{goalMeals} meals</span>
            </div>
            <div className="h-3 w-full rounded-full bg-white/50 border border-white/40 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#F3D1C2] via-[#FDB1C9] to-[#7FAFE0] animate-liquid"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 5. IMPACT STRIP */}
      <div className="donor-glass-card p-6 overflow-hidden relative">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <p className="text-sm font-bold text-slate-700">
            🍽️ You've donated <span className="text-slate-900">{totalMeals}</span> servings · helped <span className="text-slate-900">{peopleServed || completedDeliveries.length}</span> people. Goal: <span className="text-slate-900">{goalMeals}</span> meals.
          </p>
          <p className="text-sm font-black text-slate-800">{progressPct}%</p>
        </div>
        <div className="h-4 w-full rounded-full bg-white/40 border border-white/50 overflow-hidden p-[1px]">
          <div className="h-full rounded-full bg-gradient-to-r from-[#F3D1C2] via-[#FDB1C9] to-[#7FAFE0] bg-[length:200%_100%] animate-liquid" style={{ width: `${progressPct}%` }}></div>
        </div>
      </div>

      {/* 6. MAIN WORKSPACE */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left Panel: Smart Donation Flow — with food image */}
        <div className="donor-glass-panel overflow-hidden min-h-[320px] flex flex-col">
          <div className="relative h-40 w-full overflow-hidden rounded-t-[36px]">
            <img
              src="https://images.unsplash.com/photo-1547592166-23ac45744acd?w=700&q=80"
              alt="Fresh food ready to donate"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-white/70 to-transparent" />
          </div>
          <div className="p-6 flex flex-col flex-1">
            <h3 className="text-lg font-black text-slate-800">Smart Donation Flow</h3>
            <p className="text-xs font-medium text-slate-500 mt-1 mb-4">AI matches your surplus food to the nearest open need automatically.</p>
            {donorDonations.length > 0 ? (
              <div className="space-y-2">
                {donorDonations.slice(0, 3).map((don, i) => (
                  <div key={i} className="flex items-center justify-between rounded-2xl bg-white/60 px-4 py-2.5 border border-white/50">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{don.foodType || 'Food Item'}</p>
                      <p className="text-xs text-slate-500">{don.servings || 1} servings</p>
                    </div>
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                      don.status === 'matched' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                    }`}>{don.status || 'pending'}</span>
                  </div>
                ))}
              </div>
            ) : (
              <button
                onClick={() => {}}
                className="mt-auto self-start flex items-center gap-2 rounded-2xl bg-gradient-to-b from-[#D4AF37]/90 to-[#CD7F32] px-5 py-2.5 text-sm font-bold text-white shadow-md hover:scale-105 transition"
              >
                <Plus size={15} /> Add First Donation
              </button>
            )}
          </div>
        </div>

        {/* Right Panel: Recent Deliveries — with image */}
        <div className="donor-glass-panel overflow-hidden min-h-[320px] flex flex-col">
          <div className="relative h-40 w-full overflow-hidden rounded-t-[36px]">
            <img
              src="https://images.unsplash.com/photo-1593113598332-cd288d649433?w=700&q=80"
              alt="Food delivery in progress"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-white/70 to-transparent" />
          </div>
          <div className="p-6 flex flex-col flex-1">
            <h3 className="text-lg font-black text-slate-800">Recent Deliveries</h3>
            <p className="text-xs font-medium text-slate-500 mt-1 mb-4">Track your food from donation to beneficiary doorstep.</p>
            {donorDeliveries.length > 0 ? (
              <div className="space-y-2">
                {donorDeliveries.slice(0, 3).map((del, i) => (
                  <div key={i} className="flex items-center justify-between rounded-2xl bg-white/60 px-4 py-2.5 border border-white/50">
                    <div>
                      <p className="text-sm font-bold text-slate-800">Delivery #{del.id?.slice(-4) || i + 1}</p>
                      <p className="text-xs text-slate-500">{del.servings || 1} servings</p>
                    </div>
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                      del.status === 'delivered' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                    }`}>{del.status}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm font-medium text-slate-400 mt-auto">No deliveries yet — your first donation creates one automatically.</p>
            )}
          </div>
        </div>
      </div>

      {/* 7. INTELLIGENT FOOTER */}
      <div className="mt-4 flex items-center justify-center">
        <p className="text-xs font-bold tracking-wide text-[#5D8FCB] bg-blue-50/50 backdrop-blur-md px-5 py-2.5 rounded-full border border-blue-100/50 shadow-[0_4px_20px_rgba(93,143,203,0.1)]">
          🔥 Nearby demand detected: Whitefield (2.5 km away)
        </p>
      </div>
    </div>
  );
}

function AgentOverview({ session, deliveries }: { session: Session; deliveries: DeliveryRecord[] }) {
  const activeRuns = deliveries.filter((d) => d.status === 'picked' || d.status === 'in_transit').length;
  const pendingPickups = deliveries.filter((d) => d.status === 'pending' || d.status === 'accepted').length;
  const urgentRuns = deliveries.filter((d) => d.status !== 'delivered' && parseInt(String(d.quantity || '0')) > 50).length;

  return (
    <div className="flex flex-col gap-6 animate-fade-slide pb-12 w-full max-w-5xl mx-auto">
      <div className="donor-glass-panel relative overflow-hidden px-8 py-10 border-l-8 border-l-[#5D8FCB]">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-800">
              {activeRuns + pendingPickups === 0 
                ? 'No active deliveries — you’re on standby' 
                : `${activeRuns + pendingPickups} deliveries need pickup now`}
            </h1>
            <p className="mt-2 text-sm font-bold text-[#5D8FCB] uppercase tracking-widest">
              Mission Execution Panel
            </p>
          </div>
        </div>
      </div>

      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="donor-glass-card p-6 flex flex-col justify-between border-l-4 border-l-[#5D8FCB] hover:-translate-y-1 transition-all">
          <p className="text-2xl">🚚</p>
          <div>
            <p className="text-2xl font-black text-slate-800 mt-2">{activeRuns}</p>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Active Runs</p>
          </div>
        </div>
        <div className="donor-glass-card p-6 flex flex-col justify-between border-l-4 border-l-[#F5C97A] hover:-translate-y-1 transition-all">
          <p className="text-2xl">📦</p>
          <div>
            <p className="text-2xl font-black text-slate-800 mt-2">{pendingPickups}</p>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Pending Pickups</p>
          </div>
        </div>
        <div className="donor-glass-card p-6 flex flex-col justify-between border-l-4 border-l-[#FDB1C9] hover:-translate-y-1 transition-all">
          <p className="text-2xl">⚡</p>
          <div>
            <p className="text-2xl font-black text-slate-800 mt-2">{urgentRuns}</p>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Urgent Runs</p>
          </div>
        </div>
        <div className="donor-glass-card p-6 flex flex-col justify-between border-l-4 border-l-[#A8D5A2] hover:-translate-y-1 transition-all">
          <p className="text-2xl">⏱</p>
          <div>
            <p className="text-2xl font-black text-slate-800 mt-2">32 min</p>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Avg Delivery Time</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function RequestsPanel({ session, needs, donations, deliveries }: { session: Session; needs: NeedRecord[]; donations: DonationRecord[]; deliveries: DeliveryRecord[] }) {
  return session.uiRole === 'donor'
    ? <CustomerRequestsPanel session={session} needs={needs} donations={donations} deliveries={deliveries} />
    : session.uiRole === 'ngo'
      ? <NgoRequestsPanel session={session} needs={needs} deliveries={deliveries} />
      : <AgentRequestsPanel session={session} needs={needs} deliveries={deliveries} />;
}

function NeedsPanel({ session, needs }: { session: Session; needs: NeedRecord[] }) {
  const [mealTypeFilter, setMealTypeFilter] = useState<MealType>('any');
  const [categoryFilter, setCategoryFilter] = useState<FoodCategory>('any');

  const visibleNeeds = needs
    .filter((need) => need.status === 'open' && isNeedCompatible(need, mealTypeFilter, categoryFilter))
    .slice()
    .sort((left, right) => {
      const urgencyDelta = getUrgencyScore(left.urgency) - getUrgencyScore(right.urgency);
      if (urgencyDelta !== 0) return urgencyDelta;
      return left.requiredBefore - right.requiredBefore;
    });

  return (
    <div className="donor-glass-panel p-8 animate-fade-slide">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-[#5D8FCB]">Live Needs</p>
        <h2 className="text-2xl font-black text-slate-800 mt-1">Beneficiary requests near you</h2>
        <p className="text-sm text-slate-500 mt-1">Open needs posted by NGOs — match your donation to the right location.</p>
      </div>

      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 mb-6">
        <label className="block">
          <span className="mb-2 block text-xs font-bold text-slate-600 uppercase tracking-wide">Meal Type</span>
          <select
            value={mealTypeFilter}
            onChange={(event) => setMealTypeFilter(event.target.value as MealType)}
            className="w-full rounded-2xl border border-white/60 bg-white/50 backdrop-blur px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-[#7FAFE0] focus:bg-white/80 focus:ring-4 focus:ring-[#7FAFE0]/20"
          >
            {MEAL_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-bold text-slate-600 uppercase tracking-wide">Food Category</span>
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value as FoodCategory)}
            className="w-full rounded-2xl border border-white/60 bg-white/50 backdrop-blur px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-[#7FAFE0] focus:bg-white/80 focus:ring-4 focus:ring-[#7FAFE0]/20"
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2">
        {visibleNeeds.length > 0
          ? visibleNeeds.map((need) => <NeedCard key={need.id} need={need} allowFulfill={session.uiRole === 'ngo'} />)
          : (
            <div className="col-span-2 rounded-3xl border border-white/60 bg-white/30 backdrop-blur p-8 text-center">
              <p className="text-2xl mb-2">🌿</p>
              <p className="text-sm font-medium text-slate-500">No live needs match your filters right now.</p>
            </div>
          )}
      </div>
    </div>
  );
}

function NgoRequestsPanel({ session, needs, deliveries }: { session: Session; needs: NeedRecord[]; deliveries: DeliveryRecord[] }) {
  const [form, setForm] = useState<NeedFormState>({
    address: '',
    lat: '',
    lng: '',
    peopleCount: '',
    foodType: '',
    mealType: 'any',
    category: 'any',
    urgency: 'high',
    requiredBefore: '',
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);

  const selectedNeedCoordinates = toCoordinates(form.lat, form.lng);

  const detectLocation = () => {
    if (!navigator.geolocation) {
      setNotice('Location detection is not supported in this browser.');
      return;
    }

    setIsDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        console.log('[LAYA] Detected NGO location:', position.coords);
        setForm((current) => ({
          ...current,
          lat: position.coords.latitude.toFixed(6),
          lng: position.coords.longitude.toFixed(6),
          address:
            current.address ||
            `Selected from map (${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)})`,
        }));
        setNotice('Need location detected successfully.');
        setIsDetectingLocation(false);
      },
      (error) => {
        console.error('[LAYA] Geolocation error:', error);
        if (error.code === error.PERMISSION_DENIED) {
          setNotice('Location permission denied. Please allow location access in your browser.');
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setNotice('Unable to determine your position. Please try again or enter coordinates manually.');
        } else if (error.code === error.TIMEOUT) {
          setNotice('Location request timed out. Please try again.');
        } else {
          setNotice('Unable to detect location. Please enter coordinates manually.');
        }
        setIsDetectingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (session.uiRole !== 'ngo') {
      setNotice('Only NGO users can create needs.');
      return;
    }

    const latitude = Number(form.lat);
    const longitude = Number(form.lng);
    const requiredBefore = Date.parse(form.requiredBefore);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setNotice('❌ Please select a location using the map or "Use current location".');
      return;
    }

    if (!Number.isFinite(requiredBefore)) {
      setNotice('❌ Please specify a Valid Till Date.');
      return;
    }

    try {
      const currentUserId = session.uid || session.email;
      const newNeedData = {
        ngoId: currentUserId,
        ngoName: session.name,
        location: { lat: latitude, lng: longitude, address: form.address },
        peopleCount: Number(form.peopleCount),
        foodType: form.foodType,
        mealType: form.mealType,
        category: form.category,
        urgency: form.urgency,
        requiredBefore,
      };

      console.log('[LAYA] Creating need for NGO:', currentUserId, newNeedData);
      await createNeed(newNeedData);

      setForm({ address: '', lat: '', lng: '', peopleCount: '', foodType: '', mealType: 'any', category: 'any', urgency: 'high', requiredBefore: '' });
      setNotice('✅ Request created successfully.');
    } catch (error) {
      setNotice(error instanceof Error ? `❌ ${error.message}` : '❌ Unable to create request.');
    }
  };

  const currentUserId = session.uid || session.email;
  const myNeeds = needs.filter((need) => need.ngoId === currentUserId);
  const activeNeeds = myNeeds.filter((need) => need.status === 'open' || need.status === 'assigned');
  const ngoNeedIds = new Set(myNeeds.map((need) => need.id));
  const incomingDeliveries = deliveries.filter((delivery) => ngoNeedIds.has(delivery.needId) && delivery.status !== 'delivered');

  const markFulfilled = async (needId: string) => {
    try {
      await updateNeed(needId, { status: 'fulfilled' });
      setNotice('Need marked as fulfilled.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to update need.');
    }
  };

  return (
    <div className="grid w-full gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <div className="w-full rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <SectionTitle eyebrow="Post Need" title="Create a beneficiary request" text="Only NGO users can post live needs that donors and delivery agents can match against." />
        <div className="mt-4">
          <button type="button" className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
            <Plus size={14} />
            + Create Need
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
          <SimpleInput label="Location Address" value={form.address} onChange={(value) => setForm({ ...form, address: value })} placeholder="School hall, shelter, relief center" />
          <SimpleInput label="People Count" value={form.peopleCount} onChange={(value) => setForm({ ...form, peopleCount: value })} placeholder="120" />
          <SimpleInput label="Latitude" value={form.lat} onChange={(value) => setForm({ ...form, lat: value })} placeholder="12.9716" />
          <SimpleInput label="Longitude" value={form.lng} onChange={(value) => setForm({ ...form, lng: value })} placeholder="77.5946" />

          <div className="sm:col-span-2">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-800">Select location from map</p>
              <button
                type="button"
                onClick={() => setShowMapPicker((current) => !current)}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                <MapPin size={14} />
                {showMapPicker ? 'Hide map' : 'Open map picker'}
              </button>
            </div>
            {showMapPicker ? (
              <LocationPickerMap
                selected={selectedNeedCoordinates}
                onSelect={(coords) => {
                  setForm((current) => ({
                    ...current,
                    lat: coords.lat.toFixed(6),
                    lng: coords.lng.toFixed(6),
                    address: current.address || `Selected from map (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`,
                  }));
                  setNotice('Location selected from map.');
                }}
              />
            ) : null}
          </div>

          <label className="block sm:col-span-2">
            <span className="mb-2 block text-sm font-semibold text-slate-800">Food Type</span>
            <input
              type="text"
              required
              value={form.foodType}
              onChange={(event) => setForm({ ...form, foodType: event.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
              placeholder="Prepared meals, bread, dry groceries"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-800">Meal Type</span>
            <select
              value={form.mealType}
              onChange={(event) => setForm({ ...form, mealType: event.target.value as MealType })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            >
              {MEAL_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-800">Category</span>
            <select
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value as FoodCategory })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-800">Priority</span>
            <select
              value={form.urgency}
              onChange={(event) => setForm({ ...form, urgency: event.target.value as NeedUrgency })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-800">Valid Till</span>
            <input
              type="datetime-local"
              required
              value={form.requiredBefore}
              onChange={(event) => setForm({ ...form, requiredBefore: event.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            />
          </label>

          <div className="sm:col-span-2 flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={detectLocation}
                disabled={isDetectingLocation}
                className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <LocateFixed size={14} />
                {isDetectingLocation ? 'Detecting...' : 'Use current location'}
              </button>
            </div>

            {notice && (
              <div className={`rounded-xl p-4 text-sm font-bold border ${notice.startsWith('✅') ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                {notice}
              </div>
            )}

            <button type="submit" className="w-full flex items-center justify-center gap-2 rounded-[24px] bg-gradient-to-r from-[#D4AF37] to-[#CD7F32] px-8 py-4 text-sm font-bold text-white shadow-[0_8px_24px_rgba(205,127,50,0.3)] hover:-translate-y-1 hover:shadow-[0_12px_30px_rgba(205,127,50,0.4)] transition-all">
              <Plus size={18} /> Create Request
            </button>
          </div>
        </form>
      </div>

      <div className="w-full rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <SectionTitle eyebrow="Active Needs" title="Live needs and incoming deliveries" text="Monitor open needs and incoming deliveries routed to need locations." />
        <div className="mt-6 space-y-3">
          {activeNeeds.length > 0 ? activeNeeds.map((need) => <NeedCard key={need.id} need={need} allowFulfill onFulfill={() => markFulfilled(need.id)} />) : <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">No active needs yet.</div>}
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Incoming Deliveries</h3>
          <div className="mt-3 space-y-3">
            {incomingDeliveries.length > 0 ? incomingDeliveries.map((delivery) => <ShipmentCard key={delivery.id} delivery={delivery} session={session} />) : <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">No incoming deliveries for this NGO yet.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function CustomerRequestsPanel({ session, needs, donations, deliveries }: { session: Session; needs: NeedRecord[]; donations: DonationRecord[]; deliveries: DeliveryRecord[] }) {
  const [form, setForm] = useState<DonationFormState>({
    foodType: '',
    mealType: 'any',
    category: 'any',
    quantity: '',
    pickupLocation: '',
    pickupLat: '',
    pickupLng: '',
    expiryTime: 'within-2-hours',
    notificationEnabled: true,
    notes: '',
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [now, setNow] = useState(Date.now());
  const shownExpiredNotifications = useRef<Set<string>>(new Set());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const detectPickupLocation = () => {
    if (!navigator.geolocation) {
      setNotice('Location detection is not supported in this browser.');
      return;
    }

    setIsDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        console.log('[LAYA] Detected pickup location:', position.coords);
        setForm((current) => ({
          ...current,
          pickupLat: position.coords.latitude.toFixed(6),
          pickupLng: position.coords.longitude.toFixed(6),
          pickupLocation: current.pickupLocation || 'Current location',
        }));
        setNotice('Pickup location detected successfully.');
        setIsDetectingLocation(false);
      },
      (error) => {
        console.error('[LAYA] Geolocation error:', error);
        if (error.code === error.PERMISSION_DENIED) {
          setNotice('Location permission denied. Please allow location access in your browser.');
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setNotice('Unable to determine your position. Please try again or enter it manually.');
        } else if (error.code === error.TIMEOUT) {
          setNotice('Location request timed out. Please try again.');
        } else {
          setNotice('Unable to detect your location. Please enter it manually.');
        }
        setIsDetectingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
  };

  const myDeliveries = deliveries.filter((delivery) => delivery.donorId === session.email);
  const myDonations = donations.filter((donation) => donation.donorId === session.email);
  const myActiveDonations = myDonations.filter((donation) => donation.status === 'pending' || donation.status === 'assigned');
  const donorCoordinates = toCoordinates(form.pickupLat, form.pickupLng);
  const needsMap = needs.reduce<Record<string, NeedRecord>>((accumulator, need) => {
    accumulator[need.id] = need;
    return accumulator;
  }, {});

  const prevDonationStatusRef = useRef<Record<string, string>>({});
  const shownAssignedNotifications = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!session) return;

    donations.forEach((donation) => {
      if (donation.donorId !== session.email) return;

      const prev = prevDonationStatusRef.current[donation.id];
      if (
        prev === 'pending' &&
        donation.status === 'assigned' &&
        donation.notificationEnabled &&
        !shownAssignedNotifications.current.has(donation.id)
      ) {
        const addr = donation.assignedNeedId ? (needsMap[donation.assignedNeedId]?.location.address || donation.assignedNeedId) : 'an NGO';
        setNotice(`✅ Matched to ${addr}`);
        shownAssignedNotifications.current.add(donation.id);
      }

      if (
        prev !== 'expired' &&
        donation.status === 'expired' &&
        donation.notificationEnabled &&
        !shownExpiredNotifications.current.has(donation.id)
      ) {
        setNotice('⚠ Your food donation has expired and is no longer available for delivery.');
        shownExpiredNotifications.current.add(donation.id);
      }

      prevDonationStatusRef.current[donation.id] = donation.status;
    });
  }, [donations, session, needsMap]);

  const submitDonation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.expiryTime) {
      setNotice('Please select an expiry time for your donation.');
      return;
    }

    const expiryTimeStamp = convertExpiryTimeToTimestamp(form.expiryTime);
    if (expiryTimeStamp <= Date.now()) {
      setNotice('Expiry time must be in the future.');
      return;
    }

    const pickupCoordinates = donorCoordinates;

    try {
      // Always create donation (pending)
      const donationId = await createDonationRecord({
        donorId: session.email,
        foodType: form.foodType,
        mealType: form.mealType,
        category: form.category,
        quantity: form.quantity,
        expiryTime: expiryTimeStamp,
        location: {
          address: form.pickupLocation,
          lat: pickupCoordinates?.lat ?? 0,
          lng: pickupCoordinates?.lng ?? 0,
        },
        status: 'pending',
        assignedNeedId: '',
      });

      // Try an immediate match locally for quicker UX
      const selectedNeed = selectBestNeedByScore(needs.filter((need) => need.status === 'open'), pickupCoordinates, form.mealType, form.category, expiryTimeStamp);

      if (selectedNeed) {
        // mark donation assigned
        await updateDonation(donationId, { status: 'assigned', assignedNeedId: selectedNeed.id });

        await createDelivery({
          donorId: session.email,
          donorName: session.name,
          ngoId: selectedNeed.ngoId,
          agentId: null,
          donationId,
          pickupLocation: {
            address: form.pickupLocation,
            lat: pickupCoordinates?.lat ?? 0,
            lng: pickupCoordinates?.lng ?? 0,
          },
          dropLocation: selectedNeed.location,
          needId: selectedNeed.id,
          agentLocation: null,
          foodType: form.foodType,
          mealType: form.mealType,
          category: form.category,
          quantity: form.quantity,
          status: 'pending',
        });

        await updateNeed(selectedNeed.id, { status: 'assigned' });
        setNotice(`✅ Matched to ${selectedNeed.location.address}`);
      } else {
        setNotice('⏳ No matching need yet. We\'ll notify you when a request appears.');
      }

      setForm({ foodType: '', mealType: 'any', category: 'any', quantity: '', pickupLocation: '', pickupLat: '', pickupLng: '', expiryTime: 'within-2-hours', notificationEnabled: true, notes: '' });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to create donation.');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="donor-glass-panel p-8 animate-fade-slide">
        <p className="text-xs font-bold uppercase tracking-widest text-[#5D8FCB] mb-1">Donate Food</p>
        <h2 className="text-2xl font-black text-slate-800 mb-6">Match surplus before it expires</h2>
        <form onSubmit={submitDonation} className="mt-6 grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
          <SimpleInput label="Food Type" value={form.foodType} onChange={(value) => setForm({ ...form, foodType: value })} placeholder="Prepared meals, bread, groceries" />
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-800">Meal Type</span>
            <select
              value={form.mealType}
              onChange={(event) => setForm({ ...form, mealType: event.target.value as MealType })}
              className="w-full rounded-2xl border border-white/60 bg-white/50 backdrop-blur px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-[#7FAFE0] focus:bg-white/80 focus:ring-4 focus:ring-[#7FAFE0]/20"
            >
              {MEAL_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-800">Category</span>
            <select
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value as FoodCategory })}
              className="w-full rounded-2xl border border-white/60 bg-white/50 backdrop-blur px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-[#7FAFE0] focus:bg-white/80 focus:ring-4 focus:ring-[#7FAFE0]/20"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <SimpleInput label="Quantity" value={form.quantity} onChange={(value) => setForm({ ...form, quantity: value })} placeholder="25 meals" />
          <SimpleInput label="Pickup Location" value={form.pickupLocation} onChange={(value) => setForm({ ...form, pickupLocation: value })} placeholder="Restaurant, home kitchen, shop" />
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-800">Expiry Time (when food will expire)</span>
            <select
              value={form.expiryTime}
              onChange={(event) => setForm({ ...form, expiryTime: event.target.value as 'within-1-hour' | 'within-2-hours' | 'within-4-hours' | 'today' })}
              className="w-full rounded-2xl border border-white/60 bg-white/50 backdrop-blur px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-[#7FAFE0] focus:bg-white/80 focus:ring-4 focus:ring-[#7FAFE0]/20"
            >
              {EXPIRY_TIME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <SimpleInput label="Pickup Latitude" value={form.pickupLat} onChange={(value) => setForm({ ...form, pickupLat: value })} placeholder="12.9716" />
          <SimpleInput label="Pickup Longitude" value={form.pickupLng} onChange={(value) => setForm({ ...form, pickupLng: value })} placeholder="77.5946" />

          <label className="block sm:col-span-2">
            <span className="mb-2 block text-sm font-semibold text-slate-800">Notes</span>
            <textarea
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              className="min-h-24 w-full rounded-2xl border border-white/60 bg-white/50 backdrop-blur px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#7FAFE0] focus:bg-white/80 focus:ring-4 focus:ring-[#7FAFE0]/20"
              placeholder="Food safety notes, special handling, or donor instructions"
            />
          </label>

          <label className="block sm:col-span-2">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={form.notificationEnabled}
                onChange={(e) => setForm({ ...form, notificationEnabled: e.target.checked })}
                className="h-4 w-4 rounded border-slate-200 text-cyan-600"
              />
              <span className="text-sm text-slate-800">Notify me when matched</span>
            </div>
          </label>

          <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={detectPickupLocation}
              disabled={isDetectingLocation}
              className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LocateFixed size={14} />
              {isDetectingLocation ? 'Detecting...' : 'Use current location'}
            </button>
            {notice ? <p className="text-sm text-slate-600">{notice}</p> : null}
          </div>

          <button type="submit" className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-[#D4AF37]/90 to-[#CD7F32] px-6 py-3 text-sm font-bold text-white shadow-md hover:scale-105 transition sm:col-span-2">
            <Plus size={16} />
            Match and Deliver
          </button>
        </form>
      </div>

      <div className="w-full rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <SectionTitle eyebrow="My Donations" title="Your donations" text="See pending donations and their match status. Cancel a pending donation anytime." />
        <p className="mt-3 text-sm text-slate-500">Active donations: {myActiveDonations.length} (pending or matched)</p>

        <div className="mt-4 space-y-3">
          {myDonations.length === 0 ? (
            <div className="rounded-3xl border border-white/60 bg-white/30 backdrop-blur p-8 text-center">
              <p className="text-2xl mb-2">🍱</p>
              <p className="text-sm font-medium text-slate-500">No donations yet — add your first above.</p>
            </div>
          ) : (
            myDonations.map((donation) => {
              const isExpired = donation.status === 'expired';
              const timeLeftMinutes = Math.max(0, Math.round((donation.expiryTime - now) / (1000 * 60)));
              const expiryLabel = isExpired
                ? `Expired at ${new Date(donation.expiryTime).toLocaleTimeString()}`
                : `Expires in ${timeLeftMinutes > 0 ? `${timeLeftMinutes} min` : 'less than 1 min'}`;

              return (
                <div
                  key={donation.id}
                  className={`rounded-2xl border p-3 text-sm ${isExpired ? 'border-slate-200 bg-slate-100 text-slate-500 opacity-80' : 'border-slate-200 bg-slate-50 text-slate-900'}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{donation.foodType}</p>
                      <p className="mt-1 text-slate-600">Quantity: {donation.quantity}</p>
                      <p className="mt-1 text-xs text-slate-500">Pickup: {donation.location.address}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-medium ${isExpired ? 'text-rose-700' : 'text-slate-700'}`}>{donation.status === 'expired' ? 'Expired ❌' : donation.status}</p>
                      {donation.status === 'pending' ? (
                        <p className="text-xs text-slate-500">Waiting for match</p>
                      ) : donation.status === 'assigned' ? (
                        <p className="text-xs text-slate-500">Matched to: {donation.assignedNeedId ? (needsMap[donation.assignedNeedId]?.location.address || donation.assignedNeedId) : 'Assigned'}</p>
                      ) : donation.status === 'expired' ? (
                        <p className="text-xs text-rose-600">Expired</p>
                      ) : null}
                      <p className="mt-1 text-xs text-slate-400">{expiryLabel}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                  <div className="text-xs text-slate-500">Created: {new Date(donation.createdAt).toLocaleString()}</div>
                  <div>
                    {donation.status === 'pending' ? (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await updateDonation(donation.id, { status: 'cancelled' });
                            setNotice('Donation cancelled.');
                          } catch {
                            setNotice('Unable to cancel donation.');
                          }
                        }}
                        className="inline-flex items-center gap-2 rounded-2xl bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700"
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            )})
          )}
        </div>

        <div className="mt-6 space-y-3">
          {myDeliveries.length > 0 ? myDeliveries.slice(0, 4).map((delivery) => <ShipmentCard key={delivery.id} delivery={delivery} session={session} />) : <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">No deliveries have been matched yet.</div>}
        </div>
      </div>
    </div>
  );
}

function AgentRequestsPanel({ session, needs, deliveries }: { session: Session; needs: NeedRecord[]; deliveries: DeliveryRecord[] }) {
  const [notice, setNotice] = useState<string | null>(null);
  const [approvedDeliveries, setApprovedDeliveries] = useState<Record<string, boolean>>({});
  const currentUserId = session.uid || session.email;
  const needsById = needs.reduce<Record<string, NeedRecord>>((accumulator, need) => {
    accumulator[need.id] = need;
    return accumulator;
  }, {});

  const visibleAssignments = deliveries
    .filter((delivery) => delivery.status !== 'delivered' && (delivery.agentId == null || delivery.agentId === currentUserId || delivery.agentId === 'unassigned'))
    .sort((left, right) => {
      const order: Record<DeliveryStatus, number> = { pending: 0, accepted: 1, picked: 2, in_transit: 3, delivered: 4 };
      return order[left.status] - order[right.status];
    });

  const liveAssignmentIdsRef = useRef<string[]>([]);

  useEffect(() => {
    liveAssignmentIdsRef.current = deliveries
      .filter((delivery) => delivery.agentId === currentUserId && delivery.status !== 'delivered')
      .map((delivery) => delivery.id);
  }, [deliveries, currentUserId]);

  useEffect(() => {
    if (session.uiRole !== 'volunteer' || typeof navigator === 'undefined' || !navigator.geolocation) {
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const agentLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          address: 'Live agent location',
          updatedAt: Date.now(),
        };

        liveAssignmentIdsRef.current.forEach((deliveryId) => {
          void updateDelivery(deliveryId, { agentLocation });
        });
      },
      () => {
        setNotice('Enable location sharing to keep live delivery tracking updated.');
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 15000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [currentUserId, session.uiRole]);

  const updateStatus = async (delivery: DeliveryRecord, nextStatus: 'accepted' | 'picked' | 'in_transit' | 'delivered') => {
    try {
      if (nextStatus === 'delivered') {
        await updateDelivery(delivery.id, { status: 'delivered', agentId: currentUserId, deliveredAt: Date.now() });
        await updateDonation(delivery.donationId, { status: 'completed' });
        await updateNeed(delivery.needId, { status: 'fulfilled' });
        setNotice('Delivery completed and synced across donor and NGO dashboards.');
        return;
      }

      await updateDelivery(delivery.id, {
        status: nextStatus,
        agentId: currentUserId,
      });

      setNotice(nextStatus === 'accepted' ? 'Delivery accepted.' : `Delivery marked as ${nextStatus.replace('_', ' ')}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to update delivery.');
    }
  };

  if (visibleAssignments.length === 0) {
    return (
      <div className="donor-glass-panel p-12 text-center max-w-4xl mx-auto animate-fade-slide">
        <p className="text-4xl mb-4">📍</p>
        <p className="text-xl font-black text-slate-800">No pickups right now</p>
        <p className="text-sm font-bold text-slate-500 mt-2">New requests will appear here instantly</p>
      </div>
    );
  }

  return (
    <div className="donor-glass-panel p-8 max-w-5xl mx-auto animate-fade-slide">
      <p className="text-xs font-bold uppercase tracking-widest text-[#5D8FCB] mb-1">Pickup Queue</p>
      <h2 className="text-2xl font-black text-slate-800 mb-6">Available Assignments</h2>
      {notice ? <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{notice}</div> : null}

      <div className="space-y-4">
        {visibleAssignments.map((delivery) => {
          const need = needsById[delivery.needId];
          const currentPoint = delivery.agentLocation || delivery.pickupLocation;
          const distanceKm = calculateDistanceKm(currentPoint ? { lat: currentPoint.lat, lng: currentPoint.lng } : null, { lat: delivery.dropLocation.lat, lng: delivery.dropLocation.lng });
          const urgencyTone = need?.urgency === 'high' ? 'bg-rose-100 text-rose-700 border-rose-200' : need?.urgency === 'medium' ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200';

          return (
            <div key={delivery.id} className="donor-glass-card p-6 flex flex-col lg:flex-row gap-6 border border-white/60 hover:-translate-y-1 transition-all">
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-3 py-1 border text-xs font-black ${urgencyTone}`}>
                    {need?.urgency ? `⚡ ${need.urgency.toUpperCase()}` : '⚡ URGENT'}
                  </span>
                  <span className="text-xs font-bold text-[#5D8FCB] uppercase tracking-wide">#{delivery.id.slice(-6)}</span>
                </div>
                
                <p className="text-xl font-black text-slate-800">{delivery.foodType || 'Food delivery'}</p>
                
                <div className="grid gap-3 sm:grid-cols-2 mt-2">
                  <div className="flex items-start gap-2">
                    <Building2 size={16} className="text-emerald-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Pickup</p>
                      <p className="text-sm font-semibold text-slate-700 leading-tight">{delivery.pickupLocation.address}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin size={16} className="text-cyan-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Drop</p>
                      <p className="text-sm font-semibold text-slate-700 leading-tight">{delivery.dropLocation.address}</p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 mt-2">
                  <p className="text-sm font-bold text-slate-600"><span className="text-slate-400 mr-1">📦 Qty:</span>{delivery.quantity || 'Unknown'}</p>
                  <p className="text-sm font-bold text-slate-600"><span className="text-slate-400 mr-1">📏 Dist:</span>{Number.isFinite(distanceKm) ? `${distanceKm.toFixed(1)} km` : '—'}</p>
                </div>
              </div>

              <div className="flex flex-col gap-3 lg:w-[240px] shrink-0 justify-center">
                  {delivery.agentId == null ? (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await acceptDeliveryAssignment(delivery.id, currentUserId);
                          openGoogleMapsRoute({ lat: delivery.pickupLocation.lat, lng: delivery.pickupLocation.lng });
                          setNotice('Delivery accepted and assigned to you.');
                        } catch (error) {
                          setNotice(error instanceof Error ? error.message : 'Unable to accept delivery.');
                        }
                      }}
                      className="w-full rounded-2xl bg-gradient-to-r from-[#D4AF37] to-[#CD7F32] py-4 text-sm font-black text-white shadow-[0_8px_20px_rgba(205,127,50,0.3)] hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(205,127,50,0.4)] transition-all"
                    >
                      ACCEPT MISSION
                    </button>
                  ) : null}

                  {delivery.agentId === currentUserId ? (
                    <>
                      {delivery.status === 'accepted' ? (
                        <button type="button" onClick={() => updateStatus(delivery, 'picked')} className="w-full rounded-2xl bg-white/60 border border-[#5D8FCB]/40 py-4 text-sm font-black text-[#1F548C] hover:bg-white transition-all shadow-sm">
                          Confirm Pickup
                        </button>
                      ) : null}

                      {delivery.status === 'picked' ? (
                        <button
                          type="button"
                          onClick={() => {
                            openGoogleMapsRoute({ lat: delivery.dropLocation.lat, lng: delivery.dropLocation.lng });
                            void updateStatus(delivery, 'in_transit');
                          }}
                          className="w-full rounded-2xl bg-white/60 border border-[#5D8FCB]/40 py-4 text-sm font-black text-[#1F548C] hover:bg-white transition-all shadow-sm"
                        >
                          Start Transit
                        </button>
                      ) : null}

                      {delivery.status === 'in_transit' ? (
                        <div className="w-full flex flex-col gap-3">
                          <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors">
                            <input
                              type="checkbox"
                              checked={!!approvedDeliveries[delivery.id]}
                              onChange={(e) => setApprovedDeliveries({ ...approvedDeliveries, [delivery.id]: e.target.checked })}
                              className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                            />
                            <span className="text-sm font-semibold text-slate-700">Beneficiary approved & agreed to receive</span>
                          </label>
                          <button
                            type="button"
                            disabled={!approvedDeliveries[delivery.id]}
                            onClick={() => updateStatus(delivery, 'delivered')}
                            className="w-full rounded-2xl bg-gradient-to-r from-[#10b981] to-[#059669] py-4 text-sm font-black text-white shadow-[0_8px_20px_rgba(16,185,129,0.3)] hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(16,185,129,0.4)] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none transition-all"
                          >
                            CONFIRM DELIVERY
                          </button>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FoodConditionGauge({ score }: { score: number }) {
  const rotation = -90 + (score / 100) * 180;
  const color = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
  const label = score >= 80 ? 'Safe' : score >= 50 ? 'Deliver Soon' : 'Critical';
  
  return (
    <div className="flex flex-col items-center justify-center p-4">
      <div className="relative w-32 h-16 overflow-hidden drop-shadow-sm">
        <div className="absolute top-0 left-0 w-32 h-32 rounded-full border-[12px] border-slate-200" />
        <div 
          className="absolute top-0 left-0 w-32 h-32 rounded-full border-[12px] border-b-transparent border-l-transparent transition-all duration-1000 ease-out"
          style={{ borderColor: color, transform: `rotate(${rotation}deg)` }}
        />
      </div>
      <p className="mt-1 text-2xl font-black drop-shadow-sm" style={{ color }}>{score}%</p>
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</p>
    </div>
  );
}

function DecayTimer({ initialMinutes }: { initialMinutes: number }) {
  const [mins, setMins] = useState(initialMinutes > 0 ? initialMinutes : 120);
  useEffect(() => {
    const int = setInterval(() => setMins(m => Math.max(0, m - 1)), 60000);
    return () => clearInterval(int);
  }, []);
  const progress = (mins / 120) * 100;

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex justify-between items-end">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Food Safety Window</span>
        <span className="text-xl font-black text-slate-800">{mins}m left</span>
      </div>
      <div className="h-4 w-full bg-slate-200/50 rounded-full overflow-hidden shadow-inner p-0.5">
        <div className="h-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-400 rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, progress)}%` }} />
      </div>
    </div>
  );
}

function VolunteerActiveDeliveryPanel({ session, deliveries, compact = false }: { session: Session; deliveries: DeliveryRecord[]; compact?: boolean }) {
  const currentUserId = session.uid || session.email;
  const activeDelivery = deliveries
    .filter((delivery) => delivery.agentId === currentUserId && delivery.status !== 'delivered')
    .sort((left, right) => right.createdAt - left.createdAt)[0];

  if (!activeDelivery) {
    return (
      <div className={`${compact ? '' : 'donor-glass-panel p-12 text-center max-w-4xl mx-auto animate-fade-slide'}`}>
        {!compact ? (
          <>
            <p className="text-4xl mb-4">📍</p>
            <p className="text-xl font-black text-slate-800">No active deliveries</p>
            <p className="text-sm font-bold text-slate-500 mt-2">You are currently on standby.</p>
          </>
        ) : <div className="text-sm text-slate-500">No active delivery.</div>}
      </div>
    );
  }

  const currentPoint = activeDelivery.agentLocation || activeDelivery.pickupLocation;
  const distanceKm = calculateDistanceKm(
    currentPoint ? { lat: currentPoint.lat, lng: currentPoint.lng } : null,
    { lat: activeDelivery.dropLocation.lat, lng: activeDelivery.dropLocation.lng }
  );
  const stepIndex = DELIVERY_STATUS_STEPS.indexOf(activeDelivery.status as DeliveryStatus);
  const score = Math.max(10, 100 - (Date.now() - activeDelivery.createdAt) / 600000); 

  return (
    <div className={`${compact ? '' : 'donor-glass-panel p-8 max-w-5xl mx-auto animate-fade-slide'}`}>
      {!compact && <p className="text-xs font-bold uppercase tracking-widest text-[#5D8FCB] mb-1">In Transit</p>}
      {!compact && <h2 className="text-2xl font-black text-slate-800 mb-6">Real-Time Execution</h2>}

      <div className="grid grid-cols-1 md:grid-cols-[1fr_250px] gap-6">
        <div className="flex flex-col gap-6">
          <div className="donor-glass-card p-4 flex justify-between items-center relative">
            <div className="absolute top-1/2 left-4 right-4 h-1 bg-slate-200/50 -z-10 -translate-y-1/2 rounded-full"></div>
            {DELIVERY_STATUS_STEPS.map((step) => {
              const index = DELIVERY_STATUS_STEPS.indexOf(step);
              const active = index === stepIndex;
              const completed = index < stepIndex;
              return (
                <div key={step} className={`px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all duration-500 ${active ? 'bg-cyan-500 text-white shadow-[0_0_15px_rgba(6,182,212,0.5)] scale-110 animate-pulse' : completed ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                  {step.replace('_', ' ')}
                </div>
              );
            })}
          </div>


          <div className="donor-glass-card p-6">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Route Info</p>
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <Building2 size={20} className="text-emerald-500 mt-1 shrink-0" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Pickup</p>
                  <p className="text-lg font-bold text-slate-800 leading-tight">{activeDelivery.pickupLocation.address}</p>
                </div>
              </div>
              <div className="ml-2.5 w-0.5 h-6 bg-gradient-to-b from-emerald-500 to-cyan-500 rounded-full"></div>
              <div className="flex items-start gap-3">
                <MapPin size={20} className="text-cyan-500 mt-1 shrink-0" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Drop-off</p>
                  <p className="text-lg font-bold text-slate-800 leading-tight">{activeDelivery.dropLocation.address}</p>
                </div>
              </div>
            </div>
            
            <div className="flex gap-6 mt-6 pt-4 border-t border-slate-200/50">
              <p className="text-sm font-bold text-slate-600"><span className="text-slate-400 mr-2 uppercase tracking-wider text-xs">Quantity</span>{activeDelivery.quantity || 'N/A'}</p>
              <p className="text-sm font-bold text-slate-600"><span className="text-slate-400 mr-2 uppercase tracking-wider text-xs">Distance</span>{Number.isFinite(distanceKm) ? `${distanceKm.toFixed(1)} km` : '—'}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="donor-glass-card p-4 flex justify-center items-center">
            <FoodConditionGauge score={Math.min(100, Math.floor(score))} />
          </div>
          <div className="donor-glass-card p-6 flex flex-col justify-center">
            <DecayTimer initialMinutes={120 - Math.floor((Date.now() - activeDelivery.createdAt)/60000)} />
          </div>
        </div>

        <div className="mt-6">
          <DynamicOptimizationMap 
            source={{ lat: activeDelivery?.pickupLocation?.lat || 0, lng: activeDelivery?.pickupLocation?.lng || 0 }}
            destination={{ lat: activeDelivery?.dropLocation?.lat || 0, lng: activeDelivery?.dropLocation?.lng || 0 }}
          />
        </div>
      </div>
    </div>
  );
}

function VolunteerHistoryPanel({ session, deliveries }: { session: Session; deliveries: DeliveryRecord[] }) {
  const currentUserId = session.uid || session.email;
  const completedDeliveries = deliveries
    .filter((delivery) => delivery.agentId === currentUserId && delivery.status === 'delivered')
    .sort((left, right) => right.createdAt - left.createdAt);

  return (
    <div className="donor-glass-panel p-8 max-w-5xl mx-auto animate-fade-slide">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[#5D8FCB] mb-1">Completed Runs</p>
          <h2 className="text-2xl font-black text-slate-800">History</h2>
        </div>
        <div className="bg-white/60 border border-white px-4 py-3 rounded-2xl shadow-sm text-right min-w-[140px]">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Avg Time Today</p>
          <p className="text-lg font-black text-emerald-600 leading-tight mt-1">32 min</p>
        </div>
      </div>

      <div className="space-y-4">
        {completedDeliveries.length > 0 ? completedDeliveries.map((delivery) => (
          <div key={delivery.id} className="donor-glass-card p-4 sm:p-6 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between border border-white/60 hover:-translate-y-1 transition-all">
            <div className="flex items-center gap-4">
               <div className="bg-emerald-100 p-3 rounded-full shrink-0 border border-emerald-200">
                 <CheckCircle2 size={24} className="text-emerald-600" />
               </div>
               <div>
                 <p className="text-sm font-black text-slate-800">{delivery.foodType || 'Food delivery'}</p>
                 <p className="text-xs font-semibold text-slate-500 mt-1">{delivery.pickupLocation.address.split(',')[0]} → {delivery.dropLocation.address.split(',')[0]}</p>
                 <p className="text-xs font-semibold text-slate-400 mt-1">{new Date(delivery.deliveredAt || delivery.createdAt).toLocaleString()}</p>
               </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
               <div className="text-right hidden sm:block">
                 <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Duration</p>
                 <p className="text-sm font-black text-slate-700 mt-0.5">~ 28 min</p>
               </div>
               <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-[10px] font-black text-emerald-700 border border-emerald-200 shadow-sm uppercase tracking-wider">
                 Success
               </span>
            </div>
          </div>
        )) : <div className="donor-glass-card p-12 text-center text-slate-500 font-semibold border border-white/60">No completed runs yet.</div>}
      </div>
    </div>
  );
}

function TrackingPanel({ session, donations, deliveries }: { session: Session; donations: DonationRecord[]; deliveries: DeliveryRecord[] }) {
  const myDeliveries = session.uiRole === 'donor'
    ? deliveries.filter((d) => d.donorId === session.email)
    : deliveries.slice(0, 3);
  const activeDonations = donations.filter((donation) => donation.status !== 'completed').length;

  if (session.uiRole !== 'donor') {
    // Non-donor tracking (unchanged white panel)
    const accent = session.uiRole === 'ngo' ? 'from-emerald-50 to-teal-50' : 'from-amber-50 to-orange-50';
    return (
      <div className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <SectionTitle eyebrow="Delivery Tracking" title={session.uiRole === 'ngo' ? 'Follow need-based handoffs' : 'Plan your route checkpoints'} text="A simple tracking layout keeps the delivery flow easy to understand." />
        <div className={`mt-6 rounded-[2rem] border border-slate-200 bg-gradient-to-br ${accent} p-6`}>
          <div className="grid w-full gap-4 xl:grid-cols-2">
            <div>
              <h3 className="text-2xl font-bold tracking-tight text-slate-900">{session.uiRole === 'ngo' ? 'Need location tracking' : 'Delivery route overview'}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">Active: {activeDonations}</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {deliveries.slice(0, 3).length > 0 ? deliveries.slice(0, 3).map((d) => <ShipmentCard key={d.id} delivery={d} session={session} />) : <div className="rounded-3xl border border-white/70 bg-white/85 p-4 text-sm text-slate-500">No deliveries yet.</div>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Donor glass tracking
  return (
    <div className="donor-glass-panel p-8 animate-fade-slide">
      <p className="text-xs font-bold uppercase tracking-widest text-[#5D8FCB] mb-1">Delivery Tracking</p>
      <h2 className="text-2xl font-black text-slate-800 mb-6">Monitor your deliveries</h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total', value: myDeliveries.length, color: '#7FAFE0', emoji: '📦' },
          { label: 'In Transit', value: myDeliveries.filter((d) => d.status === 'in-transit' || d.status === 'picked-up').length, color: '#FDB1C9', emoji: '🚚' },
          { label: 'Delivered', value: myDeliveries.filter((d) => d.status === 'delivered').length, color: '#A8D5A2', emoji: '✅' },
          { label: 'Pending', value: myDeliveries.filter((d) => d.status === 'pending').length, color: '#F5C97A', emoji: '⏳' },
        ].map((m) => (
          <div key={m.label} className="rounded-2xl p-4" style={{ background: m.color + '22', border: `1px solid ${m.color}44` }}>
            <p className="text-xl">{m.emoji}</p>
            <p className="text-2xl font-black text-slate-800 mt-1">{m.value}</p>
            <p className="text-xs font-bold text-slate-500 mt-0.5 uppercase tracking-wide">{m.label}</p>
          </div>
        ))}
      </div>

      {myDeliveries.filter(d => d.status !== 'delivered').length > 0 && (
        <div className="mb-8">
          <DynamicOptimizationMap 
            source={{ lat: myDeliveries.filter(d => d.status !== 'delivered')[0]?.pickupLocation?.lat || 0, lng: myDeliveries.filter(d => d.status !== 'delivered')[0]?.pickupLocation?.lng || 0 }}
            destination={{ lat: myDeliveries.filter(d => d.status !== 'delivered')[0]?.dropLocation?.lat || 0, lng: myDeliveries.filter(d => d.status !== 'delivered')[0]?.dropLocation?.lng || 0 }}
          />
        </div>
      )}

      <div className="space-y-3">
        {myDeliveries.length > 0 ? myDeliveries.map((delivery) => (
          <div key={delivery.id} className="flex items-center justify-between rounded-2xl bg-white/60 border border-white/50 backdrop-blur px-5 py-4">
            <div>
              <p className="font-bold text-slate-800 text-sm">{delivery.foodType || 'Food'}</p>
              <p className="text-xs text-slate-500 mt-0.5">📍 {delivery.dropLocation?.address || 'Destination'}</p>
            </div>
            <div className="text-right">
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                delivery.status === 'delivered' ? 'bg-emerald-100 text-emerald-700'
                : delivery.status === 'in-transit' || delivery.status === 'picked-up' ? 'bg-blue-100 text-blue-700'
                : 'bg-amber-100 text-amber-700'
              }`}>{delivery.status}</span>
              <p className="text-xs text-slate-400 mt-1">{delivery.quantity || ''}</p>
            </div>
          </div>
        )) : (
          <div className="rounded-3xl border border-white/60 bg-white/30 backdrop-blur p-8 text-center">
            <p className="text-2xl mb-2">🚚</p>
            <p className="text-sm font-medium text-slate-500">No deliveries yet. Add a donation to start tracking.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ProfilePanel({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const displayRoleLabel = getDisplayRoleLabel(session);

  return (
    <div className="donor-glass-panel p-8 max-w-4xl mx-auto animate-fade-slide">
      <p className="text-xs font-bold uppercase tracking-widest text-[#5D8FCB] mb-1">Profile</p>
      <h2 className="text-2xl font-black text-slate-800 mb-6">Your Account</h2>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Avatar card */}
        <div className="donor-glass-card p-6 flex flex-col items-center text-center min-w-[200px]">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#F3D1C2] to-[#7FAFE0] flex items-center justify-center text-white text-3xl font-black shadow-lg mb-3">
            {session.name.charAt(0).toUpperCase()}
          </div>
          <p className="font-black text-slate-800 text-lg">{session.name}</p>
          <p className="text-xs text-slate-500 mt-0.5">{session.email}</p>
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#7FAFE0]/20 border border-[#7FAFE0]/40 px-3 py-1 text-xs font-bold text-[#1F548C]">
            🍱 {displayRoleLabel}
          </span>
        </div>

        {/* Stats grid */}
        <div className="flex-1 grid grid-cols-2 gap-4">
          {[
            { label: 'Account Status', value: 'Active ✅', color: '#A8D5A2' },
            { label: 'Access Level', value: 'Protected 🔒', color: '#7FAFE0' },
            { label: 'Role', value: displayRoleLabel, color: '#FDB1C9' },
            { label: 'Member Since', value: new Date().getFullYear().toString(), color: '#F5C97A' },
          ].map((f) => (
            <div key={f.label} className="rounded-2xl p-4" style={{ background: f.color + '22', border: `1px solid ${f.color}44` }}>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">{f.label}</p>
              <p className="font-black text-slate-800">{f.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onLogout}
          className="flex items-center gap-2 rounded-2xl bg-gradient-to-b from-rose-400 to-rose-500 px-5 py-2.5 text-sm font-bold text-white shadow-md hover:scale-105 transition"
        >
          <LogOut size={15} /> Sign out
        </button>
      </div>
    </div>
  );
}

function SimpleInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold text-slate-600 uppercase tracking-wide">{label}</span>
      <input
        type="text"
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-white/60 bg-white/50 backdrop-blur px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#7FAFE0] focus:bg-white/80 focus:ring-4 focus:ring-[#7FAFE0]/20"
      />
    </label>
  );
}

function NeedCard({ need, allowFulfill = false, onFulfill }: { need: NeedRecord; allowFulfill?: boolean; onFulfill?: () => void }) {
  const urgencyMeta: Record<NeedUrgency, { label: string; tone: string }> = {
    high: { label: 'High', tone: 'bg-rose-100 text-rose-700' },
    medium: { label: 'Medium', tone: 'bg-amber-100 text-amber-700' },
    low: { label: 'Low', tone: 'bg-emerald-100 text-emerald-700' },
  };

  const requiredTime = Number.isFinite(need.requiredBefore) ? new Date(need.requiredBefore).toLocaleString() : 'ASAP';

  return (
    <div className="w-full rounded-3xl border border-white/60 bg-white/50 backdrop-blur p-5 shadow-sm transition hover:bg-white/70 hover:shadow-md">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <MapPin size={14} /> {need.location.address}
          </div>
          <p className="mt-1 font-semibold text-slate-900">{need.foodType}</p>
        </div>

        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${urgencyMeta[need.urgency].tone}`}>
          {urgencyMeta[need.urgency].label}
        </span>
      </div>

      <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-[1fr_1fr] sm:items-center">
        <div className="flex items-center gap-2">
          <Building2 size={14} className="shrink-0 text-emerald-600" />
          <span>{need.peopleCount} people</span>
        </div>
        <div className="flex items-center gap-2 sm:justify-end">
          <Clock3 size={14} className="shrink-0 text-slate-400" />
          <span>By {requiredTime}</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">{(need.mealType || 'any').toUpperCase()}</span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">{(need.category || 'any').replace('-', ' ').replace('-', ' ')}</span>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm text-slate-500">
        <span className="inline-flex items-center gap-2">
          <ClipboardList size={14} />
          {need.status}
        </span>

        {allowFulfill && onFulfill ? (
          <button
            type="button"
            onClick={onFulfill}
            className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Mark fulfilled
            <ArrowRight size={14} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ShipmentCard({ delivery, session }: { delivery: DeliveryRecord; session?: Session | null }) {
  const statusMeta: Record<DeliveryStatus, { label: string; tone: string }> = {
    pending: { label: 'Pending', tone: 'bg-slate-100 text-slate-700' },
    accepted: { label: 'Accepted', tone: 'bg-cyan-100 text-cyan-700' },
    picked: { label: 'Picked Up', tone: 'bg-cyan-100 text-cyan-700' },
    in_transit: { label: 'In Transit', tone: 'bg-amber-100 text-amber-700' },
    delivered: { label: 'Delivered', tone: 'bg-emerald-100 text-emerald-700' },
  };

  const agentLocation = delivery.agentLocation || null;
  const targetLocation = delivery.status === 'picked' || delivery.status === 'in_transit' ? delivery.dropLocation : delivery.pickupLocation;
  const liveDistanceKm = agentLocation ? calculateDistanceKm({ lat: agentLocation.lat, lng: agentLocation.lng }, { lat: targetLocation.lat, lng: targetLocation.lng }) : null;
  const trackingMessage = agentLocation
    ? delivery.status === 'picked' || delivery.status === 'in_transit'
      ? '🚴 Delivery agent is en route to drop-off'
      : '🚴 Delivery agent is on the way to pickup'
    : delivery.agentId
      ? 'Agent assigned, waiting for live location'
      : 'Waiting for agent assignment';

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <ClipboardList size={14} /> Delivery #{delivery.id.slice(-6)}
          </div>
          <p className="mt-1 font-semibold text-slate-900">{delivery.foodType || 'Food delivery'}</p>
        </div>

        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusMeta[delivery.status].tone}`}>
          {statusMeta[delivery.status].label}
        </span>
      </div>

      <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-[1fr_1fr] sm:items-center">
        <div className="flex items-center gap-2">
          <Building2 size={14} className="shrink-0 text-emerald-600" />
          <span className="truncate">Pickup: {delivery.pickupLocation.address}</span>
        </div>
        <div className="flex items-center gap-2 sm:justify-end">
          <MapPin size={14} className="shrink-0 text-cyan-600" />
          <span className="truncate">Need: {delivery.dropLocation.address}</span>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
        <p className="font-semibold">{trackingMessage}</p>
        {agentLocation ? (
          <p className="mt-1 text-xs text-cyan-700">
            {Number.isFinite(liveDistanceKm || Number.NaN)
              ? `${liveDistanceKm!.toFixed(1)} km from ${delivery.status === 'picked' || delivery.status === 'in_transit' ? 'drop location' : 'pickup'}`
              : 'Live location updated'}
            {agentLocation.updatedAt ? ` • updated ${new Date(agentLocation.updatedAt).toLocaleTimeString()}` : ''}
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm text-slate-500">
        <span className="inline-flex items-center gap-2">
          <Clock3 size={14} />
          {delivery.quantity ? `${delivery.quantity}` : 'Quantity not set'}
        </span>
      </div>

        <div className="mt-4">
        <BikeTracker delivery={delivery} session={session} />
      </div>
    </div>
  );
}

function BikeTracker({ delivery, session }: { delivery: DeliveryRecord; session?: Session | null }) {
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const start = { lat: delivery.pickupLocation.lat, lng: delivery.pickupLocation.lng };
  const dest = { lat: delivery.dropLocation.lat, lng: delivery.dropLocation.lng };
  const agentLocation = (delivery as unknown as { agentLocation?: { lat: number; lng: number } }).agentLocation;
  const center = agentLocation || start;

  useEffect(() => {
    let mounted = true;
    async function loadRoute() {
      const route = await getRouteDistanceAndTime(start, dest);
      if (mounted) {
        setRouteResult(route);
      }
    }
    loadRoute();
    return () => {
      mounted = false;
    };
  }, [delivery.pickupLocation.lat, delivery.pickupLocation.lng, delivery.dropLocation.lat, delivery.dropLocation.lng]);

  const routeDistance = routeResult?.distanceKm ?? calculateDistanceKm(start, dest);
  const routeDuration = routeResult?.durationMin ?? (routeDistance / 20) * 60;
  const statusLabel = delivery.status.replace('_', ' ');

  return (
    <div className="w-full space-y-4">
      <div className="rounded-3xl border border-slate-200 overflow-hidden bg-slate-50">
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={13}
          scrollWheelZoom={false}
          style={{ height: 320, width: '100%' }}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {routeResult?.geometry?.coordinates?.length ? (
            <Polyline
              pathOptions={{ color: '#2563eb', weight: 5, opacity: 0.8 }}
              positions={routeResult.geometry.coordinates.map(([lng, lat]) => [lat, lng])}
            />
          ) : null}
          <CircleMarker
            center={[start.lat, start.lng]}
            pathOptions={{ color: '#16a34a', fillColor: '#22c55e' }}
            radius={8}
          >
            <Popup>Pickup location</Popup>
          </CircleMarker>
          <CircleMarker
            center={[dest.lat, dest.lng]}
            pathOptions={{ color: '#dc2626', fillColor: '#f87171' }}
            radius={8}
          >
            <Popup>Drop location</Popup>
          </CircleMarker>
          {agentLocation ? (
            <CircleMarker
              center={[agentLocation.lat, agentLocation.lng]}
              pathOptions={{ color: '#f59e0b', fillColor: '#fde68a' }}
              radius={8}
            >
              <Popup>Agent location</Popup>
            </CircleMarker>
          ) : null}
        </MapContainer>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white bg-white p-4 text-sm text-slate-700 shadow-sm">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Route distance</p>
          <p className="mt-2 text-base font-semibold text-slate-900">{routeDistance.toFixed(1)} km</p>
        </div>
        <div className="rounded-2xl border border-white bg-white p-4 text-sm text-slate-700 shadow-sm">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Estimated time</p>
          <p className="mt-2 text-base font-semibold text-slate-900">{Math.round(routeDuration)} min</p>
        </div>
        <div className="rounded-2xl border border-white bg-white p-4 text-sm text-slate-700 shadow-sm">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Status</p>
          <p className="mt-2 text-base font-semibold text-slate-900">{statusLabel}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {session && session.uiRole === 'volunteer' ? (
          <>
            <button
              type="button"
              onClick={() => openGoogleMapsRoute(start)}
              className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Navigate to Pickup
            </button>
            {delivery.status !== 'pending' && delivery.status !== 'delivered' ? (
              <button
                type="button"
                onClick={() => openGoogleMapsRoute(dest)}
                className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                Navigate to Drop
              </button>
            ) : null}
          </>
        ) : (
          <div className="rounded-2xl border border-white bg-white p-4 text-sm text-slate-700 shadow-sm">
            <p className="text-sm text-slate-800">Status: <span className="font-semibold">{statusLabel}</span></p>
            {delivery.agentId ? (
              <p className="mt-2 text-sm text-slate-700">Assigned agent: <span className="font-medium">Agent assigned</span></p>
            ) : (
              <p className="mt-2 text-sm text-slate-600">Waiting for delivery agent assignment</p>
            )}
            {Number.isFinite(routeDuration) ? (
              <p className="mt-2 text-sm text-slate-700">ETA: <span className="font-medium">{Math.round(routeDuration)} min</span></p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="w-full rounded-2xl border border-white bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function ActionCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="w-full rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm">{icon}</div>
      <p className="mt-4 text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-500">{text}</p>
    </div>
  );
}

function App() {
  const [accounts, setAccounts] = useState<Account[]>(getInitialAccounts);
  const [session, setSession] = useState<Session | null>(getInitialSession);
  const [page, setPage] = useState<AppPage>(getInitialSession() ? 'app' : 'landing');
  const [dashboardView, setDashboardView] = useState<DashboardView>('overview');
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [authRole, setAuthRole] = useState<Role>('customer');
  const [authForm, setAuthForm] = useState({
    name: '',
    email: '',
    password: '',
    vehicleNumber: '',
    profileImageUrl: '',
  });
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [migrationDone, setMigrationDone] = useState(false);
  const [needs, setNeeds] = useState<NeedRecord[]>(EMPTY_NEEDS);
  const [donations, setDonations] = useState<DonationRecord[]>(EMPTY_DONATIONS);
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>(EMPTY_DELIVERIES);
  const [isOffline, setIsOffline] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));

    accounts.forEach((account) => {
      setProfileCache(account.email, {
        name: account.name,
        displayRoleLabel: formatRole(account.role),
      });
    });
  }, [accounts]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (session) {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      return;
    }

    window.localStorage.removeItem(SESSION_KEY);
  }, [session]);

  useEffect(() => {
    if (!session && page === 'app') {
      setPage('auth');
    }
  }, [page, session]);

  useEffect(() => {
    const useFirebase = Boolean(import.meta.env.VITE_FIREBASE_API_KEY);

    if (!useFirebase || !isFirebaseConfigured()) return;

    const unsub = fbOnAuthStateChanged(async (user) => {
      setAuthLoading(true);
      if (!user) {
        setSession(null);
        setPage('landing');
        setAuthLoading(false);
        return;
      }

      try {
        console.log('[LAYA] Auth state changed. User UID:', user.uid, 'Email:', user.email);
        const profile = await fbGetUserProfile(user.uid);
        console.log('[LAYA] Firestore profile fetched:', profile);
        
        const pendingGoogleAuth = typeof window !== 'undefined' ? window.localStorage.getItem(GOOGLE_AUTH_PENDING_KEY) : null;
        const pendingAuth = pendingGoogleAuth ? (JSON.parse(pendingGoogleAuth) as { role?: Role; uiRole?: UiRole; displayRoleLabel?: string } | null) : null;
        console.log('[LAYA] Pending Google auth:', pendingAuth);
        
        const storedSession = typeof window !== 'undefined' ? window.localStorage.getItem(SESSION_KEY) : null;
        const fallbackSession = storedSession ? (JSON.parse(storedSession) as Session) : null;
        const cachedSession = fallbackSession && fallbackSession.uid === user.uid ? fallbackSession : null;
        console.log('[LAYA] Cached session:', cachedSession);

        const name = profile?.name || user.displayName || user.email?.split('@')[0] || 'User';
        const role = (profile?.role as Role) || pendingAuth?.role || cachedSession?.role;
        const uiRole = (profile?.uiRole as UiRole) || pendingAuth?.uiRole || cachedSession?.uiRole;
        const displayRoleLabel = profile?.displayRoleLabel || pendingAuth?.displayRoleLabel || cachedSession?.displayRoleLabel || (uiRole ? formatUiRole(uiRole) : undefined);

        console.log('[LAYA] Resolved role:', role, 'uiRole:', uiRole, 'displayRoleLabel:', displayRoleLabel);

        if (!role || !uiRole) {
          console.error("User role not found for authenticated user", { profile, pendingAuth, cachedSession });
          setSession(null);
          setPage('auth');
          setAuthLoading(false);
          return;
        }

        if (!profile || !profile.role || !profile.uiRole || !profile.displayRoleLabel) {
          await fbSetUserProfile(user.uid, {
            name,
            email: user.email || '',
            role,
            uiRole,
            displayRoleLabel,
          });
        }

        console.log('[LAYA] Setting session with:', { uid: user.uid, name, email: user.email, role, uiRole, displayRoleLabel });
        setSession({ uid: user.uid, name, email: user.email || '', role, uiRole, displayRoleLabel });
        setPage('app');
        setDashboardView('overview');

        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(GOOGLE_AUTH_PENDING_KEY);
        }
      } catch (error) {
        console.error("Error in onAuthStateChanged:", error);
        const pendingGoogleAuth = typeof window !== 'undefined' ? window.localStorage.getItem(GOOGLE_AUTH_PENDING_KEY) : null;
        const pendingAuth = pendingGoogleAuth ? (JSON.parse(pendingGoogleAuth) as { role?: Role; uiRole?: UiRole; displayRoleLabel?: string } | null) : null;
        const storedSession = typeof window !== 'undefined' ? window.localStorage.getItem(SESSION_KEY) : null;
        const fallbackSession = storedSession ? (JSON.parse(storedSession) as Session) : null;
        const cachedSession = fallbackSession && fallbackSession.uid === user.uid ? fallbackSession : null;
        const role = pendingAuth?.role || cachedSession?.role;
        const uiRole = pendingAuth?.uiRole || cachedSession?.uiRole;
        const displayRoleLabel = pendingAuth?.displayRoleLabel || cachedSession?.displayRoleLabel;

        if (!role || !uiRole) {
          setSession(null);
          setPage('auth');
          if (typeof window !== 'undefined') {
            window.localStorage.removeItem(GOOGLE_AUTH_PENDING_KEY);
          }
          setAuthLoading(false);
          return;
        }

        setSession({
          uid: user.uid,
          name: user.displayName || user.email?.split('@')[0] || 'User',
          email: user.email || '',
          role,
          uiRole,
          displayRoleLabel,
        });
        setPage('app');
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(GOOGLE_AUTH_PENDING_KEY);
        }
      }
      setAuthLoading(false);
    });

    return () => unsub();
  }, []);

  // Migrate local demo accounts into Firebase Auth + Firestore users collection.
  useEffect(() => {
    const useFirebase = Boolean(import.meta.env.VITE_FIREBASE_API_KEY);

    if (!useFirebase || !isFirebaseConfigured()) return;

    const already = typeof window !== 'undefined' ? window.localStorage.getItem('laya.firebase.migrated.v1') : null;
    if (already === '1' || migrationDone) return;

    let cancelled = false;

    (async () => {
      try {
        const localAccounts = getInitialAccounts();

        for (const acct of localAccounts) {
          if (cancelled) return;

          try {
            // Try to sign in — if succeeds, ensure profile exists; then sign out
            const user = await fbSignInWithEmail(acct.email, acct.password);
            try {
              const profile = await fbGetUserProfile(user.uid);
              if (!profile) {
                await signUpWithEmail(acct.email, acct.password, acct.name, acct.role);
              }
            } catch {
              // ensure profile exists
              await signUpWithEmail(acct.email, acct.password, acct.name, acct.role);
            }

            await fbSignOut();
          } catch {
            // sign-in failed -> create user & profile
            try {
              await signUpWithEmail(acct.email, acct.password, acct.name, acct.role);
              await fbSignOut();
            } catch {
              // ignore individual account failures
            }
          }
        }

        if (!cancelled) {
          if (typeof window !== 'undefined') window.localStorage.setItem('laya.firebase.migrated.v1', '1');
          setMigrationDone(true);
          setAuthNotice('Demo accounts migrated to Firebase.');
        }
      } catch {
        // migration overall failed; do nothing
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [migrationDone]);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setNeeds(EMPTY_NEEDS);
      setDonations(EMPTY_DONATIONS);
      setDeliveries(EMPTY_DELIVERIES);
      return;
    }

    // Check offline status periodically
    setIsOffline(isInOfflineMode());
    const offlineCheckInterval = setInterval(() => {
      setIsOffline(isInOfflineMode());
    }, 1000); // Check every second

    const unsubscribeNeeds = listenToNeeds(setNeeds);
    const unsubscribeDonations = listenToDonations(setDonations);
    const unsubscribeDeliveries = listenToDeliveries(setDeliveries);
    const stopEngine = startMatchingEngine();

    return () => {
      clearInterval(offlineCheckInterval);
      unsubscribeNeeds();
      unsubscribeDonations();
      unsubscribeDeliveries();
      stopEngine();
    };
  }, []);

  const demoMode = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('demo') === 'donor-dashboard' : false;

  if (demoMode) {
    const sampleDonations = [
      { id: 'd1', foodName: 'Vegetable Curry (2L)', pickupLocation: 'Community Kitchen, MG Road', status: 'pending', eta: null, assignedAgent: null },
      { id: 'd2', foodName: 'Packaged Bread (30 pcs)', pickupLocation: 'Bakery Lane, Block B', status: 'assigned', eta: '18 min', assignedAgent: { name: 'Arun Kumar' } },
      { id: 'd3', foodName: 'Fruit Box (assorted)', pickupLocation: 'Green Apartments Lobby', status: 'picked', eta: '9 min', assignedAgent: { name: 'Sita Rao' } },
    ];

    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-4 text-2xl font-semibold text-slate-900">Donor Dashboard (Demo)</h2>
          <DonorDashboard donations={sampleDonations} />
        </div>
      </div>
    );
  }

  const startAuth = (mode: AuthMode, role: Role) => {
    setAuthMode(mode);
    setAuthRole(role);
    setAuthNotice(null);
    setAuthForm({ name: '', email: '', password: '', vehicleNumber: '', profileImageUrl: '' });
    setPage('auth');
  };

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>, selectedUiRole: UiRole) => {
    event.preventDefault();

    const email = authForm.email.trim().toLowerCase();
    const name = authForm.name.trim();
    const useFirebase = Boolean(import.meta.env.VITE_FIREBASE_API_KEY);

    if (useFirebase && isFirebaseConfigured()) {
      try {
        if (authMode === 'signup') {
          await signUpWithEmail(
            email,
            authForm.password,
            name || email.split('@')[0],
            authRole,
            formatUiRole(selectedUiRole),
            selectedUiRole,
            selectedUiRole === 'volunteer' ? authForm.vehicleNumber : undefined,
            selectedUiRole === 'volunteer' ? authForm.profileImageUrl : undefined
          );
          setProfileCache(email, { name: name || email.split('@')[0], displayRoleLabel: formatUiRole(selectedUiRole), uiRole: selectedUiRole });
          setAuthNotice('Account created successfully.');
          setAuthForm({ name: '', email: '', password: '', vehicleNumber: '', profileImageUrl: '' });
          setPage('app');
          setDashboardView('overview');
          return;
        }

        // signin
        const user = await fbSignInWithEmail(email, authForm.password);
        console.log('[LAYA] User signed in:', user.uid, 'with uiRole:', selectedUiRole, 'and authRole:', authRole);
        await fbSetUserProfile(user.uid, {
          displayRoleLabel: formatUiRole(selectedUiRole),
          uiRole: selectedUiRole,
          role: authRole,
          name: name || email.split('@')[0],
        });
        const profile = await fbGetUserProfile(user.uid);
        console.log('[LAYA] Profile after update:', profile);
        setProfileCache(user.uid, {
          name: profile?.name || user.displayName || email.split('@')[0] || 'User',
          displayRoleLabel: profile?.displayRoleLabel || formatUiRole(selectedUiRole),
          uiRole: selectedUiRole,
        });
        setAuthNotice('Signed in successfully.');
        setAuthForm({ name: '', email: '', password: '', vehicleNumber: '', profileImageUrl: '' });
        setPage('app');
        setDashboardView('overview');
        return;
      } catch (error) {
        setAuthNotice(error instanceof Error ? error.message : 'Authentication failed');
        return;
      }
    }

    // Fallback: local in-browser auth
    if (authMode === 'signup') {
      const existing = accounts.find((account) => account.email.toLowerCase() === email);

      if (existing) {
        setAuthNotice('An account with that email already exists. Please sign in instead.');
        return;
      }

      const nextAccount: Account = {
        name: name || email.split('@')[0],
        email,
        password: authForm.password,
        role: authRole,
      };

      setAccounts((current) => [...current, nextAccount]);
      setProfileCache(nextAccount.email, { name: nextAccount.name, displayRoleLabel: formatUiRole(selectedUiRole), uiRole: selectedUiRole });
      setSession({ uid: nextAccount.email, name: nextAccount.name, email: nextAccount.email, role: nextAccount.role, uiRole: selectedUiRole, displayRoleLabel: formatUiRole(selectedUiRole) });
      setPage('app');
      setDashboardView('overview');
      setAuthNotice('Account created successfully.');
      setAuthForm({ name: '', email: '', password: '', vehicleNumber: '', profileImageUrl: '' });
      return;
    }

    const account = accounts.find((entry) => entry.email.toLowerCase() === email && entry.password === authForm.password && entry.role === authRole);

    if (!account) {
      setAuthNotice('No matching account was found for that role and password.');
      return;
    }

    setProfileCache(account.email, { name: account.name, displayRoleLabel: formatUiRole(selectedUiRole), uiRole: selectedUiRole });
    setSession({ uid: account.email, name: account.name, email: account.email, role: account.role, uiRole: selectedUiRole, displayRoleLabel: formatUiRole(selectedUiRole) });
    setPage('app');
    setDashboardView('overview');
    setAuthNotice('Signed in successfully.');
    setAuthForm({ name: '', email: '', password: '', vehicleNumber: '', profileImageUrl: '' });
  };

  const handleLogout = async () => {
    const useFirebase = Boolean(import.meta.env.VITE_FIREBASE_API_KEY);

    if (useFirebase && isFirebaseConfigured()) {
      try {
        await fbSignOut();
      } catch {
        // ignore
      }
    }

    setSession(null);
    setPage('landing');
    setDashboardView('overview');
    setAuthNotice(null);
  };

  const handleGoogleSignIn = async (selectedUiRole: UiRole) => {
    const useFirebase = Boolean(import.meta.env.VITE_FIREBASE_API_KEY);

    if (!useFirebase || !isFirebaseConfigured()) {
      setAuthNotice('Firebase not configured. Please use email/password to sign in.');
      return;
    }

    console.log('Starting Google sign-in for:', selectedUiRole);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        GOOGLE_AUTH_PENDING_KEY,
        JSON.stringify({ role: authRole, uiRole: selectedUiRole, displayRoleLabel: formatUiRole(selectedUiRole) })
      );
    }

    setAuthNotice('Redirecting to Google sign-in...');
    await signInWithGoogle();
  };

  const mobileNavItems = session ? NAV_ITEMS[session.role] : [];
  const displayRoleLabel = session ? getDisplayRoleLabel(session) : '';

  return (
    <div className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.08),_transparent_24%),linear-gradient(180deg,_#f6f9ff_0%,_#eef4fb_100%)] text-slate-900">
      {isOffline && (
        <div className="sticky top-0 z-50 w-full border-b-2 border-amber-400 bg-amber-50 px-4 py-3 text-center text-sm font-semibold text-amber-900 shadow-md sm:px-6">
          🔌 Offline Mode: Your data is stored locally and will sync when Firestore is available.
        </div>
      )}
      {authLoading && !session && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
          <div className="text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-cyan-200 border-t-cyan-600"></div>
            <p className="mt-4 text-sm font-semibold text-slate-600">Loading dashboard...</p>
          </div>
        </div>
      )}
      {page === 'auth' && (
        <header className="sticky top-0 z-40 border-b border-white/80 bg-white/70 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <button type="button" onClick={() => setPage(session ? 'app' : 'landing')} className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/15">
              <Truck size={20} />
            </div>
            <div className="text-left">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-600">Laya</p>
              <p className="text-sm text-slate-500">Delivering Surplus Food Before It Expires</p>
            </div>
          </button>

          <div className="hidden items-center gap-2 md:flex">
            {!session ? (
              <>
                <button type="button" onClick={() => startAuth('signin', 'customer')} className="rounded-2xl px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900">
                  Sign in
                </button>
                <button type="button" onClick={() => startAuth('signup', 'customer')} className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
                  Get started
                  <ArrowRight size={14} />
                </button>
              </>
            ) : (
              <>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-600">{displayRoleLabel}</span>
                <button type="button" onClick={handleLogout} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
                  Sign out
                </button>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((current) => !current)}
            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white p-2 text-slate-700 md:hidden"
          >
            <Menu size={18} />
          </button>
        </div>

        {mobileMenuOpen ? (
          <div className="border-t border-slate-200 bg-white px-4 pb-4 pt-3 md:hidden sm:px-6">
            <div className="grid gap-2">
              {!session ? (
                <>
                  <button type="button" onClick={() => startAuth('signin', 'customer')} className="rounded-2xl bg-slate-100 px-4 py-3 text-left text-sm font-bold text-slate-700">
                    Sign in
                  </button>
                  <button type="button" onClick={() => startAuth('signup', 'customer')} className="rounded-2xl bg-slate-950 px-4 py-3 text-left text-sm font-bold text-white">
                    Get started
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={handleLogout} className="rounded-2xl bg-slate-100 px-4 py-3 text-left text-sm font-bold text-slate-700">
                    Sign out
                  </button>
                  {mobileNavItems.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setDashboardView(item.key);
                        setPage('app');
                        setMobileMenuOpen(false);
                      }}
                      className={`rounded-2xl px-4 py-3 text-left text-sm font-bold ${dashboardView === item.key ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-700'}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        ) : null}
      </header>
      )}

      {page === 'landing' && <LandingPage onStart={startAuth} />}
      {page === 'auth' && (
        <AuthPage
          mode={authMode}
          role={authRole}
          setMode={setAuthMode}
          setRole={setAuthRole}
          form={authForm}
          setForm={setAuthForm}
          notice={authNotice}
          setNotice={setAuthNotice}
          onSubmit={handleAuthSubmit}
          onGoogleSignIn={handleGoogleSignIn}
          onBack={() => setPage('landing')}
        />
      )}
      {page === 'app' && session ? (
        <AppShell
          session={session}
          dashboardView={dashboardView}
          setDashboardView={setDashboardView}
          onLogout={handleLogout}
          needs={needs}
          donations={donations}
          deliveries={deliveries}
        />
      ) : null}
    </div>
  );
}

export default App;
