import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged as fbOnAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  type User as FirebaseUser,
} from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

type UserProfile = {
  uid: string;
  name?: string;
  email?: string;
  role?: string;
  displayRoleLabel?: string;
  uiRole?: string;
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

function init() {
  if (!isConfigured()) return;
  if (getApps().length > 0) return;

  const firebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
    measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
  } as Record<string, string | undefined>;

  try {
    initializeApp(firebaseConfig as Record<string, string>);
    auth = getAuth();
  } catch (err) {
    // initialization failed; leave auth/db null
  }
}

init();

export function isFirebaseConfigured() {
  return isConfigured() && auth !== null;
}

export async function signUpWithEmail(email: string, password: string, name: string, role: string, displayRoleLabel?: string, uiRole?: string) {
  if (!isFirebaseConfigured()) throw new Error('Firebase not configured');

  const userCredential = await createUserWithEmailAndPassword(auth!, email, password);
  const uid = userCredential.user.uid;

  const profile: UserProfile = { uid, name, email, role, displayRoleLabel, uiRole };

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
    await setDoc(doc(firestore, 'users', uid), profile, { merge: true } as any);
  } catch {
    // ignore Firestore availability issues
  }
}

export async function signInWithGoogle(role: string, displayRoleLabel?: string, uiRole?: string) {
  if (!isFirebaseConfigured()) throw new Error('Firebase not configured');

  const provider = new GoogleAuthProvider();
  const userCredential = await signInWithPopup(auth!, provider);
  const user = userCredential.user;
  const uid = user.uid;

  // Check if profile exists
  const existingProfile = await getUserProfile(uid);

  if (!existingProfile) {
    // New user - create profile with provided role
    const name = user.displayName || user.email?.split('@')[0] || 'User';
    const profile: UserProfile = { uid, name, email: user.email || '', role, displayRoleLabel, uiRole };
    const firestore = getDb();
    if (firestore) {
      try {
        await setDoc(doc(firestore, 'users', uid), profile);
      } catch {
        // ignore Firestore availability issues
      }
    }
  } else if ((displayRoleLabel && existingProfile.displayRoleLabel !== displayRoleLabel) || (uiRole && existingProfile.uiRole !== uiRole)) {
    const firestore = getDb();
    if (firestore) {
      try {
        await setDoc(doc(firestore, 'users', uid), { displayRoleLabel, uiRole }, { merge: true } as any);
      } catch {
        // ignore Firestore availability issues
      }
    }
  }

  return user;
}

export type { UserProfile };
