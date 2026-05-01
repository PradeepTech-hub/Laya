import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  LayoutDashboard,
  Lock,
  LogOut,
  LocateFixed,
  MapPin,
  Menu,
  Package,
  Plus,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  Truck,
  User,
  UserRound,
} from 'lucide-react';
import {
  isFirebaseConfigured,
  signUpWithEmail,
  signInWithEmail as fbSignInWithEmail,
  signOut as fbSignOut,
  onAuthStateChanged as fbOnAuthStateChanged,
  getUserProfile as fbGetUserProfile,
  setUserProfile as fbSetUserProfile,
  signInWithGoogle,
} from './lib/firebase';

type Role = 'customer' | 'delivery-agent';
type AuthMode = 'signin' | 'signup';
type AppPage = 'landing' | 'auth' | 'app';
type DashboardView = 'overview' | 'requests' | 'tracking' | 'profile';

type Account = {
  name: string;
  email: string;
  password: string;
  role: Role;
};

type Session = {
  name: string;
  email: string;
  role: Role;
  uiRole: UiRole;
  displayRoleLabel?: string;
};

type UiRole = 'donor' | 'ngo' | 'volunteer';

type ShipmentStatus = 'queued' | 'assigned' | 'in-transit' | 'delivered';

type Shipment = {
  id: number;
  title: string;
  pickup: string;
  dropoff: string;
  eta: string;
  status: ShipmentStatus;
  agent: string;
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
    { key: 'tracking', label: 'Delivery Tracking', icon: <Route size={16} /> },
    { key: 'profile', label: 'Profile', icon: <UserRound size={16} /> },
  ],
  'delivery-agent': [
    { key: 'overview', label: 'Overview', icon: <LayoutDashboard size={16} /> },
    { key: 'requests', label: 'Assignments', icon: <ClipboardList size={16} /> },
    { key: 'tracking', label: 'Routes', icon: <Route size={16} /> },
    { key: 'profile', label: 'Profile', icon: <UserRound size={16} /> },
  ],
};

const UI_NAV_ITEMS: Record<UiRole, { key: DashboardView; label: string; icon: ReactNode }[]> = {
  donor: NAV_ITEMS.customer,
  ngo: [
    { key: 'overview', label: 'Overview', icon: <LayoutDashboard size={16} /> },
    { key: 'requests', label: 'Intake', icon: <ClipboardList size={16} /> },
    { key: 'tracking', label: 'Network', icon: <Route size={16} /> },
    { key: 'profile', label: 'Profile', icon: <UserRound size={16} /> },
  ],
  volunteer: NAV_ITEMS['delivery-agent'],
};

const CUSTOMER_SHIPMENTS: Shipment[] = [];

