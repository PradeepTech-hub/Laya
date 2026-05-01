import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
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
  Search,
  Zap,
  Box,
} from 'lucide-react';
import { motion } from 'framer-motion';
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
type DeliveryStatus = 'pending' | 'accepted' | 'picked' | 'in_transit' | 'delivered';
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

const DEFAULT_ACCOUNTS: Account[] = [
  { name: 'Demo Donor', email: 'customer@laya.com', password: 'customer123', role: 'customer' },
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
    { key: 'overview', label: 'Overview', icon: <LayoutDashboard size={16} /> },
    { key: 'requests', label: 'My Assignments', icon: <ClipboardList size={16} /> },
    { key: 'tracking', label: 'Active Delivery', icon: <Route size={16} /> },
    { key: 'history', label: 'History', icon: <CheckCircle2 size={16} /> },
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

const CUSTOMER_METRICS = [
  { icon: <Package size={22} className="text-emerald-600" />, value: '12.5K', label: 'Meals Donated', accent: 'bg-emerald-50' },
  { icon: <Truck size={22} className="text-cyan-600" />, value: '847', label: 'Active Deliveries', accent: 'bg-cyan-50' },
  { icon: <Building2 size={22} className="text-amber-600" />, value: '156', label: 'NGOs Supported', accent: 'bg-amber-50' },
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

function getDistanceScore(distanceKm: number) {
  if (!Number.isFinite(distanceKm)) {
    return 0;
  }

  return Math.max(0, 100 - distanceKm * 5);
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
  const [uiRole, setUiRole] = useState<'donor' | 'ngo' | 'volunteer'>(() => {
    if (role === 'customer') return 'donor';
    // default delivery-agent maps to NGO for initial selection
    return 'ngo';
  });

  const handleGoogleClick = async () => {
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

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Soft gradient background: light green to white */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-emerald-50 via-white to-emerald-50" />
      <div className="absolute inset-0 -z-10 opacity-40 bg-[radial-gradient(circle_at_20%_80%,_rgba(34,197,94,0.1),_transparent_40%),radial-gradient(circle_at_80%_20%,_rgba(34,197,94,0.08),_transparent_50%)]" />

      <style>{`
        @keyframes fadeInScale {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-fade-scale {
          animation: fadeInScale 0.5s ease-out;
        }
        .auth-btn-hover {
          transition: all 0.2s ease;
        }
        .auth-btn-hover:hover {
          transform: translateY(-2px);
        }
        .tab-transition {
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
      `}</style>

      <div className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-6">
        {/* Left Features (hidden on mobile) */}
        <div className="hidden lg:block lg:w-1/4 pr-8 space-y-6">
          <div className="text-left">
            <h3 className="text-2xl font-bold text-slate-900 mb-8">Why Laya?</h3>
            <div className="space-y-6">
              <div className="flex gap-3">
                <div className="text-2xl flex-shrink-0">🍱</div>
                <div>
                  <p className="font-semibold text-slate-900">Donate food easily</p>
                  <p className="text-sm text-slate-600 mt-1">Post surplus food in seconds</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="text-2xl flex-shrink-0">🏢</div>
                <div>
                  <p className="font-semibold text-slate-900">Connect with NGOs</p>
                  <p className="text-sm text-slate-600 mt-1">Reach communities that need help</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="text-2xl flex-shrink-0">🚚</div>
                <div>
                  <p className="font-semibold text-slate-900">Smart delivery system</p>
                  <p className="text-sm text-slate-600 mt-1">AI-powered route optimization</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Card */}
        <div className="w-full max-w-md animate-fade-scale">
          <div className="rounded-3xl border border-emerald-100 bg-white p-8 shadow-[0_20px_60px_rgba(16,185,129,0.12)]">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-100 mb-3">
                <Package size={28} className="text-emerald-600" />
              </div>
              <h1 className="text-2xl font-bold text-slate-950">Laya</h1>
              <p className="text-sm text-slate-600 mt-1">Smart Food Redistribution</p>
              <p className="text-xs text-slate-500 mt-2">Delivering Surplus Food Before It Expires</p>
            </div>

            {/* Divider */}
            <div className="h-px bg-emerald-100 mb-6" />

            {/* Mode Tabs */}
            <div className="flex gap-2 mb-6">
              <button
                type="button"
                onClick={() => setMode('signin')}
                className={`flex-1 px-4 py-2.5 rounded-xl font-semibold text-sm tab-transition ${
                  mode === 'signin'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setMode('signup')}
                className={`flex-1 px-4 py-2.5 rounded-xl font-semibold text-sm tab-transition ${
                  mode === 'signup'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                Sign Up
              </button>
            </div>

            {/* Role Selection (updated) */}
            <div className="mb-6 text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">I am a</p>

              {/* Local role options for clearer UX; map to existing internal roles */}
              <div className="flex flex-col items-center">
                <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3 sm:w-auto">
                  {[
                    { key: 'donor', label: 'Donor', mapTo: 'customer', icon: '🍱', helper: 'Provide surplus food' },
                    { key: 'ngo', label: 'NGO', mapTo: 'delivery-agent', icon: '🏢', helper: 'Receive and distribute food' },
                    { key: 'volunteer', label: 'Volunteer', mapTo: 'delivery-agent', icon: '🚚', helper: 'Deliver food to locations' },
                  ].map((r) => {
                    const isActive = uiRole === (r.key as 'donor' | 'ngo' | 'volunteer');
                    return (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => {
                          setUiRole(r.key as 'donor' | 'ngo' | 'volunteer');
                          setRole(r.mapTo as Role);
                        }}
                        className={`flex flex-col items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold transition w-full ${
                          isActive ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        <span className="text-lg">{r.icon}</span>
                        <span>{r.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 w-full max-w-md text-sm text-slate-600">
                  {uiRole === 'donor' && <p className="text-center">Provide surplus food</p>}
                  {uiRole === 'ngo' && <p className="text-center">Receive and distribute food</p>}
                  {uiRole === 'volunteer' && <p className="text-center">Deliver food to locations</p>}
                </div>
              </div>
            </div>

            {/* Form */}
            <form className="space-y-3 mb-5" onSubmit={(event) => onSubmit(event, uiRole)}>
              {mode === 'signup' && (
                <input
                  type="text"
                  required
                  placeholder="Full name"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-500 outline-none focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                />
              )}

              <input
                type="email"
                required
                placeholder="Email address"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-500 outline-none focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-100"
              />

              <input
                type="password"
                required
                minLength={4}
                placeholder="Password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-500 outline-none focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-100"
              />

              {notice && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                  {notice}
                </div>
              )}

              <button
                type="submit"
                className="auth-btn-hover w-full px-4 py-3 rounded-xl bg-emerald-600 text-white font-semibold text-sm shadow-md shadow-emerald-600/20 hover:bg-emerald-700 transition"
              >
                Continue
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-3 mb-5">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs font-medium text-slate-500">OR</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            {/* Social Button */}
            <button
              type="button"
              onClick={handleGoogleClick}
              disabled={isGoogleLoading}
              className="auth-btn-hover w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-semibold text-sm hover:bg-slate-100 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              {isGoogleLoading ? 'Signing in...' : 'Continue with Google'}
            </button>

            {/* Bottom Text */}
            <div className="mt-6 pt-5 border-t border-slate-100 text-center space-y-2">
              {mode === 'signin' ? (
                <p className="text-xs text-slate-600">
                  Don't have an account?{' '}
                  <button
                    type="button"
                    onClick={() => setMode('signup')}
                    className="font-semibold text-emerald-600 hover:text-emerald-700"
                  >
                    Sign up
                  </button>
                </p>
              ) : (
                <p className="text-xs text-slate-600">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => setMode('signin')}
                    className="font-semibold text-emerald-600 hover:text-emerald-700"
                  >
                    Sign in
                  </button>
                </p>
              )}
              <p className="text-xs text-slate-500 italic">By continuing, you help reduce food waste</p>
            </div>

            {/* Back Button */}
            <button
              type="button"
              onClick={onBack}
              className="auth-btn-hover w-full mt-4 px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-semibold text-xs hover:bg-slate-100 transition"
            >
              Back to home
            </button>
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
    <div className="min-h-screen w-full bg-[#FAFAFA] text-slate-900 pb-12 font-sans relative">
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
    const myActiveDeliveries = deliveries.filter((delivery) => delivery.agentId === session.uid && delivery.status !== 'delivered');
    const completedToday = deliveries.filter((delivery) => {
      if (delivery.agentId !== session.uid || delivery.status !== 'delivered') return false;
      const deliveredAt = new Date(delivery.deliveredAt || delivery.createdAt);
      const today = new Date();
      return deliveredAt.toDateString() === today.toDateString();
    }).length;
    const pendingPickups = deliveries.filter((delivery) => delivery.agentId == null && delivery.status === 'pending').length;

    return (
      <div className="space-y-6">
        <div className="rounded-[2rem] border border-white/80 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-6 text-white shadow-[0_30px_90px_rgba(15,23,42,0.2)] sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-200">Welcome back</p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Your delivery queue is ready</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                Accept assignments, move deliveries forward, and keep pickup-to-drop execution synchronized in real time.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm text-cyan-100">
              <Sparkles size={16} />
              {displayRoleLabel}
            </div>
          </div>
        </div>

        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard icon={<Truck size={22} className="text-cyan-600" />} value={String(myActiveDeliveries.length)} label="Active Deliveries" accent="bg-cyan-50" />
          <MetricCard icon={<CheckCircle2 size={22} className="text-emerald-600" />} value={String(completedToday)} label="Completed Today" accent="bg-emerald-50" />
          <MetricCard icon={<ClipboardList size={22} className="text-amber-600" />} value={String(pendingPickups)} label="Pending Pickups" accent="bg-amber-50" />
        </div>

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
  const openNeeds = needs.filter((need) => need.status === 'open').length;
  const assignedNeeds = needs.filter((need) => need.status === 'assigned').length;
  const fulfilledNeeds = needs.filter((need) => need.status === 'fulfilled').length;
  const activeDeliveries = deliveries.filter((delivery) => delivery.status !== 'delivered').length;

  return (
    <div className="grid w-full gap-6 xl:grid-cols-2">
      <div className="w-full rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <SectionTitle eyebrow="Live Need Ops" title="Match donations to beneficiary demand" text="NGOs can post needs, watch open requests, and keep deliveries focused on the beneficiary location." />

        <div className="mt-6 grid w-full grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-2">
          <MetricCard icon={<MapPin size={22} className="text-cyan-600" />} value={String(openNeeds)} label="Open Needs" accent="bg-cyan-50" />
          <MetricCard icon={<Truck size={22} className="text-emerald-600" />} value={String(activeDeliveries)} label="Active Deliveries" accent="bg-emerald-50" />
          <MetricCard icon={<ClipboardList size={22} className="text-amber-600" />} value={String(assignedNeeds)} label="Assigned Needs" accent="bg-amber-50" />
          <MetricCard icon={<CheckCircle2 size={22} className="text-emerald-600" />} value={String(fulfilledNeeds)} label="Fulfilled" accent="bg-emerald-50" />
        </div>

        <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-900">{session.name}</p>
          <p className="mt-1">Post a new need from the Requests tab, then track all open beneficiary requests from Live Needs.</p>
        </div>
      </div>

      <div className="w-full rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <SectionTitle eyebrow="Network" title="Need-first coordination" text="Open needs stay visible to donors and volunteers until every beneficiary request is fulfilled." />

        <div className="mt-6 space-y-4">
          <ActionCard icon={<Building2 size={18} />} title="Post needs" text="Create real-time beneficiary needs with location, people count, food type, and urgency." />
          <ActionCard icon={<Route size={18} />} title="Direct delivery" text="Deliver food straight to the need location instead of storing it at NGO offices." />
          <ActionCard icon={<CheckCircle2 size={18} />} title="Fulfillment" text="Mark a need fulfilled once the delivery is completed and verified." />
          <ActionCard icon={<ShieldCheck size={18} />} title="OTP safety" text="Require a 4-digit OTP before final delivery confirmation." />
        </div>
      </div>
    </div>
  );
}

function CustomerOverview({ session, needs, donations, deliveries, setDashboardView }: { session: Session; needs: NeedRecord[]; donations: DonationRecord[]; deliveries: DeliveryRecord[]; setDashboardView: (v: DashboardView) => void }) {
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
            <button className="flex items-center justify-center gap-2 rounded-[24px] bg-[#7FAFE0]/30 border border-[#7FAFE0]/50 backdrop-blur-md px-8 py-5 text-sm font-bold text-[#1F548C] shadow-[0_8px_24px_rgba(127,175,224,0.1)] hover:-translate-y-1 hover:shadow-[0_12px_30px_rgba(127,175,224,0.2)] transition-all">
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
  const activeDeliveries = deliveries.filter((delivery) => delivery.status !== 'delivered');
  const completedDeliveries = deliveries.filter((delivery) => delivery.status === 'delivered');

  return (
    <div className="grid w-full gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <div className="w-full rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <SectionTitle eyebrow="Assignments" title="Deliver directly to need locations" text="Agents manage pickup, transit, and OTP-verified drop-off at the beneficiary location." />

        <div className="mt-6 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
          <MetricCard icon={<Truck size={22} className="text-cyan-600" />} value={String(activeDeliveries.length)} label="Active Deliveries" accent="bg-cyan-50" />
          <MetricCard icon={<CheckCircle2 size={22} className="text-emerald-600" />} value={String(completedDeliveries.length)} label="Delivered" accent="bg-emerald-50" />
        </div>

        <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-900">{session.name}</p>
          <p className="mt-1">Use the Deliveries tab to update status and confirm the OTP before completing a drop-off.</p>
        </div>
      </div>

      <div className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <SectionTitle eyebrow="Route view" title="Delivery route checkpoints" text="Use a simple milestone view to keep the delivery visible on mobile and desktop." />

        <div className="mt-6 space-y-4">
          {ROUTE_STEPS.map((step, index) => (
            <div key={step} className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">{index + 1}</div>
              <div>
                <p className="font-semibold text-slate-900">{step}</p>
                <p className="mt-1 text-sm text-slate-500">Current route status remains visible for the volunteer.</p>
              </div>
            </div>
          ))}
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
    .filter((need) => isNeedCompatible(need, mealTypeFilter, categoryFilter))
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
        setForm((current) => ({
          ...current,
          lat: position.coords.latitude.toFixed(6),
          lng: position.coords.longitude.toFixed(6),
          address: current.address || `Selected from map (${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)})`,
        }));
        setNotice('Need location detected successfully.');
        setIsDetectingLocation(false);
      },
      () => {
        setNotice('Unable to detect location. Please enter coordinates manually.');
        setIsDetectingLocation(false);
      }
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

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(requiredBefore)) {
      setNotice('Please add a valid address, coordinates, and required time.');
      return;
    }

    try {
      await createNeed({
        ngoId: session.email,
        ngoName: session.name,
        location: { lat: latitude, lng: longitude, address: form.address },
        peopleCount: Number(form.peopleCount),
        foodType: form.foodType,
        mealType: form.mealType,
        category: form.category,
        urgency: form.urgency,
        requiredBefore,
      });

      setForm({ address: '', lat: '', lng: '', peopleCount: '', foodType: '', mealType: 'any', category: 'any', urgency: 'high', requiredBefore: '' });
      setNotice('Need posted successfully.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to post need.');
    }
  };

  const activeNeeds = needs.filter((need) => need.status !== 'fulfilled');
  const ngoNeedIds = new Set(needs.filter((need) => need.ngoId === session.email).map((need) => need.id));
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
            <span className="mb-2 block text-sm font-semibold text-slate-800">Urgency</span>
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
            <span className="mb-2 block text-sm font-semibold text-slate-800">Required Before</span>
            <input
              type="datetime-local"
              required
              value={form.requiredBefore}
              onChange={(event) => setForm({ ...form, requiredBefore: event.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            />
          </label>

          <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={detectLocation}
              disabled={isDetectingLocation}
              className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LocateFixed size={14} />
              {isDetectingLocation ? 'Detecting...' : 'Use current location'}
            </button>
            {notice ? <p className="text-sm text-slate-600">{notice}</p> : null}
          </div>

          <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 sm:col-span-2">
            <Plus size={16} />
            Post Need
          </button>
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
            {incomingDeliveries.length > 0 ? incomingDeliveries.map((delivery) => <ShipmentCard key={delivery.id} delivery={delivery} />) : <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">No incoming deliveries for this NGO yet.</div>}
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

  const detectPickupLocation = () => {
    if (!navigator.geolocation) {
      setNotice('Location detection is not supported in this browser.');
      return;
    }

    setIsDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm((current) => ({
          ...current,
          pickupLat: position.coords.latitude.toFixed(6),
          pickupLng: position.coords.longitude.toFixed(6),
          pickupLocation: current.pickupLocation || 'Current location',
        }));
        setNotice('Pickup location detected successfully.');
        setIsDetectingLocation(false);
      },
      () => {
        setNotice('Unable to detect your location. Please enter it manually.');
        setIsDetectingLocation(false);
      }
    );
  };

  const myDeliveries = deliveries.filter((delivery) => delivery.donorId === session.email);
  const myDonations = donations.filter((donation) => donation.donorId === session.email);
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

      <div className="donor-glass-panel p-8">
        <p className="text-xs font-bold uppercase tracking-widest text-[#5D8FCB] mb-1">My Donations</p>
        <h2 className="text-xl font-black text-slate-800 mb-4">Your donations</h2>

        <div className="space-y-3">
          {myDonations.length === 0 ? (
            <div className="rounded-3xl border border-white/60 bg-white/30 backdrop-blur p-8 text-center">
              <p className="text-2xl mb-2">🍱</p>
              <p className="text-sm font-medium text-slate-500">No donations yet — add your first above.</p>
            </div>
          ) : (
            myDonations.map((donation) => (
              <div key={donation.id} className="rounded-2xl border border-white/50 bg-white/60 backdrop-blur px-5 py-4 text-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{donation.foodType}</p>
                    <p className="mt-1 text-slate-600">Quantity: {donation.quantity}</p>
                    <p className="mt-1 text-xs text-slate-500">Pickup: {donation.location.address}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-slate-700">{donation.status}</p>
                    {donation.status === 'pending' ? (
                      <p className="text-xs text-slate-500">Waiting for match</p>
                    ) : donation.status === 'assigned' ? (
                      <p className="text-xs text-slate-500">Matched to: {donation.assignedNeedId ? (needsMap[donation.assignedNeedId]?.location.address || donation.assignedNeedId) : 'Assigned'}</p>
                    ) : donation.status === 'expired' ? (
                      <p className="text-xs text-rose-600">Expired</p>
                    ) : null}
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
            ))
          )}
        </div>

        <div className="mt-6 space-y-3">
          {myDeliveries.length > 0 ? myDeliveries.slice(0, 4).map((delivery) => <ShipmentCard key={delivery.id} delivery={delivery} />) : <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">No deliveries have been matched yet.</div>}
        </div>
      </div>
    </div>
  );
}

function AgentRequestsPanel({ session, needs, deliveries }: { session: Session; needs: NeedRecord[]; deliveries: DeliveryRecord[] }) {
  const [notice, setNotice] = useState<string | null>(null);
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

  return (
    <div className="w-full rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <SectionTitle eyebrow="My Assignments" title="Delivery execution queue" text="Accept available deliveries, move them through pickup and transit, and complete them with real-time sync." />
      {notice ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      <div className="mt-6 space-y-4">
        {visibleAssignments.length > 0 ? visibleAssignments.map((delivery) => {
          const need = needsById[delivery.needId];
          const currentPoint = delivery.agentLocation || delivery.pickupLocation;
          const distanceKm = calculateDistanceKm(currentPoint ? { lat: currentPoint.lat, lng: currentPoint.lng } : null, { lat: delivery.dropLocation.lat, lng: delivery.dropLocation.lng });
          const etaMinutes = Number.isFinite(distanceKm) ? Math.max(1, Math.round((distanceKm / 20) * 60)) : null;
          const urgencyTone = need?.urgency === 'high' ? 'bg-rose-100 text-rose-700' : need?.urgency === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700';
          const statusLabel = delivery.status === 'pending' ? 'Pending' : delivery.status === 'accepted' ? 'Accepted' : delivery.status === 'picked' ? 'Picked Up' : delivery.status === 'in_transit' ? 'In Transit' : 'Delivered';

          return (
            <div key={delivery.id} className="w-full space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    <span>Assignment #{delivery.id.slice(-6)}</span>
                    <span className={`rounded-full px-3 py-1 ${urgencyTone}`}>{need?.urgency ? `${need.urgency.toUpperCase()} urgency` : 'Priority'}</span>
                  </div>
                  <p className="text-lg font-semibold text-slate-900">{delivery.foodType || 'Food delivery'}</p>
                  <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                    <p className="inline-flex items-center gap-2"><Building2 size={14} className="shrink-0 text-emerald-600" />Pickup: {delivery.pickupLocation.address}</p>
                    <p className="inline-flex items-center gap-2"><MapPin size={14} className="shrink-0 text-cyan-600" />Drop: {delivery.dropLocation.address}</p>
                    <p className="inline-flex items-center gap-2"><ClipboardList size={14} className="shrink-0 text-slate-500" />Quantity: {delivery.quantity || 'Not set'}</p>
                    <p className="inline-flex items-center gap-2"><Route size={14} className="shrink-0 text-slate-500" />Distance: {Number.isFinite(distanceKm) ? `${distanceKm.toFixed(1)} km` : '—'}{etaMinutes ? ` · ETA ${etaMinutes} min` : ''}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusLabel === 'Delivered' ? 'bg-emerald-100 text-emerald-700' : statusLabel === 'In Transit' ? 'bg-amber-100 text-amber-700' : statusLabel === 'Picked Up' ? 'bg-cyan-100 text-cyan-700' : 'bg-slate-100 text-slate-700'}`}>
                      {statusLabel}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                      {delivery.agentId === currentUserId ? 'Assigned to you' : 'Available to accept'}
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 flex-col gap-2 lg:w-[260px]">
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
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      Accept Delivery
                    </button>
                  ) : null}

                  {delivery.agentId === currentUserId ? (
                    <>
                      {delivery.status === 'accepted' ? (
                        <button type="button" onClick={() => updateStatus(delivery, 'picked')} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
                          Mark Picked Up
                        </button>
                      ) : null}

                      {delivery.status === 'picked' ? (
                        <button
                          type="button"
                          onClick={() => {
                            openGoogleMapsRoute({ lat: delivery.dropLocation.lat, lng: delivery.dropLocation.lng });
                            void updateStatus(delivery, 'in_transit');
                          }}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                        >
                          Mark In Transit
                        </button>
                      ) : null}

                      {delivery.status === 'in_transit' ? (
                        <button type="button" onClick={() => updateStatus(delivery, 'delivered')} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700">
                          Mark Delivered
                        </button>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          );
        }) : <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">No assignments are available right now.</div>}
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
      <div className={`${compact ? '' : 'w-full rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]'}`}>
        {!compact ? <SectionTitle eyebrow="Active Delivery" title="Current delivery" text="Track the one delivery you are actively working on." /> : null}
        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">No active delivery is assigned to you yet.</div>
      </div>
    );
  }

  const currentPoint = activeDelivery.agentLocation || activeDelivery.pickupLocation;
  const distanceKm = calculateDistanceKm(
    currentPoint ? { lat: currentPoint.lat, lng: currentPoint.lng } : null,
    { lat: activeDelivery.dropLocation.lat, lng: activeDelivery.dropLocation.lng }
  );
  const stepIndex = DELIVERY_STATUS_STEPS.indexOf(activeDelivery.status as DeliveryStatus);
  const stepLabel = stepIndex >= 0 ? DELIVERY_STATUS_STEPS[stepIndex] : activeDelivery.status;

  return (
    <div className={`${compact ? '' : 'w-full rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]'}`}>
      {!compact ? <SectionTitle eyebrow="Active Delivery" title="Current delivery" text="Track the delivery you are currently handling from pickup to drop-off." /> : null}

      <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Assigned delivery</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{activeDelivery.foodType || 'Food delivery'}</p>
            <p className="mt-1 text-sm text-slate-600">Pickup: {activeDelivery.pickupLocation.address}</p>
            <p className="mt-1 text-sm text-slate-600">Drop: {activeDelivery.dropLocation.address}</p>
          </div>
          <span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-semibold text-cyan-700">
            {stepLabel.replace('_', ' ').toUpperCase()}
          </span>
        </div>

        <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
          <div className="rounded-2xl bg-white p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Quantity</p>
            <p className="mt-1 font-semibold text-slate-900">{activeDelivery.quantity || 'Not set'}</p>
          </div>
          <div className="rounded-2xl bg-white p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Distance</p>
            <p className="mt-1 font-semibold text-slate-900">{Number.isFinite(distanceKm) ? `${distanceKm.toFixed(1)} km` : '—'}</p>
          </div>
          <div className="rounded-2xl bg-white p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Current status</p>
            <p className="mt-1 font-semibold text-slate-900">{activeDelivery.status.replace('_', ' ')}</p>
          </div>
        </div>

        <div className="mt-5">
          <BikeTracker delivery={activeDelivery} />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          {DELIVERY_STATUS_STEPS.map((step) => {
            const index = DELIVERY_STATUS_STEPS.indexOf(step);
            const active = index <= stepIndex;
            return (
              <div key={step} className={`rounded-2xl border px-3 py-2 text-center text-xs font-semibold ${active ? 'border-cyan-200 bg-cyan-50 text-cyan-700' : 'border-slate-200 bg-white text-slate-400'}`}>
                {step.replace('_', ' ')}
              </div>
            );
          })}
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
    <div className="w-full rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <SectionTitle eyebrow="History" title="Completed deliveries" text="A simple log of completed deliveries with the food delivered, date, and completion status." />

      <div className="mt-6 space-y-4">
        {completedDeliveries.length > 0 ? completedDeliveries.map((delivery) => (
          <div key={delivery.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Completed</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{delivery.foodType || 'Food delivery'}</p>
                <p className="mt-1 text-sm text-slate-600">Date: {new Date(delivery.deliveredAt || delivery.createdAt).toLocaleString()}</p>
                <p className="mt-1 text-sm text-slate-600">Pickup: {delivery.pickupLocation.address}</p>
                <p className="mt-1 text-sm text-slate-600">Drop: {delivery.dropLocation.address}</p>
              </div>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">Completed</span>
            </div>

            <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
              <div className="rounded-2xl bg-white p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Food delivered</p>
                <p className="mt-1 font-semibold text-slate-900">{delivery.quantity || 'Not set'}</p>
              </div>
              <div className="rounded-2xl bg-white p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Distance</p>
                <p className="mt-1 font-semibold text-slate-900">{calculateDistanceKm({ lat: delivery.pickupLocation.lat, lng: delivery.pickupLocation.lng }, { lat: delivery.dropLocation.lat, lng: delivery.dropLocation.lng }).toFixed(1)} km</p>
              </div>
              <div className="rounded-2xl bg-white p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Status</p>
                <p className="mt-1 font-semibold text-slate-900">completed</p>
              </div>
            </div>
          </div>
        )) : <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">No completed deliveries yet.</div>}
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
              {deliveries.slice(0, 3).length > 0 ? deliveries.slice(0, 3).map((d) => <ShipmentCard key={d.id} delivery={d} />) : <div className="rounded-3xl border border-white/70 bg-white/85 p-4 text-sm text-slate-500">No deliveries yet.</div>}
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
  const isDonor = session.uiRole === 'donor';

  if (!isDonor) {
    return (
      <div className="grid w-full gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="w-full rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <SectionTitle eyebrow="Profile" title="Account details" text="A compact profile area keeps role information visible and easy to review." />
          <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white"><UserRound size={20} /></div>
              <div>
                <p className="font-semibold text-slate-900">{session.name}</p>
                <p className="text-sm text-slate-500">{session.email}</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <ProfileField label="Role" value={displayRoleLabel} />
              <ProfileField label="Status" value="Active" />
            </div>
          </div>
        </div>
        <div className="w-full rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <SectionTitle eyebrow="Actions" title="Workspace" text="" />
          <button type="button" onClick={onLogout} className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="donor-glass-panel p-8 animate-fade-slide">
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

function ShipmentCard({ delivery }: { delivery: DeliveryRecord }) {
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
        <BikeTracker delivery={delivery} />
      </div>
    </div>
  );
}

function BikeTracker({ delivery }: { delivery: DeliveryRecord }) {
  const steps: DeliveryStatus[] = DELIVERY_STATUS_STEPS;
  const start = { lat: delivery.pickupLocation.lat, lng: delivery.pickupLocation.lng };
  const dest = { lat: delivery.dropLocation.lat, lng: delivery.dropLocation.lng };
  const agentLocation = (delivery as unknown as { agentLocation?: { lat: number; lng: number } }).agentLocation;

  const statusIndex = steps.indexOf(delivery.status as DeliveryStatus);
  const statusProgress = statusIndex >= 0 ? statusIndex / Math.max(1, steps.length - 1) : 0;
  const current = delivery.status === 'delivered'
    ? dest
    : agentLocation
      ? { lat: agentLocation.lat, lng: agentLocation.lng }
      : start;

  const totalKm = calculateDistanceKm(start, dest) || 0.0001;
  const coveredKm = calculateDistanceKm(start, current);
  let progress = Math.max(0, Math.min(1, coveredKm / totalKm));

  if (!agentLocation) {
    progress = statusProgress;
  } else {
    progress = Math.max(progress, statusProgress);
  }

  if (delivery.status === 'delivered') {
    progress = 1;
  }

  return (
    <div className="w-full">
      <div className="relative h-10">
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2">
          <div className="h-1 w-full rounded-full bg-slate-100" />
        </div>

        <div className="absolute left-0 right-0 top-0 h-10">
          <div className="relative h-full">
            <motion.div
              initial={false}
              animate={{ left: `${progress * 100}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 18 }}
              className="absolute top-1/2 -translate-y-1/2"
              style={{ position: 'absolute', transform: 'translate(-50%, -50%)' }}
            >
              <div className="inline-flex items-center justify-center rounded-full bg-white p-2 shadow">
                <span className="text-lg">🚲</span>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
        <span>Start</span>
        <span>{delivery.status.replace('_', ' ')}</span>
        <span>Dest</span>
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
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [migrationDone, setMigrationDone] = useState(false);
  const [needs, setNeeds] = useState<NeedRecord[]>(EMPTY_NEEDS);
  const [donations, setDonations] = useState<DonationRecord[]>(EMPTY_DONATIONS);
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>(EMPTY_DELIVERIES);
  const [isOffline, setIsOffline] = useState(false);

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
      if (!user) {
        setSession(null);
        setPage('landing');
        return;
      }

      try {
        const profile = await fbGetUserProfile(user.uid);
        const name = profile?.name || user.displayName || user.email?.split('@')[0] || 'User';
        const role = (profile?.role as Role) || 'customer';
        const uiRole = (profile?.uiRole as UiRole) || (profile?.displayRoleLabel === 'Volunteer' ? 'volunteer' : profile?.displayRoleLabel === 'NGO' ? 'ngo' : 'donor');
        setSession({ uid: user.uid, name, email: user.email || '', role, uiRole, displayRoleLabel: profile?.displayRoleLabel });
        setPage('app');
        setDashboardView('overview');
      } catch {
        setSession({
          uid: user.uid,
          name: user.displayName || user.email?.split('@')[0] || 'User',
          email: user.email || '',
          role: 'customer',
          uiRole: 'donor',
        });
        setPage('app');
      }
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

  const startAuth = (mode: AuthMode, role: Role) => {
    setAuthMode(mode);
    setAuthRole(role);
    setAuthNotice(null);
    setAuthForm({ name: '', email: '', password: '' });
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
          await signUpWithEmail(email, authForm.password, name || email.split('@')[0], authRole, formatUiRole(selectedUiRole), selectedUiRole);
          setProfileCache(email, { name: name || email.split('@')[0], displayRoleLabel: formatUiRole(selectedUiRole), uiRole: selectedUiRole });
          setAuthNotice('Account created successfully.');
          setAuthForm({ name: '', email: '', password: '' });
          setPage('app');
          setDashboardView('overview');
          return;
        }

        // signin
        const user = await fbSignInWithEmail(email, authForm.password);
        await fbSetUserProfile(user.uid, { displayRoleLabel: formatUiRole(selectedUiRole) });
        const profile = await fbGetUserProfile(user.uid);
        setProfileCache(user.uid, {
          name: profile?.name || user.displayName || email.split('@')[0] || 'User',
          displayRoleLabel: profile?.displayRoleLabel || formatUiRole(selectedUiRole),
          uiRole: selectedUiRole,
        });
        setAuthNotice('Signed in successfully.');
        setAuthForm({ name: '', email: '', password: '' });
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
      setAuthForm({ name: '', email: '', password: '' });
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
    setAuthForm({ name: '', email: '', password: '' });
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

    const user = await signInWithGoogle(authRole, formatUiRole(selectedUiRole));
    const profile = await fbGetUserProfile(user.uid);
    const name = profile?.name || user.displayName || user.email?.split('@')[0] || 'User';
    const role = (profile?.role as Role) || authRole;

    setProfileCache(user.uid, { name, displayRoleLabel: profile?.displayRoleLabel || formatUiRole(selectedUiRole) });
    setSession({ uid: user.uid, name, email: user.email || '', role, uiRole: selectedUiRole, displayRoleLabel: profile?.displayRoleLabel || formatUiRole(selectedUiRole) });
    setPage('app');
    setDashboardView('overview');
    setAuthNotice('Signed in with Google successfully.');
    setAuthForm({ name: '', email: '', password: '' });
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
