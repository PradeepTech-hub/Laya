# Authentication & RBAC Validation Suite

## Quick Reference Checklist

Use this checklist during active testing to track progress efficiently.

### PHASE 1: Authentication Flows (Estimated: 30 mins)

#### Signup Flows
- [ ] **Donor Signup** - Name, email, password, role → Dashboard
- [ ] **NGO Signup** - Same flow → NGO Dashboard  
- [ ] **Volunteer Signup** - Same flow → Volunteer Dashboard
- [ ] **Duplicate Email** - Error handling verified
- [ ] **Missing Fields** - Form validation working

#### Signin Flows
- [ ] **Donor Signin** - Correct credentials → Logged in
- [ ] **NGO Signin** - Correct credentials → Logged in
- [ ] **Volunteer Signin** - Correct credentials → Logged in
- [ ] **Wrong Email** - Error shown, not logged in
- [ ] **Wrong Password** - Error shown, not logged in
- [ ] **Wrong Role** - Error shown for role mismatch

#### Logout
- [ ] **Donor Logout** - Session cleared, redirected
- [ ] **NGO Logout** - Session cleared, redirected
- [ ] **Volunteer Logout** - Session cleared, redirected

#### Session Persistence
- [ ] **Donor Refresh** - Session persists after F5
- [ ] **NGO Refresh** - Session persists after F5
- [ ] **Volunteer Refresh** - Session persists after F5
- [ ] **Post-Logout Refresh** - No session restored

---

### PHASE 2: Role Assignment (Estimated: 15 mins)

#### Role Storage
- [ ] **Donor Role in localStorage** - `uiRole: "donor"`
- [ ] **NGO Role in localStorage** - `uiRole: "ngo"`
- [ ] **Volunteer Role in localStorage** - `uiRole: "volunteer"`
- [ ] **Firestore User Document** - Correct role stored

#### Dashboard Load by Role
- [ ] **Donor Dashboard** - Shows donor-specific nav & metrics
- [ ] **NGO Dashboard** - Shows NGO-specific nav & metrics
- [ ] **Volunteer Dashboard** - Shows volunteer-specific nav & metrics

---

### PHASE 3: Role-Based Access Control (Estimated: 20 mins)

#### Donor Restrictions
- [ ] **Cannot see "Intake" (NGO feature)** ✅
- [ ] **Cannot see "My Assignments" (Volunteer)** ✅
- [ ] **Cannot create needs** ✅
- [ ] **Cannot accept deliveries** ✅

#### NGO Restrictions
- [ ] **Cannot see "Food Donations"** ✅
- [ ] **Cannot see "Active Delivery"** ✅
- [ ] **Cannot accept assignments** ✅
- [ ] **Cannot create donations** ✅

#### Volunteer Restrictions
- [ ] **Cannot see "Food Donations"** ✅
- [ ] **Cannot see "Live Needs"** ✅
- [ ] **Cannot create donations** ✅
- [ ] **Cannot create needs** ✅

#### UI Rendering
- [ ] **Donor buttons render** - "+ Create Donation" visible
- [ ] **NGO buttons render** - "+ Create Need" visible
- [ ] **Volunteer buttons render** - "Accept Delivery" visible
- [ ] **Role labels display** - Correct in header/profile

---

### PHASE 4: Firestore Integration (Estimated: 10 mins)

- [ ] **User document created** - After signup
- [ ] **Role stored correctly** - In Firestore
- [ ] **Profile data retrieved** - On login
- [ ] **Data persists** - Across sessions

---

### PHASE 5: Error Handling (Estimated: 15 mins)

#### Credentials Errors
- [ ] **Invalid email error** - Clear message, app stable
- [ ] **Invalid password error** - Clear message, app stable
- [ ] **Missing field validation** - Browser/form validation works

#### Network/Firebase Errors
- [ ] **Firebase unavailable** - Error shown, fallback works
- [ ] **Offline mode** - App switches gracefully
- [ ] **No Firebase config** - Fallback to local auth works

