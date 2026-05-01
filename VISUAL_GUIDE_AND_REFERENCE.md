# Laya Authentication System - Visual Guide & Reference

---

## 📊 Authentication Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    LANDING PAGE (Unauthenticated)              │
│  "Join as Donor" | "Join as NGO" | "Join as Volunteer"        │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │ SELECT ROLE │
                    └──────┬──────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────▼────┐        ┌────▼────┐       ┌────▼────┐
   │  DONOR   │        │   NGO    │       │VOLUNTEER│
   └────┬────┘        └────┬────┘       └────┬────┘
        │                  │                  │
   ┌────▼─────────────────────────────────────▼────┐
   │  SIGNUP/SIGNIN FORM                           │
   │  Name | Email | Password | [SUBMIT]           │
   └────┬────────────────────────────────────────────┘
        │
   ┌────▼────────────────────────────────────────┐
   │  FIREBASE AUTHENTICATION                    │
   │  ✓ Email/Password created/verified          │
   │  ✓ User UID generated                       │
   └────┬──────────────────────────────────────┬─┘
        │                                      │
   ┌────▼──────┐                        ┌─────▼────────┐
   │ Firestore │                        │ localStorage │
   │  User Doc │                        │ Session Data │
   │  Created  │                        │   Stored     │
   └────┬──────┘                        └─────┬────────┘
        │                                      │
        └──────────────┬───────────────────────┘
                       │
        ┌──────────────▼──────────────┐
        │ ROLE MAPPING & STATE       │
        │ uiRole: 'donor/ngo/vol'    │
        │ displayRoleLabel: 'Donor'  │
        └──────────────┬──────────────┘
                       │
    ┌──────────────────▼──────────────────┐
    │     ROLE-BASED DASHBOARD LOAD      │
    └──────────────────┬──────────────────┘
         │
    ┌────┴────┬────────┬─────────┐
    │          │        │         │
┌───▼───┐ ┌───▼───┐ ┌──▼───┐ ┌─▼────┐
│Donor  │ │  NGO  │ │  Vol │ │Other │
│Dash   │ │ Dash  │ │ Dash │ │ Role │
└───────┘ └───────┘ └──────┘ └──────┘
```

---

## 👤 User Journey Maps

### DONOR JOURNEY
```
LANDING
   ↓
[Click "Join as Donor"]
   ↓
SIGNUP FORM
   ├─ Name: "John Smith"
   ├─ Email: "john@example.com"
   ├─ Password: "SecurePass123"
   └─ Role: DONOR
   ↓
[SUBMIT]
   ↓
Firebase Auth Creates User
Firestore Stores Profile
localStorage Session Created
   ↓
DONOR DASHBOARD ✓
   ├─ Navigation: Donations | Live Needs | Tracking
   ├─ Can: Create donation, view needs, track deliveries
   └─ Cannot: Post needs, accept deliveries
   ↓
[REFRESH PAGE]
   ↓
Session Restored from localStorage
Stay Logged In ✓
   ↓
[PROFILE] → [SIGN OUT]
   ↓
Session Cleared
Redirected to Login ✓
```

### NGO JOURNEY
```
LANDING
   ↓
[Click "Join as NGO"]
   ↓
SIGNUP FORM
   ├─ Name: "Relief NGO"
   ├─ Email: "relief@ngo.org"
   ├─ Password: "SecurePass123"
   └─ Role: NGO
   ↓
[SUBMIT]
   ↓
Firebase Auth Creates User
Firestore Stores Profile with role="ngo"
localStorage Session Created
   ↓
NGO DASHBOARD ✓
   ├─ Navigation: Intake | Live Needs | Network
   ├─ Can: Post needs, view donations, track deliveries
   └─ Cannot: Create donations, accept deliveries
   ↓
[POST NEED]
   ↓
Firestore 'needs' Collection Updated
Real-time Listeners Notify All Connected Clients
Donors See in "Live Needs"
Volunteers See in Delivery System
   ↓
[REFRESH PAGE]
   ↓
Session & Data Restored ✓
Continue Where Left Off
```

### VOLUNTEER JOURNEY
```
LANDING
   ↓
[Click "Join as Volunteer"]
   ↓
SIGNUP FORM
   ├─ Name: "Alex Delivery"
   ├─ Email: "alex@volunteer.com"
   ├─ Password: "SecurePass123"
   └─ Role: VOLUNTEER
   ↓
[SUBMIT]
   ↓
Firebase Auth Creates User
Firestore Stores Profile with role="delivery-agent"
localStorage Session Created
   ↓
VOLUNTEER DASHBOARD ✓
   ├─ Navigation: Assignments | Active Delivery | History
   ├─ Can: Accept deliveries, track deliveries
   └─ Cannot: Create donations/needs
   ↓