const AGENT_SHIPMENTS: Shipment[] = [
  { id: 1, title: 'Priority Envelope', pickup: 'Central Branch', dropoff: 'North Tower', eta: '7 min', status: 'in-transit', agent: 'You' },
  { id: 2, title: 'Retail Pickup', pickup: 'City Storefront', dropoff: 'Harbor Labs', eta: '14 min', status: 'assigned', agent: 'You' },
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

const LANDING_FEATURES = [
  {
    icon: <ShieldCheck size={20} className="text-cyan-600" />,
    title: 'Verified donation flow',
    text: 'Keep donors and volunteers in a clear, role-based workflow from request to handoff.',
  },
  {
    icon: <Search size={20} className="text-amber-600" />,
    title: 'Live tracking',
    text: 'See the status of every donation with clean, easy-to-scan updates and route checkpoints.',
  },
  {
    icon: <Sparkles size={20} className="text-indigo-600" />,
    title: 'Modern experience',
    text: 'A polished donation experience with responsive layouts that work on desktop and mobile.',
  },
];

const ROUTE_STEPS = ['Pickup Confirmed', 'In Transit', 'Delivered to NGO', 'Distributed'];

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

function getUiRoleLabel(session: Session) {
  return session.displayRoleLabel || UI_ROLE_LABELS[session.uiRole];
}

function getAuthTitle(mode: AuthMode, role: Role) {
  return mode === 'signup' ? `Create your ${formatRole(role)} account` : `Sign in as a ${formatRole(role)}`;
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
    <div className="relative min-h-screen overflow-hidden">
      {/* Soft gradient background: light green to white */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-emerald-50 via-white to-emerald-50" />
      <div className="absolute inset-0 -z-10 opacity-40 bg-[radial-gradient(circle_at_20%_80%,_rgba(34,197,94,0.1),_transparent_40%),radial-gradient(circle_at_80%_20%,_rgba(34,197,94,0.08),_transparent_50%)]" />

      <style>{`
        @keyframes fadeInSlideUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-slide {
          animation: fadeInSlideUp 0.8s ease-out forwards;
        }
        .animate-fade-slide-delay-1 { animation-delay: 0.1s; opacity: 0; }
        .animate-fade-slide-delay-2 { animation-delay: 0.2s; opacity: 0; }
        .animate-fade-slide-delay-3 { animation-delay: 0.3s; opacity: 0; }
        .animate-fade-slide-delay-4 { animation-delay: 0.4s; opacity: 0; }
        .btn-hover-scale {
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .btn-hover-scale:hover {
          transform: scale(1.05);
        }
        .card-hover {
          transition: all 0.3s ease;
        }
        .card-hover:hover {
          transform: translateY(-6px);
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15);
        }
      `}</style>

      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
        {/* Hero Section */}
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          {/* Left Column */}
          <div className="animate-fade-slide animate-fade-slide-delay-1">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 mb-6">
              <Sparkles size={16} />
              Smart Food Redistribution
            </div>

            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-slate-950 leading-tight">
              Reduce Food Waste.
              <br />
              <span className="bg-gradient-to-r from-emerald-600 to-green-600 bg-clip-text text-transparent">
                Feed Communities.
              </span>
            </h1>

            <p className="mt-6 text-lg leading-8 text-slate-600 max-w-xl">
              Laya connects donors, NGOs, and volunteers using AI to deliver food before it expires. Together, we reduce waste and nourish communities.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-4">
              <button
                type="button"
                onClick={() => onStart('signup', 'customer')}
                className="btn-hover-scale inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700"
              >
                <Package size={20} />
                Donate Food
              </button>
              <button
                type="button"
                onClick={() => onStart('signin', 'customer')}
                className="btn-hover-scale inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-emerald-200 bg-white px-8 py-4 text-base font-semibold text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50"
              >
                <MapPin size={20} />
                View Live Map
              </button>
            </div>
          </div>

          {/* Right Column - Illustration Area + Stats */}
          <div className="space-y-6">
            {/* Main Illustration Card */}
            <div className="animate-fade-slide animate-fade-slide-delay-2 card-hover rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-100 to-emerald-50 p-8 shadow-[0_20px_60px_rgba(16,185,129,0.1)]">
              <div className="flex items-center justify-center h-48 text-emerald-200">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/50 mb-4">
                    <Truck size={40} className="text-emerald-600" />
                  </div>
                  <p className="text-sm font-semibold text-emerald-700">Community Food Distribution</p>
                </div>
              </div>
            </div>

            {/* Stat Cards Grid */}
            <div className="grid grid-cols-3 gap-3">
              <div className="animate-fade-slide animate-fade-slide-delay-3 card-hover rounded-2xl bg-white border border-emerald-100 p-4 text-center shadow-sm">
                <p className="text-2xl font-bold text-emerald-600">12.5K</p>
                <p className="mt-1 text-xs font-medium text-slate-600">Meals Saved</p>
              </div>
              <div className="animate-fade-slide animate-fade-slide-delay-3 card-hover rounded-2xl bg-white border border-emerald-100 p-4 text-center shadow-sm">
                <p className="text-2xl font-bold text-emerald-600">847</p>
                <p className="mt-1 text-xs font-medium text-slate-600">Active Deliveries</p>
              </div>
              <div className="animate-fade-slide animate-fade-slide-delay-3 card-hover rounded-2xl bg-white border border-emerald-100 p-4 text-center shadow-sm">
                <p className="text-2xl font-bold text-emerald-600">156</p>
                <p className="mt-1 text-xs font-medium text-slate-600">NGOs Connected</p>
              </div>
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div className="mt-24">
          <div className="animate-fade-slide animate-fade-slide-delay-4 text-center mb-12">
            <h2 className="text-4xl font-bold text-slate-950 mb-4">How Laya Works</h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Seamless coordination between donors, NGOs, and volunteers to ensure no food goes to waste.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="card-hover rounded-2xl bg-white p-6 border border-emerald-100 shadow-sm">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-100 mb-4">
                <Building2 size={24} className="text-emerald-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Donors Post</h3>
              <p className="text-sm text-slate-600">Restaurants, stores, and individuals list surplus food with details and expiry times.</p>
            </div>

            <div className="card-hover rounded-2xl bg-white p-6 border border-emerald-100 shadow-sm">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-100 mb-4">
                <BarChart3 size={24} className="text-emerald-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">AI Matches</h3>
              <p className="text-sm text-slate-600">Our AI engine matches donors with nearby NGOs and creates optimal delivery routes.</p>
            </div>

            <div className="card-hover rounded-2xl bg-white p-6 border border-emerald-100 shadow-sm">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-100 mb-4">
                <Truck size={24} className="text-emerald-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Volunteers Deliver</h3>
              <p className="text-sm text-slate-600">Volunteers pick up and deliver to communities, all tracked in real-time on the map.</p>
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
    } catch (err: any) {
      setNotice(err?.message || 'Google sign-in failed');
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
                <div className="grid grid-cols-3 gap-3 w-full max-w-md sm:max-w-none sm:w-auto">
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

function RolePill({ role, active, onClick }: { role: Role; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-4 py-3 text-left transition ${active ? 'border-cyan-200 bg-cyan-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{ROLE_META[role].label}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{ROLE_META[role].description}</p>
        </div>
        <ChevronRight size={16} className={active ? 'text-cyan-600' : 'text-slate-400'} />
      </div>
    </button>
  );
}

function DemoCard({ role, email, password }: { role: Role; email: string; password: string }) {
  return (
    <div className="rounded-2xl border border-white bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-slate-900">{ROLE_META[role].label} demo</p>
      <p className="mt-2 text-xs text-slate-500">Email: {email}</p>
      <p className="text-xs text-slate-500">Password: {password}</p>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
        {icon}
        {label}
      </span>
      {children}
    </label>
  );
}

function AppShell({ session, dashboardView, setDashboardView, onLogout }: AppShellProps) {
  const navItems = UI_NAV_ITEMS[session.uiRole];
  const meta = ROLE_META[session.role];
  const displayRoleLabel = getDisplayRoleLabel(session);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="rounded-[2rem] border border-white/80 bg-white/85 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/20">
              <Truck size={20} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-600">Laya</p>
              <p className="text-lg font-bold tracking-tight text-slate-900">{displayRoleLabel}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${meta.accent}`}>
              <UserRound size={14} />
              {session.name}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-600">
              {displayRoleLabel}
            </span>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        </div>

        <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setDashboardView(item.key)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${dashboardView === item.key ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <main className="mt-6">
        {dashboardView === 'overview' && <OverviewPanel session={session} />}
        {dashboardView === 'requests' && <RequestsPanel session={session} />}
        {dashboardView === 'tracking' && <TrackingPanel session={session} />}
        {dashboardView === 'profile' && <ProfilePanel session={session} onLogout={onLogout} />}
      </main>
    </div>
  );
}

function OverviewPanel({ session }: { session: Session }) {
  const metrics = session.uiRole === 'donor' ? CUSTOMER_METRICS : session.uiRole === 'ngo' ? NGO_METRICS : AGENT_METRICS;
  const displayRoleLabel = getDisplayRoleLabel(session);

  return (
    <div className="space-y-6">
      <div className="rounded-[2rem] border border-white/80 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-6 text-white shadow-[0_30px_90px_rgba(15,23,42,0.2)] sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-200">Welcome back</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Hi {session.name.split(' ')[0]}, your donation dashboard is ready</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">Manage your food donations and track impact</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm text-cyan-100">
            <Sparkles size={16} />
            {displayRoleLabel}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </div>

      {/* Impact card for donors */}
      {/** show a simple impact summary card */}
      <div className="mt-4">
        <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm">
          <p className="text-lg font-semibold text-slate-900">🌍 You helped feed 120 people this week</p>
        </div>
      </div>

      {session.uiRole === 'donor' ? <CustomerOverview /> : session.uiRole === 'ngo' ? <NgoOverview /> : <AgentOverview />}
    </div>
  );
}

function NgoOverview() {
  const [shipments] = useState<Shipment[]>([
    { id: 1, title: 'Bakery surplus intake', pickup: 'Sunrise Bakery', dropoff: 'City Relief Hub', eta: '15 min', status: 'queued', agent: 'Pending approval' },
    { id: 2, title: 'Catering donation batch', pickup: 'Grand Hall', dropoff: 'North Community Kitchen', eta: '22 min', status: 'assigned', agent: 'Volunteer ready' },
    { id: 3, title: 'Community pantry dispatch', pickup: 'West Pantry', dropoff: 'Shelter Network', eta: 'In transit', status: 'in-transit', agent: 'On the way' },
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
      <div className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <SectionTitle eyebrow="Intake" title="Review surplus and distribute it faster" text="NGOs can triage incoming donations, confirm recipients, and keep food moving before it expires." />

        <div className="mt-6 space-y-3">
          {shipments.map((shipment) => (
            <ShipmentCard key={shipment.id} shipment={shipment} />
          ))}
        </div>
      </div>

      <div className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <SectionTitle eyebrow="Network" title="Partner and beneficiary status" text="Keep the redistribution network visible across shelters, kitchens, and volunteers." />

        <div className="mt-6 space-y-4">
          <ActionCard icon={<Building2 size={18} />} title="Partner hubs" text="Track which local hubs are ready to receive each batch." />
          <ActionCard icon={<ClipboardList size={18} />} title="Intake approvals" text="Approve donations and route them to the right recipients." />
          <ActionCard icon={<Route size={18} />} title="Donation handoff" text="Hand off confirmed donations to a volunteer or delivery partner." />
          <ActionCard icon={<CheckCircle2 size={18} />} title="Waste reduction" text="Monitor items rescued before expiry and closed out successfully." />
          <div className="mt-4">
            <h4 className="text-sm font-semibold text-slate-900">Partner NGOs</h4>
            <div className="mt-3 space-y-3">
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-3">
                  <Building2 className="text-emerald-600" />
                  <div>
                    <p className="text-sm font-semibold">Hope Shelter</p>
                    <p className="text-xs text-slate-500">2 km</p>
                  </div>
                </div>
                <p className="text-sm font-semibold text-emerald-700">Available</p>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-3">
                  <Building2 className="text-emerald-600" />
                  <div>
                    <p className="text-sm font-semibold">Community Kitchen</p>
                    <p className="text-xs text-slate-500">4.1 km</p>
                  </div>
                </div>
                <p className="text-sm font-semibold text-amber-600">Receiving</p>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-3">
                  <Building2 className="text-emerald-600" />
                  <div>
                    <p className="text-sm font-semibold">Neighborhood Pantry</p>
                    <p className="text-xs text-slate-500">6.3 km</p>
                  </div>
                </div>
                <p className="text-sm font-semibold text-slate-500">Idle</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CustomerOverview() {
  const [shipments, setShipments] = useState<Shipment[]>(CUSTOMER_SHIPMENTS);
  const [form, setForm] = useState({ title: '', pickup: '', dropoff: '', eta: '', unit: 'KG', mealType: 'Veg', category: 'Raw Food' });
  const [pickupMode, setPickupMode] = useState<'manual' | 'auto'>('manual');
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const mealTypes = [
    { key: 'Veg', label: 'Veg' },
    { key: 'Non-veg', label: 'Non-veg' },
  ] as const;
  const categories = [
    { key: 'Raw Food', label: 'Raw Food', icon: '🥕' },
    { key: 'Cooked Food', label: 'Cooked Food', icon: '🍛' },
    { key: 'Packed Food', label: 'Packed Food', icon: '📦' },
  ] as const;

  const detectPickupLocation = () => {
    if (!navigator.geolocation) {
      setLocationNotice('Location detection is not supported in this browser.');
      return;
    }

    setIsDetectingLocation(true);
    setLocationNotice('Detecting your location...');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const detectedLocation = `Current location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;

        setPickupMode('auto');
        setForm((current) => ({ ...current, pickup: detectedLocation }));
        setLocationNotice('Location detected successfully.');
        setIsDetectingLocation(false);
      },
      () => {
        setLocationNotice('Unable to detect your location. Please enter it manually.');
        setIsDetectingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const createRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setShipments((current) => [
      {
        id: Date.now(),
        title: `${form.category} - ${form.title}`,
        pickup: form.pickup,
        dropoff: `${form.dropoff} ${form.unit}`,
        eta: form.eta,
        status: 'queued',
        agent: 'Pending assignment',
      },
      ...current,
    ]);

    setForm({ title: '', pickup: '', dropoff: '', eta: '', unit: 'KG', mealType: 'Veg', category: 'Raw Food' });
    setPickupMode('manual');
    setLocationNotice(null);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
      <div className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <SectionTitle eyebrow="Donate Food" title="Donate Food" text="Quickly post surplus food for pickup and redistribution." />

        <form onSubmit={createRequest} className="mt-6 grid gap-4 sm:grid-cols-2">
          <SimpleInput label="Food Type" value={form.title} onChange={(value) => setForm({ ...form, title: value })} placeholder="Cooked meals, Bread, Produce" />
          <div className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-800">Meal Type</span>
            <div className="grid grid-cols-2 gap-3">
              {mealTypes.map((item) => {
                const active = form.mealType === item.key;

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setForm({ ...form, mealType: item.key })}
                    className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${active ? 'border-slate-950 bg-slate-950 text-white shadow-sm' : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white'}`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="sm:col-span-2">
            <span className="mb-2 block text-sm font-semibold text-slate-800">Select the Category</span>
            <div className="grid gap-3 sm:grid-cols-3">
              {categories.map((item) => {
                const active = form.category === item.key;

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setForm({ ...form, category: item.key })}
                    className={`group relative overflow-hidden rounded-2xl border p-0 text-left shadow-sm transition ${active ? 'border-slate-950 ring-2 ring-slate-950/70' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <div className="relative flex h-24 items-end bg-slate-900">
                      <div className={`absolute inset-0 bg-gradient-to-r ${item.key === 'Raw Food' ? 'from-emerald-950/90 via-emerald-700/70 to-emerald-500/70' : item.key === 'Cooked Food' ? 'from-amber-950/90 via-rose-700/70 to-orange-500/70' : 'from-slate-950/90 via-slate-700/70 to-slate-500/70'}`} />
                      <div className="relative z-10 flex w-full items-center justify-between px-4 py-3 text-white">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/80">Category</p>
                          <p className="mt-1 text-sm font-semibold">{item.label}</p>
                        </div>
                        <span className="text-2xl">{item.icon}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-800">Quantity</span>
            <div className="grid grid-cols-[1fr_92px] gap-3">
              <input
                type="number"
                min="0"
                step="0.1"
                required
                value={form.dropoff}
                onChange={(event) => setForm({ ...form, dropoff: event.target.value })}
                placeholder="Amount"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
              />
              <select
                value={form.unit}
                onChange={(event) => setForm({ ...form, unit: event.target.value })}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
              >
                <option value="KG">KG</option>
                <option value="Ltrs">Ltrs</option>
              </select>
            </div>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-800">Expiry Time</span>
            <input
              type="time"
              required
              value={form.eta}
              onChange={(event) => setForm({ ...form, eta: event.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            />
          </label>

          <div className="sm:col-span-2">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="block text-sm font-semibold text-slate-800">Pickup Location</span>
              <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1 text-xs font-semibold text-slate-600">
                <button
                  type="button"
                  onClick={() => setPickupMode('manual')}
                  className={`rounded-xl px-3 py-1.5 transition ${pickupMode === 'manual' ? 'bg-white text-slate-900 shadow-sm' : 'hover:text-slate-900'}`}
                >
                  Manual
                </button>
                <button
                  type="button"
                  onClick={detectPickupLocation}
                  className={`ml-1 inline-flex items-center gap-1 rounded-xl px-3 py-1.5 transition ${pickupMode === 'auto' ? 'bg-white text-slate-900 shadow-sm' : 'hover:text-slate-900'}`}
                >
                  <LocateFixed size={12} />
                  Auto detect
                </button>
              </div>
            </div>
            <input
              type="text"
              required
              value={form.pickup}
              onChange={(event) => setForm({ ...form, pickup: event.target.value })}
              placeholder={pickupMode === 'auto' ? 'Auto-detected location' : '123 Market St'}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                {locationNotice || 'Choose manual entry or auto-detect your current location.'}
              </p>
              <button
                type="button"
                onClick={detectPickupLocation}
                disabled={isDetectingLocation}
                className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <LocateFixed size={14} />
                {isDetectingLocation ? 'Detecting...' : 'Use current location'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 sm:col-span-2"
          >
            <Plus size={16} />
            Donate Food
          </button>
        </form>
      </div>

      <div className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="mb-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold">⚡ AI Suggestion:</p>
            <p className="mt-1 text-sm text-slate-700">Deliver 30 meals to Hope Shelter (2 km, expires in 2 hrs)</p>
          </div>
        </div>
        <SectionTitle eyebrow="Recent Donations" title="Recent Donations" text="Track your recent food donations and their current status." />

        <div className="mt-6 space-y-3">
          {shipments.map((shipment) => (
            <ShipmentCard key={shipment.id} shipment={shipment} />
          ))}
        </div>
      </div>
    </div>
  );
}

function AgentOverview() {
  const [shipments, setShipments] = useState<Shipment[]>(AGENT_SHIPMENTS);

  const advanceStatus = (id: number) => {
    const order: ShipmentStatus[] = ['queued', 'assigned', 'in-transit', 'delivered'];

    setShipments((current) =>
      current.map((shipment) => {
        if (shipment.id !== id) {
          return shipment;
        }

        const nextIndex = Math.min(order.indexOf(shipment.status) + 1, order.length - 1);

        return {
          ...shipment,
          status: order[nextIndex],
          eta: order[nextIndex] === 'delivered' ? 'Delivered' : shipment.eta,
        };
      })
    );
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
      <div className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <SectionTitle eyebrow="Assignments" title="Stay ahead of every pickup" text="Volunteers can move each job through the queue without leaving the dashboard." />

        <div className="mt-6 space-y-3">
          {shipments.map((shipment) => (
            <ShipmentCard key={shipment.id} shipment={shipment} onAdvance={() => advanceStatus(shipment.id)} />
          ))}
        </div>
      </div>

      <div className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <SectionTitle eyebrow="Route view" title="Delivery route checkpoints" text="Use a simple milestone view to keep the whole route visible on mobile and desktop." />

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

function RequestsPanel({ session }: { session: Session }) {
  return session.uiRole === 'donor' ? <CustomerRequestsPanel /> : session.uiRole === 'ngo' ? <NgoRequestsPanel /> : <AgentRequestsPanel />;
}

function NgoRequestsPanel() {
  const [items] = useState<Shipment[]>([
    { id: 1, title: 'Bakery surplus intake', pickup: 'Sunrise Bakery', dropoff: 'City Relief Hub', eta: '15 min', status: 'queued', agent: 'Pending approval' },
    { id: 2, title: 'Catering donation batch', pickup: 'Grand Hall', dropoff: 'North Community Kitchen', eta: '22 min', status: 'assigned', agent: 'Assigned to volunteer' },
    { id: 3, title: 'Community pantry dispatch', pickup: 'West Pantry', dropoff: 'Shelter Network', eta: 'In transit', status: 'in-transit', agent: 'On the way' },
  ]);

  return (
    <div className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <SectionTitle eyebrow="Intake" title="Incoming surplus and assignment queue" text="NGOs can approve food, assign partners, and track what has already been matched." />
      <div className="mt-6 grid gap-3">
        {items.map((shipment) => (
          <ShipmentCard key={shipment.id} shipment={shipment} />
        ))}
      </div>
    </div>
  );
}

function CustomerRequestsPanel() {
  return (
    <div className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <SectionTitle eyebrow="Food Donations" title="Your donation queue" text="Everything stays labeled clearly so donors can see what is pending, in transit, or delivered." />
      <div className="mt-6 grid gap-3">
        {CUSTOMER_SHIPMENTS.map((shipment) => (
          <ShipmentCard key={shipment.id} shipment={shipment} />
        ))}
      </div>
    </div>
  );
}

function AgentRequestsPanel() {
  const [shipments, setShipments] = useState<Shipment[]>(AGENT_SHIPMENTS);

  const advanceStatus = (id: number) => {
    const order: ShipmentStatus[] = ['queued', 'assigned', 'in-transit', 'delivered'];

    setShipments((current) =>
      current.map((shipment) => {
        if (shipment.id !== id) {
          return shipment;
        }

        const nextIndex = Math.min(order.indexOf(shipment.status) + 1, order.length - 1);

        return { ...shipment, status: order[nextIndex], eta: order[nextIndex] === 'delivered' ? 'Delivered' : shipment.eta };
      })
    );
  };

  return (
    <div className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <SectionTitle eyebrow="Assignments" title="Delivery jobs in motion" text="The agent view highlights jobs that can be advanced with one tap or click." />
      <div className="mt-6 space-y-3">
        {shipments.map((shipment) => (
          <ShipmentCard key={shipment.id} shipment={shipment} onAdvance={() => advanceStatus(shipment.id)} />
        ))}
      </div>
    </div>
  );
}

function TrackingPanel({ session }: { session: Session }) {
  const accent = session.uiRole === 'donor' ? 'from-cyan-50 to-sky-50' : session.uiRole === 'ngo' ? 'from-emerald-50 to-teal-50' : 'from-amber-50 to-orange-50';

  return (
    <div className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <SectionTitle
        eyebrow="Delivery Tracking"
        title={session.uiRole === 'donor' ? 'Monitor your deliveries' : session.uiRole === 'ngo' ? 'Follow donation handoffs' : 'Plan your route checkpoints'}
        text="A simple tracking layout keeps the delivery-service flow easy to understand without extra noise."
      />

      <div className={`mt-6 rounded-[2rem] border border-slate-200 bg-gradient-to-br ${accent} p-6`}>
        <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              <MapPin size={14} /> Route view
            </div>
            <h3 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">{session.uiRole === 'donor' ? 'Live delivery tracking' : session.uiRole === 'ngo' ? 'Donation handoff tracking' : 'Delivery route overview'}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {session.uiRole === 'donor'
                ? 'Follow the package through pickup, transit, and completion without leaving the dashboard.'
                : session.uiRole === 'ngo'
                  ? 'Track when a donation is approved, matched, handed off, and received by a partner.'
                  : 'Check the next stop, current job status, and your progress through the route.'}
            </p>
          </div>

            <div className="grid gap-3 sm:grid-cols-2">
            <TrackingChip title="Pickup Confirmed" subtitle="Volunteer confirmed pickup" />
            <TrackingChip title="In Transit" subtitle="Volunteer on route" />
            <TrackingChip title="Delivered to NGO" subtitle="Handed to partner" />
            <TrackingChip title="Distributed" subtitle="Meals distributed to community" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfilePanel({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const displayRoleLabel = getDisplayRoleLabel(session);

  return (
    <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
      <div className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <SectionTitle eyebrow="Profile" title="Account details" text="A compact profile area keeps role information visible and easy to review." />

        <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <UserRound size={20} />
            </div>
            <div>
              <p className="font-semibold text-slate-900">{session.name}</p>
              <p className="text-sm text-slate-500">{session.email}</p>
            </div>
          </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <ProfileField label="Role" value={displayRoleLabel} />
            <ProfileField label="Status" value="Active" />
            <ProfileField label="Donor" value={session.uiRole === 'ngo' ? 'NGO coordination desk' : displayRoleLabel} />
            <ProfileField label="Access" value="Protected" />
            <ProfileField label="Total Donations" value="24" />
            <ProfileField label="Meals Contributed" value="12.5K" />
          </div>
        </div>
      </div>

      <div className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <SectionTitle eyebrow="Actions" title="Keep the workspace ready" text="Use the sign-out action below or continue working in the donation dashboard." />

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <ActionCard icon={<BarChart3 size={18} />} title="Usage summary" text="Track activity from the overview panel." />
          <ActionCard icon={<Building2 size={18} />} title="Company settings" text="Keep brand and access details in one place." />
          <ActionCard icon={<Route size={18} />} title="Routing" text="Use live route checkpoints for delivery progress." />
          <ActionCard icon={<ShieldCheck size={18} />} title="Security" text="Protected routing keeps the right views visible." />
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </div>
  );
}

function SimpleInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-800">{label}</span>
      <input
        type="text"
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
      />
    </label>
  );
}

function ShipmentCard({ shipment, onAdvance }: { shipment: Shipment; onAdvance?: () => void }) {
  const statusMeta: Record<ShipmentStatus, { label: string; tone: string }> = {
    queued: { label: 'Pending', tone: 'bg-slate-100 text-slate-700' },
    assigned: { label: 'In Transit', tone: 'bg-cyan-100 text-cyan-700' },
    'in-transit': { label: 'In Transit', tone: 'bg-amber-100 text-amber-700' },
    delivered: { label: 'Delivered', tone: 'bg-emerald-100 text-emerald-700' },
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <ClipboardList size={14} /> Donation #{shipment.id}
          </div>
          <p className="mt-1 font-semibold text-slate-900">{shipment.title}</p>
        </div>

        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusMeta[shipment.status].tone}`}>
          {statusMeta[shipment.status].label}
        </span>
      </div>

      <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-[1fr_1fr] sm:items-center">
        <div className="flex items-center gap-2">
          <Building2 size={14} className="shrink-0 text-emerald-600" />
          <span className="truncate">{shipment.dropoff}</span>
        </div>
        <div className="flex items-center gap-2 sm:justify-end">
          <Clock3 size={14} className="shrink-0 text-slate-400" />
          <span>{shipment.eta}</span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm text-slate-500">
        <span className="inline-flex items-center gap-2">
          <Building2 size={14} />
          {shipment.dropoff}
        </span>

        {onAdvance ? (
          <button
            type="button"
            onClick={onAdvance}
            className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Advance status
            <ArrowRight size={14} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function TrackingChip({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="rounded-3xl border border-white/70 bg-white/85 p-4 shadow-sm">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function ActionCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
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
        setSession({ name, email: user.email || '', role, uiRole, displayRoleLabel: profile?.displayRoleLabel });
        setPage('app');
        setDashboardView('overview');
      } catch {
        setSession({
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
              const profile = await fbGetUserProfile((user as any).uid);
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
            } catch (err) {
              // ignore individual account failures
            }
          }
        }

        if (!cancelled) {
          if (typeof window !== 'undefined') window.localStorage.setItem('laya.firebase.migrated.v1', '1');
          setMigrationDone(true);
          setAuthNotice('Demo accounts migrated to Firebase.');
        }
      } catch (err) {
        // migration overall failed; do nothing
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [migrationDone]);

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
      } catch (err: any) {
        setAuthNotice(err?.message || 'Authentication failed');
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
      setSession({ name: nextAccount.name, email: nextAccount.email, role: nextAccount.role, uiRole: selectedUiRole, displayRoleLabel: formatUiRole(selectedUiRole) });
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
    setSession({ name: account.name, email: account.email, role: account.role, uiRole: selectedUiRole, displayRoleLabel: formatUiRole(selectedUiRole) });
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

    try {
      const user = await signInWithGoogle(authRole, formatUiRole(selectedUiRole));
      const profile = await fbGetUserProfile((user as any).uid);
      const name = profile?.name || user.displayName || user.email?.split('@')[0] || 'User';
      const role = (profile?.role as Role) || authRole;

      setProfileCache((user as any).uid, { name, displayRoleLabel: profile?.displayRoleLabel || formatUiRole(selectedUiRole) });
      setSession({ name, email: user.email || '', role, uiRole: selectedUiRole, displayRoleLabel: profile?.displayRoleLabel || formatUiRole(selectedUiRole) });
      setPage('app');
      setDashboardView('overview');
      setAuthNotice('Signed in with Google successfully.');
      setAuthForm({ name: '', email: '', password: '' });
    } catch (err: any) {
      throw err;
    }
  };

  const mobileNavItems = session ? NAV_ITEMS[session.role] : [];
  const displayRoleLabel = session ? getDisplayRoleLabel(session) : '';

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.08),_transparent_24%),linear-gradient(180deg,_#f6f9ff_0%,_#eef4fb_100%)] text-slate-900">
      <header className="sticky top-0 z-40 border-b border-white/80 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
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
                  <button type="button" onClick={() => startAuth('signin', 'customer')} className="rounded-2xl bg-slate-100 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                    Sign in
                  </button>
                  <button type="button" onClick={() => startAuth('signup', 'customer')} className="rounded-2xl bg-slate-950 px-4 py-3 text-left text-sm font-semibold text-white">
                    Get started
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={handleLogout} className="rounded-2xl bg-slate-100 px-4 py-3 text-left text-sm font-semibold text-slate-700">
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
                      className={`rounded-2xl px-4 py-3 text-left text-sm font-semibold ${dashboardView === item.key ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-700'}`}
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
      {page === 'app' && session ? <AppShell session={session} dashboardView={dashboardView} setDashboardView={setDashboardView} onLogout={handleLogout} /> : null}
    </div>
  );
}

export default App;
