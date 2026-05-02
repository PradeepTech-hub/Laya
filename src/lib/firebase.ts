import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  setPersistence,
  browserLocalPersistence,
  signOut as fbSignOut,
  onAuthStateChanged as fbOnAuthStateChanged,
  GoogleAuthProvider,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
  where,
  getDocs,
  runTransaction,
  type Unsubscribe,
  type DocumentData,
} from 'firebase/firestore';
import { getRouteDistanceAndTime, type Coordinates as RouteCoordinates } from './routing';

type UserProfile = {
  uid: string;
  name?: string;
  email?: string;
  role?: string;
  displayRoleLabel?: string;
  uiRole?: string;
  vehicleNumber?: string;
  profileImageUrl?: string;
  createdAt?: number;
};

type NeedLocation = {
  lat: number;
  lng: number;
  address: string;
  updatedAt?: number;
};

type NeedRecord = {
  id: string;
  ngoId: string;
  ngoName?: string;
  location: NeedLocation;
  peopleCount: number;
  foodType: string;
  mealType?: 'veg' | 'non-veg' | 'any';
  category?: 'prepared-food' | 'raw-food' | 'packed-food' | 'any';
  urgency: 'high' | 'medium' | 'low';
  requiredBefore: number;
  status: 'open' | 'assigned' | 'fulfilled';
  createdAt: number;
};

type DonationRecord = {
  id: string;
  donorId: string;
  foodType: string;
  mealType?: 'veg' | 'non-veg' | 'any';
  category?: 'prepared-food' | 'raw-food' | 'packed-food' | 'any';
  quantity: string;
  expiryTime: number;
  location: NeedLocation;
  status: 'pending' | 'assigned' | 'completed' | 'cancelled' | 'expired';
  assignedNeedId: string;
  notificationEnabled?: boolean;
  createdAt: number;
};

type DeliveryRecord = {
  id: string;
  donorId: string;
  donorName?: string;
  ngoId?: string;
  agentId: string | null;
  donationId: string;
  pickupLocation: NeedLocation;
  dropLocation: NeedLocation;
  needId: string;
  agentLocation?: NeedLocation | null;
  foodType?: string;
  mealType?: 'veg' | 'non-veg' | 'any';
  category?: 'prepared-food' | 'raw-food' | 'packed-food' | 'any';
  quantity?: string;
  status: 'pending' | 'accepted' | 'picked' | 'in_transit' | 'delivered' | 'cancelled';
  deliveredAt?: number;
  agentName?: string;
  agentVehicleNumber?: string;
  agentProfileImageUrl?: string;
  createdAt: number;
};

const env = import.meta.env as Record<string, string | boolean | undefined>;

function isConfigured() {
  return Boolean(env.VITE_FIREBASE_API_KEY);
}

let auth: ReturnType<typeof getAuth> | null = null;
let db: ReturnType<typeof getFirestore> | null = null;

function getDb() {
  if (!isConfigured()) return null;

  if (db) {
    return db;
  }

  try {
    db = getFirestore();
    return db;
  } catch {
    db = null;
    return null;
  }
}

function getFirestoreDbOrThrow() {
  const firestore = getDb();

  if (!firestore) {
    throw new Error('Firebase not configured');
  }

  return firestore;
}

/**
 * Robust error detection: catches Firestore connection failures, permission errors, 
 * database missing errors, and network timeouts.
 * Senior-level pattern: broad error detection + early fallback activation
 */
function isFirestoreUnavailableError(error: unknown): boolean {
  if (!error) return false;
  
  const code = typeof error === 'object' && 'code' in error ? String((error as { code?: string }).code || '') : '';
  const message = typeof error === 'object' && 'message' in error ? String((error as { message?: string }).message || '') : '';
  const msg = `${code} ${message}`.toLowerCase();
  
  // Broad detection: database missing, permission denied, network failures, connection refused
  return (
    msg.includes('database (default) does not exist') ||
    msg.includes('not-found') ||
    msg.includes('permission-denied') ||
    msg.includes('unauthenticated') ||
    msg.includes('could not reach cloud firestore backend') ||
    msg.includes('failed to get document from cache') ||
    msg.includes('network error') ||
    msg.includes('failed to connect') ||
    code === 'failed-precondition' ||
    code === 'unavailable'
  );
}

async function ensurePersistence() {
  if (!isFirebaseConfigured() || !auth) return;

  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (error) {
    console.warn('[LAYA] Firebase auth persistence setup failed:', error);
  }
}

function init() {
  if (!isConfigured()) return;
  if (getApps().length > 0) return;
  try {
    const firebaseConfig = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
      measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
    };
    initializeApp(firebaseConfig as Record<string, string>);
    auth = getAuth();
  } catch {
    // initialization failed; leave auth/db null
  }
}

init();

const LOCAL_KEYS = {
  needs: 'laya.local.needs.v1',
  donations: 'laya.local.donations.v1',
  deliveries: 'laya.local.deliveries.v1',
} as const;

let forceLocalStore = !isConfigured();