---

### PHASE 6: Multi-Session Testing (Estimated: 20 mins)

#### 3-Window Test
- [ ] **Window 1 (Normal)** - Donor logged in
- [ ] **Window 2 (Incognito)** - NGO logged in
- [ ] **Window 3 (Incognito)** - Volunteer logged in
- [ ] **No conflicts** - All 3 sessions active
- [ ] **Real-time sync** - Donation → Need → Assignment visible in all

#### Session Stability
- [ ] **Donor creates donation** - All see it immediately
- [ ] **NGO creates need** - All see it immediately
- [ ] **Volunteer accepts assignment** - All see status updated

---

### PHASE 7: Security Checks (Estimated: 15 mins)

#### Access Control
- [ ] **Only NGO creates needs** - Donor/Volunteer blocked
- [ ] **Only Volunteer accepts delivery** - Donor/NGO blocked
- [ ] **Only Donor creates donations** - NGO/Volunteer blocked
- [ ] **Firestore rules enforced** - Unauthorized reads blocked
- [ ] **Cannot modify other users' data** - Access denied

#### Token & Session Security
- [ ] **Token validation** - Expired tokens rejected
- [ ] **localStorage manipulation** - Rejected by Firestore rules
- [ ] **Session ownership** - Cannot impersonate other roles

---

### PHASE 8: UI Validation (Estimated: 10 mins)

#### Login/Auth UI
- [ ] **Login page loads** - All fields visible
- [ ] **Role selector works** - Switching roles updates UI
- [ ] **Form validation** - Required fields enforced
- [ ] **Error messages clear** - User-friendly language

#### Redirects
- [ ] **Post-login redirect** - Correct dashboard loads
- [ ] **Post-logout redirect** - Returns to login/landing
- [ ] **Post-refresh** - No redirect if logged in

---

## Test Execution Timeline

| Phase | Task | Est. Time | Status | Notes |
|-------|------|-----------|--------|-------|
| 1 | Authentication Flows | 30m | [ ] | |
| 2 | Role Assignment | 15m | [ ] | |
| 3 | RBAC Verification | 20m | [ ] | |
| 4 | Firestore Integration | 10m | [ ] | |
| 5 | Error Handling | 15m | [ ] | |
| 6 | Multi-Session | 20m | [ ] | |
| 7 | Security | 15m | [ ] | |
| 8 | UI Validation | 10m | [ ] | |
| **TOTAL** | | **~135 mins** | | |

---

## Automated Validation Checklist

### Browser DevTools Validation

**Before Each Test:**
```
1. Open DevTools (F12)
2. Go to Application tab
3. Check localStorage for:
   - laya.session.v1 (session data)
   - laya.accounts.v1 (demo accounts)
   - laya.profile-cache.v1 (cached profiles)
4. Note current state before/after each action
```

**Session Check:**
```
After signup/signin:
localStorage['laya.session.v1'] = {
  "uid": "[user-email-or-id]",
  "name": "[full-name]",
  "email": "[email]",
  "role": "[customer|delivery-agent]",
  "uiRole": "[donor|ngo|volunteer]",
  "displayRoleLabel": "[display-name]"
}
```

**After Logout:**
```
localStorage.getItem('laya.session.v1') → null
```

---

### Console Validation

**Check for Errors:**
```javascript
// Open Console tab and verify NO errors for:
- Undefined role references
- Missing component rendering
- Firebase initialization warnings
- Session management errors

// Expected patterns:
✓ No red X errors
✓ Only info/debug messages
✓ No "Firebase not configured" warnings
```

**Verify Firebase Auth:**
```javascript
// In Console, run:
firebase.auth().currentUser
// Should return user object if logged in, null if logged out
```

---

### Firestore Validation (Firebase Console)

**Check User Collections:**
1. Go to Firebase Console → Firestore Database
2. Click `users` collection
3. For each signup:
   - Document ID = uid
   - Contains: `name`, `email`, `role`, `uiRole`, `displayRoleLabel`
   - `createdAt` timestamp present