[MY ASSIGNMENTS] → [ACCEPT DELIVERY]
   ↓
Firestore 'deliveries' Collection Updated
agentId Set to Current User
   ↓
[ACTIVE DELIVERY]
   ├─ See Pickup & Drop Locations
   ├─ Track in Real-time
   └─ Mark Status: Accepted → Picked → In Transit → Delivered
   ↓
[MARK DELIVERED]
   ↓
Delivery Marked Complete
Donor & NGO See Status Updated
History Updated
   ↓
[REFRESH PAGE]
   ↓
Session & Delivery Status Persisted ✓
```

---

## 🔒 Role Permission Matrix

```
┌─────────────────────┬────────┬────────┬──────────┐
│ Feature             │ Donor  │  NGO   │Volunteer │
├─────────────────────┼────────┼────────┼──────────┤
│ Create Donation     │   ✅   │   ❌   │    ❌    │
│ View Live Needs     │   ✅   │   ✅   │    ❌    │
│ Create Need         │   ❌   │   ✅   │    ❌    │
│ Accept Delivery     │   ❌   │   ❌   │    ✅    │
│ Track Own Donation  │   ✅   │   ❌   │    ❌    │
│ View Intake         │   ❌   │   ✅   │    ❌    │
│ Track Own Delivery  │   ❌   │   ❌   │    ✅    │
│ View Network        │   ❌   │   ✅   │    ❌    │
│ Create Profile      │   ✅   │   ✅   │    ✅    │
│ Edit Own Profile    │   ✅   │   ✅   │    ✅    │
│ Access Dashboard    │   ✅   │   ✅   │    ✅    │
│ Logout              │   ✅   │   ✅   │    ✅    │
└─────────────────────┴────────┴────────┴──────────┘

KEY: ✅ = Allowed | ❌ = Blocked
```

---

## 💾 Data Structure Reference

### Session Object (localStorage)
```javascript
{
  "laya.session.v1": {
    "uid": "unique-user-id-or-email",
    "name": "User Full Name",
    "email": "user@example.com",
    "role": "customer" | "delivery-agent" | "ngo",
    "uiRole": "donor" | "ngo" | "volunteer",
    "displayRoleLabel": "Donor" | "NGO" | "Volunteer"
  }
}
```

### Firestore User Document
```javascript
/users/{uid}
├── uid: string (unique ID)
├── name: string (display name)
├── email: string (user email)
├── role: string ("customer" | "delivery-agent" | "ngo")
├── uiRole: string ("donor" | "ngo" | "volunteer")
├── displayRoleLabel: string ("Donor" | "NGO" | "Volunteer")
└── [optional]
    ├── createdAt: timestamp
    ├── updatedAt: timestamp
    └── preferences: object