const needsSubscribers = new Set<(items: NeedRecord[]) => void>();
const donationsSubscribers = new Set<(items: DonationRecord[]) => void>();
const deliveriesSubscribers = new Set<(items: DeliveryRecord[]) => void>();

function isFirestoreMissingError(error: unknown) {
  return isFirestoreUnavailableError(error);
}

function switchToLocalStore() {
  forceLocalStore = true;
}

function canUseRemoteFirestore() {
  return isFirebaseConfigured() && !forceLocalStore;
}

function createLocalId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function readLocal<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal<T>(key: string, value: T[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function readLocalNeeds() {
  return readLocal<NeedRecord>(LOCAL_KEYS.needs).sort((a, b) => a.requiredBefore - b.requiredBefore);
}

function readLocalDonations() {
  return readLocal<DonationRecord>(LOCAL_KEYS.donations).sort((a, b) => b.createdAt - a.createdAt);
}

function readLocalDeliveries() {
  return readLocal<DeliveryRecord>(LOCAL_KEYS.deliveries).sort((a, b) => b.createdAt - a.createdAt);
}

function emitNeeds() {
  const items = readLocalNeeds();
  needsSubscribers.forEach((callback) => callback(items));
}

function emitDonations() {
  const items = readLocalDonations();
  donationsSubscribers.forEach((callback) => callback(items));
}

function emitDeliveries() {
  const items = readLocalDeliveries();
  deliveriesSubscribers.forEach((callback) => callback(items));
}

function subscribeNeedsLocal(callback: (items: NeedRecord[]) => void): Unsubscribe {
  needsSubscribers.add(callback);
  callback(readLocalNeeds());
  return () => needsSubscribers.delete(callback);
}

function subscribeDonationsLocal(callback: (items: DonationRecord[]) => void): Unsubscribe {
  donationsSubscribers.add(callback);
  callback(readLocalDonations());
  return () => donationsSubscribers.delete(callback);
}

function subscribeDeliveriesLocal(callback: (items: DeliveryRecord[]) => void): Unsubscribe {
  deliveriesSubscribers.add(callback);
  callback(readLocalDeliveries());
  return () => deliveriesSubscribers.delete(callback);
}

export function isFirebaseConfigured() {
  return isConfigured() && auth !== null;
}

/**
 * Check if app is running in offline/fallback mode (localStorage only)
 * Use this to show UI indicators to users
 */
export function isInOfflineMode() {
  return forceLocalStore;
}

export async function signUpWithEmail(
  email: string,
  password: string,
  name: string,
  role: string,
  displayRoleLabel?: string,
  uiRole?: string,
  vehicleNumber?: string,
  profileImageUrl?: string
) {
  if (!isFirebaseConfigured()) throw new Error('Firebase not configured');
  await ensurePersistence();

  const userCredential = await createUserWithEmailAndPassword(auth!, email, password);
  const uid = userCredential.user.uid;

  const profile: UserProfile = {
    uid,
    name,
    email,
    role,
    displayRoleLabel,
    uiRole,
    vehicleNumber: uiRole === 'volunteer' ? vehicleNumber : undefined,
    profileImageUrl: uiRole === 'volunteer' ? profileImageUrl : undefined,
    createdAt: Date.now(),
  };

  const firestore = getDb();
  if (firestore) {
    try {
      await setDoc(doc(firestore, 'users', uid), profile);
    } catch {
      // Firestore is optional in this workspace; keep auth working without it.
    }
  }

  return profile;
}

export async function signInWithEmail(email: string, password: string) {
  if (!isFirebaseConfigured()) throw new Error('Firebase not configured');
  await ensurePersistence();

  const userCredential = await signInWithEmailAndPassword(auth!, email, password);
  return userCredential.user;
}

export async function signOut() {
  if (!isFirebaseConfigured()) return;
  await fbSignOut(auth!);
}

export function onAuthStateChanged(callback: (user: FirebaseUser | null) => void) {
  if (!isFirebaseConfigured()) {
    // return a no-op unsubscribe
    return () => {};
  }

  return fbOnAuthStateChanged(auth!, callback);
}

export async function getUserProfile(uid: string) {
  if (!isFirebaseConfigured()) return null;

  const firestore = getDb();
  if (!firestore) return null;

  try {
    const ref = doc(firestore, 'users', uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) return null;

    return snap.data() as UserProfile;
  } catch {
    return null;
  }
}

export async function setUserProfile(uid: string, profile: Partial<UserProfile>) {
  if (!isFirebaseConfigured()) throw new Error('Firebase not configured');

  const firestore = getDb();
  if (!firestore) return;

  try {
    await setDoc(doc(firestore, 'users', uid), profile, { merge: true } as Record<string, unknown>);
  } catch (error) {
    // ignore Firestore availability issues
    console.warn('[LAYA] setUserProfile failed:', error);
  }
}

/**
 * Get agent details (name, vehicleNumber, profileImageUrl) for delivery display
 */
export async function getAgentDetails(agentId: string) {
  if (!agentId) return null;

  try {
    const profile = await getUserProfile(agentId);
    if (!profile) return null;

    return {
      name: profile.name || 'Delivery Agent',
      vehicleNumber: profile.vehicleNumber || 'N/A',
      profileImageUrl: profile.profileImageUrl || null,
    };
  } catch {
    return null;
  }
}

export async function signInWithGoogle(): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error('Firebase not configured');
  await ensurePersistence();

  console.log('[LAYA] Firebase Google sign-in initiated');
  const provider = new GoogleAuthProvider();

  try {
    await signInWithPopup(auth!, provider);
  } catch (error) {
    console.warn('[LAYA] signInWithPopup failed, falling back to redirect:', error);
    await signInWithRedirect(auth!, provider);
  }
}

export function listenToNeeds(callback: (needs: NeedRecord[]) => void) {
  if (!canUseRemoteFirestore()) {
    return subscribeNeedsLocal(callback);
  }

  let localUnsub: Unsubscribe | null = null;
  let remoteUnsub: Unsubscribe | null = null;

  try {
    const firestore = getFirestoreDbOrThrow();
    const q = query(collection(firestore, 'needs'), orderBy('requiredBefore', 'asc'));

    remoteUnsub = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<NeedRecord, 'id'>) }));
        writeLocal(LOCAL_KEYS.needs, items);
        callback(items);
      },
      (error) => {
        console.warn('[LAYA] Firestore listener error (needs):', error);
        if (isFirestoreUnavailableError(error) && !localUnsub) {
          switchToLocalStore();
          localUnsub = subscribeNeedsLocal(callback);
        }
      }
    );

    return () => {
      if (remoteUnsub) remoteUnsub();
      if (localUnsub) localUnsub();
    };
  } catch (error) {
    console.warn('[LAYA] Firestore initialization failed (needs), switching to local:', error);
    if (isFirestoreUnavailableError(error)) {
      switchToLocalStore();
      return subscribeNeedsLocal(callback);
    }
    // Unrecoverable error, fallback to local
    switchToLocalStore();
    return subscribeNeedsLocal(callback);
  }
}