**Check Security Rules:**
1. Go to Rules tab
2. Verify rules enforce:
   - Users can only read/write own documents
   - Role-based access in custom claims (if implemented)

---

## Key Test Credentials (Demo Accounts)

| Role | Email | Password | Status |
|------|-------|----------|--------|
| Donor | customer@laya.com | customer123 | ✅ Pre-created |
| Volunteer | agent@laya.com | agent123 | ✅ Pre-created |
| NGO | [create-new] | [create-new] | ⏳ To create |

---

## Expected Results Summary

### ✅ PASS Criteria

| Test Area | Expected Behavior |
|-----------|-------------------|
| **Auth** | Can signup, signin, logout without errors |
| **Roles** | Correct role assigned and persisted |
| **RBAC** | Each role sees only appropriate features |
| **Firebase** | User data stored and retrieved correctly |
| **Errors** | Graceful error handling, no crashes |
| **Sessions** | 3 roles can be logged in simultaneously |
| **Security** | Unauthorized access blocked |
| **UI** | Responsive, correct redirects, clear messaging |

### ❌ FAIL Criteria

| Scenario | Issue |
|----------|-------|
| Cannot login with correct credentials | Auth broken |
| Wrong role loads | Role assignment broken |
| See features from other roles | RBAC broken |
| Session not persists after refresh | Session management broken |
| Firestore data not saved | Backend integration broken |
| Multiple roles see each other's private data | Security issue |
| App crashes on errors | Error handling needed |

---

## Testing Instructions

### Quick Start (5-Minute Validation)

1. **Signup as Donor:**
   - Name: "Test Donor"
   - Email: "testdonor@example.com"
   - Password: "Test123!"
   - ✅ Should see donor dashboard

2. **Logout & Signin as Donor:**
   - Use same credentials
   - ✅ Should restore session

3. **Multi-Session Test:**
   - Open incognito window
   - Signup as NGO: "testingonow@example.com"
   - ✅ Should see NGO dashboard in new window
   - ✅ Original window still has donor logged in

4. **Verify RBAC:**
   - In donor window: Check "Food Donations" visible
   - In NGO window: Check "Food Donations" NOT visible
   - ✅ Confirm role-specific UI

5. **Check Storage:**
   - DevTools → Application → localStorage
   - Find `laya.session.v1` in both windows
   - ✅ Should have different uiRole values

---

## Common Issues & Solutions

### Issue: "Firebase not configured"
**Solution:**
- Check `.env` for Firebase variables
- If not present, app should use local storage fallback
- If error persists, check firebase.ts initialization

### Issue: Role not persisting after refresh
**Solution:**
- Check localStorage `laya.session.v1`
- Verify Firestore user document exists
- Check `onAuthStateChanged` listener in App.tsx

### Issue: Cannot access other role's features
**Solution:**
- This is CORRECT behavior (security feature)
- To test feature, login with that role
- Verify UI components use conditional rendering

### Issue: Multi-session conflicts
**Solution:**
- Clear localStorage in one window
- Use separate browser profiles or incognito
- Verify Firestore listeners are independent

### Issue: Firestore errors but localStorage works
**Solution:**
- App has fallback to local storage
- Check Firebase config and internet connection
- Review Firestore security rules

---

## Sign-Off Template

### Testing Completed: _______________

**Date:** ___________________  
**Tester:** __________________  
**Duration:** __________________

### Results Summary

**Total Tests:** ___ | **Passed:** ___ | **Failed:** ___ | **Skipped:** ___

### Critical Issues Found

- [ ] None
- [ ] [List if any]

### Status

- [ ] **APPROVED** - All critical tests passed, app ready
- [ ] **CONDITIONAL** - Minor issues found, ready with notes
- [ ] **REJECTED** - Critical issues, needs fixes

### Comments

_________________________________________________
_________________________________________________

**Signature:** ______________________________