```

### Firestore Needs Collection
```javascript
/needs/{needId}
├── id: string (document ID)
├── ngoId: string (creator's email)
├── ngoName: string (NGO name)
├── location: {
│   ├── lat: number
│   ├── lng: number
│   └── address: string
├── peopleCount: number
├── foodType: string
├── mealType: "veg" | "non-veg" | "any"
├── category: "prepared-food" | "raw-food" | "packed-food" | "any"
├── urgency: "high" | "medium" | "low"
├── requiredBefore: timestamp
├── status: "open" | "assigned" | "fulfilled"
└── createdAt: timestamp
```

### Firestore Donations Collection
```javascript
/donations/{donationId}
├── id: string
├── donorId: string (creator's email)
├── foodType: string
├── mealType: "veg" | "non-veg" | "any"
├── category: "prepared-food" | "raw-food" | "packed-food"
├── quantity: string
├── expiryTime: timestamp
├── location: { lat, lng, address }
├── status: "pending" | "assigned" | "completed" | "expired"
├── assignedNeedId: string (if matched)
├── notificationEnabled: boolean
└── createdAt: timestamp
```

### Firestore Deliveries Collection
```javascript
/deliveries/{deliveryId}
├── id: string
├── donorId: string (food source)
├── donorName: string
├── ngoId: string (beneficiary)
├── agentId: string | null (volunteer)
├── donationId: string (linked donation)
├── needId: string (linked need)
├── pickupLocation: { lat, lng, address }
├── dropLocation: { lat, lng, address }
├── agentLocation: { lat, lng, address, updatedAt } | null
├── foodType: string
├── quantity: string
├── status: "pending" | "accepted" | "picked" | "in_transit" | "delivered"
├── deliveredAt: timestamp | null
└── createdAt: timestamp
```

---

## 🔄 Multi-Session Data Sync Flow

```
┌──────────────────────┐     ┌──────────────────────┐     ┌──────────────────────┐
│   WINDOW 1: DONOR    │     │   WINDOW 2: NGO      │     │  WINDOW 3: VOLUNTEER │
│  📱 Logged In        │     │  📱 Logged In        │     │  📱 Logged In        │
└──────────────────────┘     └──────────────────────┘     └──────────────────────┘
        │                            │                            │
        │                            │                            │
   [1] CREATE DONATION               │                            │
        │                            │                            │
        ├──→ Firestore DB            │                            │
        │    (saves donation)        │                            │
        │                            │                            │
        │                      [2] Real-time listener             │
        │                           triggered                     │
        │                      (sees new donation)                │
        │                            │                            │
        │                       [3] POST NEED                     │
        │                            │                            │
        │                      ┌─────▼─────┐                     │
        │                      │  Firestore │                     │
        │                      │ (saves need)                    │
        │                      └──────┬──────┘                    │
        │                             │                          │
        │                   [4] Real-time listener trigger       │
        │              ┌──────────────────┴─────────────┐        │
        │              │ Donors see new need   [5]      │        │
        │              │ Volunteers see new delivery    │        │
        │              │ (auto-created delivery item)   │        │
        └─────────────────────────┬────────────────────┘
                                  │
                        [6] VOLUNTEER ACCEPTS
                                  │
                        ┌─────────▼────────────┐
                        │   Firestore         │
                        │ (agentId set)       │
                        └─────────┬───────────┘
                                  │
                    [7] All windows see update
                    (donor: "assigned status")
                    (ngo: "matched delivery")
                    (volunteer: "assigned to me")
```

---

## 🛡️ Security Layers

```
LAYER 1: FRONTEND AUTHENTICATION
┌───────────────────────────────────┐
│ Email/Password Input              │
│ Client-side Validation            │
│ Submit to Firebase Auth           │
└───────────────┬───────────────────┘

LAYER 2: FIREBASE AUTHENTICATION
┌───────────────────────────────────┐
│ Firebase Auth Service             │
│ Validates Email/Password          │
│ Returns Auth Token (JWT)          │
│ Stores Secure Session             │
└───────────────┬───────────────────┘

LAYER 3: FIRESTORE SECURITY RULES
┌───────────────────────────────────┐
│ Firestore Rules Engine            │
│ Validates User's Auth Token       │
│ Checks Role-Based Permissions     │
│ Allows/Denies Read/Write          │
└───────────────┬───────────────────┘

LAYER 4: FRONTEND ROLE-BASED UI
┌───────────────────────────────────┐
│ React Conditional Rendering       │
│ Components Only Show for Role     │
│ Navigation Menu Filtered          │
│ Buttons/Forms Hidden if Unauthorized
└───────────────────────────────────┘

RESULT: Multi-layer protection
         User must pass all 4 layers
         to access restricted features
```

---

## 📋 Quick Validation Commands

### In Browser Console (F12)

**Check Current Session:**
```javascript
const session = JSON.parse(localStorage.getItem('laya.session.v1') || '{}');
console.log('Current Session:', session);
console.log('Role:', session.uiRole);
```

**Check All Test Accounts:**
```javascript
const accounts = JSON.parse(localStorage.getItem('laya.accounts.v1') || '[]');
console.table(accounts);
```

**Check Profile Cache:**
```javascript
const cache = JSON.parse(localStorage.getItem('laya.profile-cache.v1') || '{}');
console.table(cache);
```

**Check Firebase User:**
```javascript
if (window.firebase) {
  const user = firebase.auth().currentUser;
  console.log('Firebase User:', user ? user.email : 'Not logged in');
} else {
  console.log('Firebase not available');
}
```

**Simulate Logout (localStorage clear):**
```javascript
localStorage.removeItem('laya.session.v1');
window.location.reload();
```

**Check All Storage:**
```javascript
console.log('=== ALL STORAGE ===');
Object.keys(localStorage).forEach(key => {
  if (key.startsWith('laya.')) {
    console.log(key, '→', localStorage.getItem(key));
  }
});
```

---

## 🎯 Test Scenario Examples

### Scenario 1: Donor Creates Donation → NGO Sees It
```
Step 1: Donor Window
  Login as: donor@example.com
  Dashboard: "Food Donations" tab
  Action: [+ CREATE DONATION]
  Enter: Veg Curry, 10 servings, 2 hours
  Result: Donation created ✓

Step 2: NGO Window
  Login as: ngo@example.com
  Dashboard: "Live Needs" tab
  Wait: 1-2 seconds
  Result: Sees "Veg Curry from donor" ✓
```

### Scenario 2: NGO Posts Need → Volunteer Gets Assignment
```
Step 1: NGO Window
  Dashboard: "Requests" (Intake) tab
  Action: [+ CREATE NEED]
  Enter: 50 people need meals, School, 2 hours
  Result: Need posted ✓

Step 2: Donor Window
  Dashboard: "Live Needs" tab
  Wait: 1-2 seconds
  Result: Sees "50 people need food at School" ✓

Step 3: Volunteer Window
  Dashboard: "My Assignments" tab
  Wait: 1-2 seconds (auto-matched if conditions met)
  Result: Sees delivery assignment ✓
```

### Scenario 3: Volunteer Completes Delivery
```
Step 1: Volunteer Window
  Dashboard: "Active Delivery" tab
  Status: Shows "Pickup → In Transit → Delivered"
  Action: [Mark Delivered]
  Result: Status changed ✓

Step 2: Donor Window
  Donation now shows: Status = "Completed"
  Result: Donor sees success ✓

Step 3: NGO Window
  Need now shows: Status = "Fulfilled"
  Result: NGO sees completion ✓

Step 4: Volunteer Window
  Delivery moved to: "History" tab
  Result: Volunteer sees completed list ✓
```

---

## 🚨 Common Error Messages & Meanings

| Error | Cause | Solution |
|-------|-------|----------|
| `Firebase not configured` | Missing .env variables | Add VITE_FIREBASE_* to .env |
| `No matching account was found for that role and password` | Wrong credentials OR wrong role selected | Use correct email/password/role combo |
| `An account with that email already exists` | Email already registered | Use different email or login instead |
| `Enable location sharing to keep live delivery tracking updated` | Location permission denied | Allow location access in browser |
| `Unable to detect location` | Geolocation not supported | Enter coordinates manually |
| `Permission denied in Firestore` | User doesn't have read/write access | Check Firestore security rules |
| `Failed to get document from cache` | Firestore offline | Check internet connection |
| `Network error` | Internet connection issue | Verify internet, retry |

---

## 📞 Debugging Workflow

```
ISSUE DETECTED
    ↓
1. Check DevTools Console (F12)
   └─→ Any red errors?
       ├─ YES: Note the error message
       └─ NO: Continue to step 2

2. Check localStorage
   └─→ Is session present?
       ├─ NO: User might not be logged in
       ├─ YES: Check role value
       └─→ Role correct?
           ├─ NO: Session corrupted
           └─ YES: Continue to step 3

3. Check Network Tab
   └─→ Any failed requests?
       ├─ YES: Firestore/API down?
       ├─ NO: Continue to step 4
       └─→ Status codes?
           ├─ 401: Auth token expired
           ├─ 403: Permission denied
           └─ 500: Server error

4. Check Firestore (Firebase Console)
   └─→ User document exists?
       ├─ NO: Signup failed
       ├─ YES: Check field values
       └─→ Role correct?
           ├─ NO: Role mapping broken
           └─ YES: Continue to step 5

5. Check Component Rendering
   └─→ React DevTools: Check session prop
       ├─ undefined: Session not passed
       ├─ empty: Session cleared
       └─ populated: Role-based logic error?

6. Clear & Retry
   └─→ localStorage.clear()
       ├─ Logout
       ├─ Refresh
       └─ Signup fresh

RESOLVED ✓
```

---

## 📖 Documentation Map

```
START HERE
    ↓
    ├─→ TESTING_SUMMARY_AND_QUICK_START.md
    │   (Overview & 5-min quick start)
    │
    ├─→ AUTHENTICATION_VALIDATION_CHECKLIST.md
    │   (Quick checkbox tests)
    │
    ├─→ AUTHENTICATION_TEST_PLAN.md
    │   (Detailed test cases with expected results)
    │
    ├─→ AUTHENTICATION_IMPLEMENTATION_ANALYSIS.md
    │   (Technical deep-dive & risks)
    │
    └─→ This File (VISUAL_GUIDE_AND_REFERENCE.md)
        (Diagrams, quick reference, debugging)
```

---

## ✅ Pre-Testing Checklist

- [ ] All 4 markdown files downloaded/reviewed
- [ ] npm dependencies installed (`npm install`)
- [ ] .env file configured with Firebase (if using Firebase)
- [ ] Development server runs (`npm run dev`)
- [ ] Browser DevTools available (F12)
- [ ] Can open Incognito windows (for multi-session testing)
- [ ] Firebase Console accessible (if testing Firestore)
- [ ] Approximately 2.5 hours allocated
- [ ] Pen & paper ready for notes

---

**Created:** May 2, 2026  
**Version:** 1.0  
**Ready to Test:** ✅ YES