export function listenToDeliveries(callback: (deliveries: DeliveryRecord[]) => void) {
  if (!canUseRemoteFirestore()) {
    return subscribeDeliveriesLocal(callback);
  }

  let localUnsub: Unsubscribe | null = null;
  let remoteUnsub: Unsubscribe | null = null;

  try {
    const firestore = getFirestoreDbOrThrow();
    const q = query(collection(firestore, 'deliveries'), orderBy('createdAt', 'desc'));

    remoteUnsub = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<DeliveryRecord, 'id'>) }));
        writeLocal(LOCAL_KEYS.deliveries, items);
        callback(items);
      },
      (error) => {
        console.warn('[LAYA] Firestore listener error (deliveries):', error);
        if (isFirestoreUnavailableError(error) && !localUnsub) {
          switchToLocalStore();
          localUnsub = subscribeDeliveriesLocal(callback);
        }
      }
    );

    return () => {
      if (remoteUnsub) remoteUnsub();
      if (localUnsub) localUnsub();
    };
  } catch (error) {
    console.warn('[LAYA] Firestore initialization failed (deliveries), switching to local:', error);
    if (isFirestoreUnavailableError(error)) {
      switchToLocalStore();
      return subscribeDeliveriesLocal(callback);
    }
    // Unrecoverable error, fallback to local
    switchToLocalStore();
    return subscribeDeliveriesLocal(callback);
  }
}

export function listenToDonations(callback: (donations: DonationRecord[]) => void) {
  if (!canUseRemoteFirestore()) {
    return subscribeDonationsLocal(callback);
  }

  let localUnsub: Unsubscribe | null = null;
  let remoteUnsub: Unsubscribe | null = null;

  try {
    const firestore = getFirestoreDbOrThrow();
    const q = query(collection(firestore, 'donations'), orderBy('createdAt', 'desc'));

    remoteUnsub = onSnapshot(
      q,
      async (snapshot) => {
        const items = snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<DonationRecord, 'id'>) }));
        for (const donation of items) {
          if (checkDonationExpiry(donation)) {
            try {
              await expireRemoteDonation(donation);
              donation.status = 'expired';
            } catch (error) {
              console.warn('[LAYA] Failed to expire donation during donation listener:', error);
            }
          }
        }
        writeLocal(LOCAL_KEYS.donations, items);
        callback(items);
      },
      (error) => {
        console.warn('[LAYA] Firestore listener error (donations):', error);
        if (isFirestoreUnavailableError(error) && !localUnsub) {
          switchToLocalStore();
          localUnsub = subscribeDonationsLocal(callback);
        }
      }
    );

    return () => {
      if (remoteUnsub) remoteUnsub();
      if (localUnsub) localUnsub();
    };
  } catch (error) {
    console.warn('[LAYA] Firestore initialization failed (donations), switching to local:', error);
    if (isFirestoreUnavailableError(error)) {
      switchToLocalStore();
      return subscribeDonationsLocal(callback);
    }
    // Unrecoverable error, fallback to local
    switchToLocalStore();
    return subscribeDonationsLocal(callback);
  }
}

// Matching helpers and engine
function toCoordinates(loc: NeedLocation | null) {
  if (!loc) return null;
  return { lat: Number(loc.lat), lng: Number(loc.lng) };
}

function calculateDistanceKmSimple(a: { lat: number; lng: number } | null, b: { lat: number; lng: number } | null) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const toRadians = (v: number) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const hav = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(hav), Math.sqrt(1 - hav));
}

function getUrgencyWeightLocal(urgency: NeedRecord['urgency']) {
  return urgency === 'high' ? 300 : urgency === 'medium' ? 180 : 90;
}

function getDistanceScoreLocal(distanceKm: number) {
  if (!Number.isFinite(distanceKm)) return 0;
  return Math.max(0, 100 - distanceKm * 5);
}

function getTimeUrgencyScoreLocal(requiredBefore: number) {
  const hoursUntil = Math.max((requiredBefore - Date.now()) / (1000 * 60 * 60), 0);
  return Math.max(0, 100 - hoursUntil * 10);
}

function canDeliverBeforeExpiry(expiryTime: number, durationMin: number) {
  const minutesLeft = Math.max((expiryTime - Date.now()) / (1000 * 60), 0);
  return minutesLeft > durationMin;
}

function isNeedCompatibleLocal(need: NeedRecord, donation: DonationRecord) {
  const needMeal = (need.mealType as string) || 'any';
  const needCat = (need.category as string) || 'any';
  const donMeal = (donation.mealType as string) || 'any';
  const donCat = (donation.category as string) || 'any';
  const mealOk = donMeal === 'any' || needMeal === 'any' || needMeal === donMeal;
  const catOk = donCat === 'any' || needCat === 'any' || needCat === donCat;
  return mealOk && catOk;
}

function pickBestNeedForDonation(donation: DonationRecord, needs: NeedRecord[]) {
  if (!needs.length) return null;

  const donorLoc = toCoordinates(donation.location);
  const valid = needs.filter((need) => {
    if (!isNeedCompatibleLocal(need, donation)) return false;
    const dist = calculateDistanceKmSimple(donorLoc, { lat: need.location.lat, lng: need.location.lng });
    return canDeliverBeforeExpiry(donation.expiryTime, (dist / 20) * 60);
  });

  if (!valid.length) return null;

  const scored = valid.map((need) => {
    const dist = calculateDistanceKmSimple(donorLoc, { lat: need.location.lat, lng: need.location.lng });
    const score = getUrgencyWeightLocal(need.urgency) + getDistanceScoreLocal(dist) + getTimeUrgencyScoreLocal(need.requiredBefore);
    return { need, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].need;
}

async function scoreNeedForDonation(donation: DonationRecord, need: NeedRecord) {
  if (!isNeedCompatibleLocal(need, donation)) return null;

  const donorLoc: RouteCoordinates | null = toCoordinates(donation.location);
  if (!donorLoc) return null;

  const route = await getRouteDistanceAndTime(donorLoc, { lat: need.location.lat, lng: need.location.lng });
  if (!route) return null;

  if (!canDeliverBeforeExpiry(donation.expiryTime, route.durationMin)) return null;

  const timeToExpiryMin = Math.max((donation.expiryTime - Date.now()) / (1000 * 60), 1);
  const score = getUrgencyWeightLocal(need.urgency)
    + (1 / Math.max(route.distanceKm, 0.001))
    + (1 / timeToExpiryMin)
    - (route.durationMin / 60);

  return { need, score };
}

async function scoreDonationForNeed(need: NeedRecord, donation: DonationRecord) {
  if (!isNeedCompatibleLocal(need, donation)) return null;

  const donorLoc: RouteCoordinates = { lat: donation.location.lat, lng: donation.location.lng };
  const route = await getRouteDistanceAndTime(donorLoc, { lat: need.location.lat, lng: need.location.lng });
  if (!route) return null;

  if (!canDeliverBeforeExpiry(donation.expiryTime, route.durationMin)) return null;

  const timeToExpiryMin = Math.max((donation.expiryTime - Date.now()) / (1000 * 60), 1);
  const score = getUrgencyWeightLocal(need.urgency)
    + (1 / Math.max(route.distanceKm, 0.001))
    + (1 / timeToExpiryMin)
    - (route.durationMin / 60);

  return { donation, score };
}

async function pickBestNeedForDonationAsync(donation: DonationRecord, needs: NeedRecord[]) {
  if (!needs.length) return null;

  const scored: Array<{ need: NeedRecord; score: number }> = [];
  for (const need of needs) {
    const scoredNeed = await scoreNeedForDonation(donation, need);
    if (scoredNeed) scored.push(scoredNeed);
  }

  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score);
  return scored[0].need;
}

async function pickBestDonationForNeedAsync(need: NeedRecord, donations: DonationRecord[]) {
  if (!donations.length) return null;

  const scored: Array<{ donation: DonationRecord; score: number }> = [];
  for (const donation of donations) {
    const scoredDonation = await scoreDonationForNeed(need, donation);
    if (scoredDonation) scored.push(scoredDonation);
  }

  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score);
  return scored[0].donation;
}

function pickBestDonationForNeed(need: NeedRecord, donations: DonationRecord[]) {
  if (!donations.length) return null;

  const scored = donations
    .filter((donation) => {
      if (!isNeedCompatibleLocal(need, donation)) return false;
      const dist = calculateDistanceKmSimple({ lat: donation.location.lat, lng: donation.location.lng }, { lat: need.location.lat, lng: need.location.lng });
      if (!canDeliverBeforeExpiry(donation.expiryTime, (dist / 20) * 60)) return false;
      return donation.expiryTime > Date.now();
    })
    .map((donation) => {
      const dist = calculateDistanceKmSimple({ lat: donation.location.lat, lng: donation.location.lng }, { lat: need.location.lat, lng: need.location.lng });
      const score = getUrgencyWeightLocal(need.urgency) + getDistanceScoreLocal(dist) + getTimeUrgencyScoreLocal(need.requiredBefore);
      return { donation, score };
    });

  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score);
  return scored[0].donation;
}

export function checkDonationExpiry(donation: DonationRecord) {
  return donation.status !== 'completed' && donation.status !== 'expired' && donation.status !== 'cancelled' && donation.expiryTime <= Date.now();
}

async function expireRemoteDonation(donation: DonationRecord) {
  const firestore = getFirestoreDbOrThrow();
  const donationRef = doc(firestore, 'donations', donation.id);

  await runTransaction(firestore, async (tx) => {
    const donationSnap = await tx.get(donationRef);
    if (!donationSnap.exists()) return;

    const currentDonation = donationSnap.data() as Omit<DonationRecord, 'id'>;
    if (!checkDonationExpiry({ id: donation.id, ...currentDonation })) return;

    const deliveryQuery = query(collection(firestore, 'deliveries'), where('donationId', '==', donation.id));
    const deliverySnapshot = await getDocs(deliveryQuery);
    const hasInTransit = deliverySnapshot.docs.some((docSnap) => {
      const delivery = docSnap.data() as Omit<DeliveryRecord, 'id'>;
      return delivery.status === 'in_transit';
    });

    if (hasInTransit) {
      return;
    }

    tx.update(donationRef, { status: 'expired' } as DocumentData);

    if (currentDonation.assignedNeedId) {
      const needRef = doc(firestore, 'needs', currentDonation.assignedNeedId);
      const needSnap = await tx.get(needRef);
      if (needSnap.exists()) {
        const needData = needSnap.data() as Omit<NeedRecord, 'id'>;
        if (needData.status === 'assigned') {
          tx.update(needRef, { status: 'open' } as DocumentData);
        }
      }
    }

    deliverySnapshot.docs.forEach((deliveryDoc) => {
      const delivery = deliveryDoc.data() as Omit<DeliveryRecord, 'id'>;
      if (delivery.status !== 'delivered' && delivery.status !== 'cancelled' && delivery.status !== 'in_transit') {
        tx.update(deliveryDoc.ref, { status: 'cancelled' } as DocumentData);
      }
    });
  });
}

function expireLocalDonation(donation: DonationRecord, needs: NeedRecord[], deliveries: DeliveryRecord[]) {
  donation.status = 'expired';
  const delivery = deliveries.find((item) => item.donationId === donation.id && item.status !== 'delivered' && item.status !== 'cancelled');
  if (delivery && delivery.status !== 'in_transit') {
    delivery.status = 'cancelled';
  }

  if (donation.assignedNeedId) {
    const need = needs.find((item) => item.id === donation.assignedNeedId);
    if (need && need.status === 'assigned') {
      need.status = 'open';
    }
  }
}

function runLocalMatchingPass() {
  const donations = readLocalDonations();
  const needs = readLocalNeeds();
  const deliveries = readLocalDeliveries();
  let changed = false;

  for (const donation of donations) {
    if (checkDonationExpiry(donation)) {
      const inTransitDelivery = deliveries.find((item) => item.donationId === donation.id && item.status === 'in_transit');
      if (inTransitDelivery) continue;

      expireLocalDonation(donation, needs, deliveries);
      changed = true;
      continue;
    }

    if (donation.status !== 'pending') continue;

    const existingDelivery = deliveries.find((delivery) => delivery.donationId === donation.id && delivery.status !== 'delivered');
    if (existingDelivery) continue;

    const bestNeed = pickBestNeedForDonation(
      donation,
      needs.filter((need) => need.status === 'open')
    );

    if (!bestNeed) continue;

    donation.status = 'assigned';
    donation.assignedNeedId = bestNeed.id;

    const need = needs.find((item) => item.id === bestNeed.id);
    if (need) need.status = 'assigned';

    deliveries.unshift({
      id: createLocalId('delivery'),
      donationId: donation.id,
      needId: bestNeed.id,
      ngoId: bestNeed.ngoId,
      agentId: null,
      pickupLocation: donation.location,
      dropLocation: bestNeed.location,
      donorId: donation.donorId,
      donorName: donation.donorId,
      agentLocation: null,
      foodType: donation.foodType,
      mealType: donation.mealType,
      category: donation.category,
      quantity: donation.quantity,
      status: 'pending',
      createdAt: Date.now(),
    });

    changed = true;
  }

  if (changed) {
    writeLocal(LOCAL_KEYS.donations, donations);
    writeLocal(LOCAL_KEYS.needs, needs);
    writeLocal(LOCAL_KEYS.deliveries, deliveries);
    emitDonations();
    emitNeeds();
    emitDeliveries();
  }
}

function startLocalMatchingEngine() {
  runLocalMatchingPass();
  const timer = setInterval(runLocalMatchingPass, 2500);
  return () => window.clearInterval(timer);
}

export async function findBestNeedForDonation(donation: DonationRecord) {
  if (!canUseRemoteFirestore()) {
    return pickBestNeedForDonation(donation, readLocalNeeds().filter((need) => need.status === 'open'));
  }

  try {
    const firestore = getFirestoreDbOrThrow();
    const needsSnap = await getDocs(query(collection(firestore, 'needs'), where('status', '==', 'open')));
    const needs: NeedRecord[] = needsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<NeedRecord, 'id'>) }));
    return await pickBestNeedForDonationAsync(donation, needs);
  } catch (error) {
    if (isFirestoreMissingError(error)) {
      switchToLocalStore();
      return pickBestNeedForDonation(donation, readLocalNeeds().filter((need) => need.status === 'open'));
    }
    throw error;
  }
}

export async function findBestDonationForNeed(need: NeedRecord) {
  if (!canUseRemoteFirestore()) {
    return pickBestDonationForNeed(need, readLocalDonations().filter((donation) => donation.status === 'pending'));
  }

  try {
    const firestore = getFirestoreDbOrThrow();
    const donationsSnap = await getDocs(query(collection(firestore, 'donations'), where('status', '==', 'pending')));
    const donations: DonationRecord[] = donationsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DonationRecord, 'id'>) }));
    return await pickBestDonationForNeedAsync(need, donations);
  } catch (error) {
    if (isFirestoreMissingError(error)) {
      switchToLocalStore();
      return pickBestDonationForNeed(need, readLocalDonations().filter((donation) => donation.status === 'pending'));
    }
    throw error;
  }
}

async function assignMatchTransaction(donationId: string, needId: string) {
  const firestore = getFirestoreDbOrThrow();
  const donationRef = doc(firestore, 'donations', donationId);
  const needRef = doc(firestore, 'needs', needId);
  const deliveryRef = doc(collection(firestore, 'deliveries'));

  try {
    await runTransaction(firestore, async (tx) => {
      const donationSnap = await tx.get(donationRef);
      const needSnap = await tx.get(needRef);

      if (!donationSnap.exists() || !needSnap.exists()) {
        throw new Error('Missing donation or need');
      }

      const donation = donationSnap.data() as Omit<DonationRecord, 'id'>;
      const need = needSnap.data() as Omit<NeedRecord, 'id'>;

      if (donation.status !== 'pending') {
        throw new Error('Donation already assigned or inactive');
      }

      if (need.status !== 'open') {
        throw new Error('Need already assigned');
      }

      if (donation.expiryTime <= Date.now()) {
        // mark expired and abort
        tx.update(donationRef, { status: 'expired' } as DocumentData);
        throw new Error('Donation expired');
      }

      tx.update(donationRef, { status: 'assigned', assignedNeedId: needId } as DocumentData);
      tx.update(needRef, { status: 'assigned' } as DocumentData);
      tx.set(deliveryRef, {
        donationId,
        needId,
        ngoId: need.ngoId,
        agentId: null,
        pickupLocation: donation.location,
        dropLocation: need.location,
        donorId: donation.donorId,
        donorName: donation.donorId,
        foodType: donation.foodType,
        mealType: donation.mealType,
        category: donation.category,
        quantity: donation.quantity,
        status: 'pending',
        createdAt: Date.now(),
      } as DocumentData);
    });
  } catch (error) {
    // transaction failed; log and let engine retry
    console.warn('[LAYA] assignMatchTransaction failed:', error);
  }
}

export function startMatchingEngine() {
  if (!canUseRemoteFirestore()) return startLocalMatchingEngine();

  let localStop: (() => void) | null = null;
  let donationsUnsub: Unsubscribe | null = null;
  let needsUnsub: Unsubscribe | null = null;
  
  const activateLocal = () => {
    if (!localStop) {
      console.warn('[LAYA] Firestore unavailable, activating local matching engine');
      switchToLocalStore();
      localStop = startLocalMatchingEngine();
    }
  };

  try {
    const firestore = getFirestoreDbOrThrow();

    // Listen for new pending donations
    const donationsQuery = query(collection(firestore, 'donations'), where('status', '==', 'pending'));
    donationsUnsub = onSnapshot(
      donationsQuery,
      async (snapshot) => {
        for (const docSnap of snapshot.docs) {
          const donation = { id: docSnap.id, ...(docSnap.data() as Omit<DonationRecord, 'id'>) } as DonationRecord;
          if (checkDonationExpiry(donation)) {
            try {
              await expireRemoteDonation(donation);
            } catch (error) {
              console.warn('[LAYA] Failed to expire donation:', error);
            }
            continue;
          }

          const bestNeed = await findBestNeedForDonation(donation);
          if (bestNeed) {
            await assignMatchTransaction(donation.id, bestNeed.id);
          }
        }
      },
      (error) => {
        console.warn('[LAYA] Firestore donation listener error:', error);
        if (isFirestoreUnavailableError(error)) activateLocal();
      }
    );

    // Listen for new open needs
    const needsQuery = query(collection(firestore, 'needs'), where('status', '==', 'open'));
    needsUnsub = onSnapshot(
      needsQuery,
      async (snapshot) => {
        for (const docSnap of snapshot.docs) {
          const need = { id: docSnap.id, ...(docSnap.data() as Omit<NeedRecord, 'id'>) } as NeedRecord;
          const bestDonation = await findBestDonationForNeed(need);
          if (bestDonation) {
            await assignMatchTransaction(bestDonation.id, need.id);
          }
        }
      },
      (error) => {
        console.warn('[LAYA] Firestore needs listener error:', error);
        if (isFirestoreUnavailableError(error)) activateLocal();
      }
    );

    return () => {
      if (donationsUnsub) donationsUnsub();
      if (needsUnsub) needsUnsub();
      if (localStop) localStop();
    };
  } catch (error) {
    console.warn('[LAYA] Firestore initialization failed in matching engine, using local:', error);
    activateLocal();
    return () => {
      if (localStop) localStop();
    };
  }
}

export async function createNeed(input: Omit<NeedRecord, 'id' | 'status' | 'createdAt'>) {
  const createdAt = Date.now();
  const createLocal = () => {
    const id = createLocalId('need');
    const needs = readLocalNeeds();
    needs.unshift({ id, ...input, status: 'open', createdAt });
    writeLocal(LOCAL_KEYS.needs, needs);
    emitNeeds();
    return id;
  };

  if (!canUseRemoteFirestore()) {
    return createLocal();
  }

  try {
    const firestore = getFirestoreDbOrThrow();
    const docRef = await addDoc(collection(firestore, 'needs'), {
      ...input,
      status: 'open',
      createdAt,
    });
    const needs = readLocalNeeds().filter((item) => item.id !== docRef.id);
    needs.unshift({ id: docRef.id, ...input, status: 'open', createdAt });
    writeLocal(LOCAL_KEYS.needs, needs);
    emitNeeds();
    return docRef.id;
  } catch (error) {
    if (isFirestoreMissingError(error)) {
      switchToLocalStore();
      return createLocal();
    }
    throw error;
  }
}

export async function updateNeed(id: string, patch: Partial<Omit<NeedRecord, 'id'>>) {
  const updateLocal = () => {
    const needs = readLocalNeeds().map((item) => (item.id === id ? { ...item, ...patch } : item));
    writeLocal(LOCAL_KEYS.needs, needs);
    emitNeeds();
  };

  if (!canUseRemoteFirestore()) {
    updateLocal();
    return;
  }

  try {
    const firestore = getFirestoreDbOrThrow();
    await updateDoc(doc(firestore, 'needs', id), patch as DocumentData);
    updateLocal();
  } catch (error) {
    if (isFirestoreMissingError(error)) {
      switchToLocalStore();
      updateLocal();
      return;
    }
    throw error;
  }
}

export async function createDelivery(input: Omit<DeliveryRecord, 'id' | 'createdAt'>) {
  const createdAt = Date.now();
  const createLocal = () => {
    const id = createLocalId('delivery');
    const deliveries = readLocalDeliveries();
    deliveries.unshift({ id, ...input, createdAt });
    writeLocal(LOCAL_KEYS.deliveries, deliveries);
    emitDeliveries();
    return id;
  };

  if (!canUseRemoteFirestore()) {
    return createLocal();
  }

  try {
    const firestore = getFirestoreDbOrThrow();
    const docRef = await addDoc(collection(firestore, 'deliveries'), {
      ...input,
      createdAt,
    });
    const deliveries = readLocalDeliveries().filter((item) => item.id !== docRef.id);
    deliveries.unshift({ id: docRef.id, ...input, createdAt });
    writeLocal(LOCAL_KEYS.deliveries, deliveries);
    emitDeliveries();
    return docRef.id;
  } catch (error) {
    if (isFirestoreMissingError(error)) {
      switchToLocalStore();
      return createLocal();
    }
    throw error;
  }
}

export async function createDonation(input: Omit<DonationRecord, 'id' | 'createdAt'>) {
  const createdAt = Date.now();
  const createLocal = () => {
    const id = createLocalId('donation');
    const donations = readLocalDonations();
    donations.unshift({ id, ...input, createdAt });
    writeLocal(LOCAL_KEYS.donations, donations);
    emitDonations();
    return id;
  };

  if (!canUseRemoteFirestore()) {
    return createLocal();
  }

  try {
    const firestore = getFirestoreDbOrThrow();
    const docRef = await addDoc(collection(firestore, 'donations'), {
      ...input,
      createdAt,
    });
    const donations = readLocalDonations().filter((item) => item.id !== docRef.id);
    donations.unshift({ id: docRef.id, ...input, createdAt });
    writeLocal(LOCAL_KEYS.donations, donations);
    emitDonations();
    return docRef.id;
  } catch (error) {
    console.warn('[LAYA] Firestore createDonation failed, falling back to local:', error);
    if (isFirestoreUnavailableError(error)) {
      switchToLocalStore();
      return createLocal();
    }
    // For other errors, still fallback to local to ensure donation is created
    switchToLocalStore();
    return createLocal();
  }
}

export async function updateDonation(id: string, patch: Partial<Omit<DonationRecord, 'id'>>) {
  const updateLocal = () => {
    const donations = readLocalDonations().map((item) => (item.id === id ? { ...item, ...patch } : item));
    writeLocal(LOCAL_KEYS.donations, donations);
    emitDonations();
  };

  if (!canUseRemoteFirestore()) {
    updateLocal();
    return;
  }

  try {
    const firestore = getFirestoreDbOrThrow();
    await updateDoc(doc(firestore, 'donations', id), patch as DocumentData);
    updateLocal();
  } catch (error) {
    console.warn('[LAYA] Firestore updateDonation failed, falling back to local:', error);
    if (isFirestoreUnavailableError(error)) {
      switchToLocalStore();
      updateLocal();
      return;
    }
    // Fallback for other errors too, to ensure donation is updated
    updateLocal();
  }
}

export async function updateDelivery(id: string, patch: Partial<Omit<DeliveryRecord, 'id'>>) {
  const updateLocal = () => {
    const deliveries = readLocalDeliveries().map((item) => (item.id === id ? { ...item, ...patch } : item));
    writeLocal(LOCAL_KEYS.deliveries, deliveries);
    emitDeliveries();
  };

  if (!canUseRemoteFirestore()) {
    updateLocal();
    return;
  }

  try {
    const firestore = getFirestoreDbOrThrow();
    await updateDoc(doc(firestore, 'deliveries', id), patch as DocumentData);
    updateLocal();
  } catch (error) {
    if (isFirestoreMissingError(error)) {
      switchToLocalStore();
      updateLocal();
      return;
    }
    throw error;
  }
}

export async function acceptDeliveryAssignment(id: string, agentId: string) {
  const acceptLocal = (agentInfo?: { name?: string; vehicleNumber?: string; profileImageUrl?: string }) => {
    const deliveries = readLocalDeliveries().map((item) => {
      if (item.id !== id) return item;

      if (item.agentId != null && item.agentId !== agentId) {
        throw new Error('Delivery already assigned to another agent');
      }

      return {
        ...item,
        agentId,
        agentName: agentInfo?.name,
        agentVehicleNumber: agentInfo?.vehicleNumber,
        agentProfileImageUrl: agentInfo?.profileImageUrl,
        status: 'accepted' as DeliveryRecord['status'],
      };
    });

    writeLocal(LOCAL_KEYS.deliveries, deliveries);
    emitDeliveries();
    return true;
  };

  if (!canUseRemoteFirestore()) {
    return acceptLocal();
  }

  try {
    const firestore = getFirestoreDbOrThrow();
    const deliveryRef = doc(firestore, 'deliveries', id);

    // Get agent details
    const agentProfile = await getUserProfile(agentId);
    const agentInfo = {
      name: agentProfile?.name || 'Delivery Agent',
      vehicleNumber: agentProfile?.vehicleNumber,
      profileImageUrl: agentProfile?.profileImageUrl,
    };

    await runTransaction(firestore, async (tx) => {
      const snap = await tx.get(deliveryRef);
      if (!snap.exists()) {
        throw new Error('Delivery not found');
      }

      const delivery = snap.data() as Omit<DeliveryRecord, 'id'>;

      if (delivery.agentId != null && delivery.agentId !== agentId) {
        throw new Error('Delivery already assigned to another agent');
      }

      if (delivery.status !== 'pending' && delivery.status !== 'accepted') {
        throw new Error('Delivery is no longer available');
      }

      tx.update(deliveryRef, {
        agentId,
        agentName: agentInfo.name,
        agentVehicleNumber: agentInfo.vehicleNumber,
        agentProfileImageUrl: agentInfo.profileImageUrl,
        status: 'accepted',
      } as DocumentData);
    });

    return acceptLocal(agentInfo);
  } catch (error) {
    console.warn('[LAYA] acceptDeliveryAssignment failed, falling back to local:', error);
    if (isFirestoreUnavailableError(error)) {
      switchToLocalStore();
      return acceptLocal();
    }
    throw error;
  }
}

export type { UserProfile };
export type { NeedLocation, NeedRecord, DonationRecord, DeliveryRecord };
