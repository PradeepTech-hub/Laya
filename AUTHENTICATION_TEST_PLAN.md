# Complete Authentication & Role-Based Access Control Test Plan

**Application:** Laya Food Donation Platform  
**Test Date:** May 2, 2026  
**Roles:** Donor, NGO, Volunteer  
**Environment:** Local Dev + Firebase (if configured)

---

## Test Summary

This document outlines comprehensive testing for:
- ✅ Authentication flows (signup, signin, logout)
- ✅ Role assignment and persistence
- ✅ Role-based access control (RBAC)
- ✅ Session management and page refresh
- ✅ Firestore integration
- ✅ Error handling
- ✅ Multi-session testing
- ✅ Security and data protection

---

## 1. AUTHENTICATION FLOW VALIDATION

### 1.1 User Signup (Email/Password)

**Test Case 1.1.1: Successful Donor Signup**
- [ ] Navigate to landing page
- [ ] Click "Join as Donor"
- [ ] Fill signup form:
  - Name: "Test Donor"
  - Email: "testdonor@example.com"
  - Password: "SecurePass123!"
  - Role: Donor
- [ ] Submit form
- [ ] ✅ Verify: Success message displayed
- [ ] ✅ Verify: Redirected to donor dashboard
- [ ] ✅ Verify: Session created in localStorage

**Test Case 1.1.2: Successful NGO Signup**
- [ ] Navigate to landing page
- [ ] Click "Join as NGO"
- [ ] Fill signup form:
  - Name: "Relief NGO"
  - Email: "ngo@example.com"
  - Password: "SecurePass123!"
  - Role: NGO
- [ ] Submit form
- [ ] ✅ Verify: Success message displayed
- [ ] ✅ Verify: Redirected to NGO dashboard
- [ ] ✅ Verify: Firestore user document created with role="ngo"

**Test Case 1.1.3: Successful Volunteer Signup**
- [ ] Navigate to landing page
- [ ] Click "Join as Volunteer"
- [ ] Fill signup form:
  - Name: "Delivery Agent"
  - Email: "volunteer@example.com"
  - Password: "SecurePass123!"
  - Role: Volunteer
- [ ] Submit form
- [ ] ✅ Verify: Success message displayed
- [ ] ✅ Verify: Redirected to volunteer dashboard
- [ ] ✅ Verify: Correct navigation items visible (assignments, tracking, history)

**Test Case 1.1.4: Duplicate Email Error**
- [ ] Sign up with "donor1@example.com"
- [ ] Logout
- [ ] Try signing up again with "donor1@example.com"
- [ ] ✅ Verify: Error message: "An account with that email already exists"
- [ ] ✅ Verify: Not redirected to dashboard

**Test Case 1.1.5: Missing Required Fields**
- [ ] Try to submit signup without email
- [ ] ✅ Verify: Form validation error displayed
- [ ] Try to submit signup without password
- [ ] ✅ Verify: Form validation error displayed
- [ ] Try to submit signup without name
- [ ] ✅ Verify: Form validation error displayed

---

### 1.2 User Signin (Email/Password)

**Test Case 1.2.1: Successful Donor Signin**
- [ ] Navigate to login page
- [ ] Select "Donor" role
- [ ] Enter email: "testdonor@example.com"
- [ ] Enter password: "SecurePass123!"
- [ ] Click signin
- [ ] ✅ Verify: Session created with correct role
- [ ] ✅ Verify: Redirected to donor dashboard
- [ ] ✅ Verify: User name displayed in dashboard header

**Test Case 1.2.2: Successful NGO Signin**
- [ ] Navigate to login page
- [ ] Select "NGO" role
- [ ] Enter email: "ngo@example.com"
- [ ] Enter password: "SecurePass123!"
- [ ] ✅ Verify: Redirected to NGO dashboard
- [ ] ✅ Verify: NGO-specific navigation items visible
- [ ] ✅ Verify: Role label shows "NGO"

**Test Case 1.2.3: Successful Volunteer Signin**
- [ ] Navigate to login page
- [ ] Select "Volunteer" role
- [ ] Enter email: "volunteer@example.com"
- [ ] Enter password: "SecurePass123!"
- [ ] ✅ Verify: Redirected to volunteer dashboard
- [ ] ✅ Verify: Shows "My Assignments" instead of "Food Donations"
- [ ] ✅ Verify: Delivery-specific tracking visible

**Test Case 1.2.4: Invalid Email**
- [ ] Enter email: "nonexistent@example.com"
- [ ] Enter password: "SecurePass123!"
- [ ] Click signin
- [ ] ✅ Verify: Error message displayed
- [ ] ✅ Verify: Remains on auth page (not redirected)

**Test Case 1.2.5: Invalid Password**
- [ ] Enter correct email: "testdonor@example.com"
- [ ] Enter wrong password: "WrongPassword123!"
- [ ] Click signin
- [ ] ✅ Verify: Error message displayed
- [ ] ✅ Verify: Not redirected to dashboard

**Test Case 1.2.6: Wrong Role Selection**
- [ ] Sign up as Donor
- [ ] Try to signin with same credentials but select "Volunteer" role
- [ ] ✅ Verify: Error "No matching account was found for that role"
- [ ] ✅ Verify: Not logged in

---

### 1.3 Logout

**Test Case 1.3.1: Donor Logout**
- [ ] Login as donor
- [ ] Navigate to Profile tab
- [ ] Click "Sign out" button
- [ ] ✅ Verify: Session cleared from localStorage
- [ ] ✅ Verify: Redirected to landing page
- [ ] ✅ Verify: Firebase auth cleared (if using Firebase)

**Test Case 1.3.2: NGO Logout**
- [ ] Login as NGO
- [ ] Click "Sign out" button
- [ ] ✅ Verify: Redirected to landing page
- [ ] ✅ Verify: Cannot access NGO dashboard without logging back in

**Test Case 1.3.3: Volunteer Logout**
- [ ] Login as Volunteer
- [ ] Click "Sign out" button
- [ ] ✅ Verify: Session ended
- [ ] ✅ Verify: Redirected to landing page

---

### 1.4 Session Persistence After Refresh

**Test Case 1.4.1: Donor Session Persists After Refresh**
- [ ] Login as donor
- [ ] Navigate to a specific dashboard view (e.g., "Live Needs")
- [ ] Press F5 or Cmd+R to refresh page
- [ ] ✅ Verify: Still logged in (session active)
- [ ] ✅ Verify: Session data restored from localStorage
- [ ] ✅ Verify: Dashboard still visible (not redirected to login)
- [ ] ✅ Verify: Name and email still displayed

**Test Case 1.4.2: NGO Session Persists After Refresh**
- [ ] Login as NGO
- [ ] Refresh page multiple times
- [ ] ✅ Verify: Still logged in after each refresh
- [ ] ✅ Verify: NGO dashboard loads correctly
- [ ] ✅ Verify: Role label still shows "NGO"

**Test Case 1.4.3: Volunteer Session Persists After Refresh**
- [ ] Login as Volunteer
- [ ] Refresh page
- [ ] ✅ Verify: Still logged in
- [ ] ✅ Verify: Volunteer dashboard accessible
- [ ] ✅ Verify: Assignments visible if any exist

**Test Case 1.4.4: Session Cleared After Logout**
- [ ] Login as donor
- [ ] Logout
- [ ] Check localStorage for SESSION_KEY
- [ ] ✅ Verify: SESSION_KEY not in localStorage
- [ ] ✅ Verify: Refresh page doesn't restore session

---

## 2. ROLE ASSIGNMENT VALIDATION

### 2.1 Role Storage

**Test Case 2.1.1: Donor Role Stored Correctly**
- [ ] Signup as donor
- [ ] Open browser DevTools → Application → localStorage
- [ ] ✅ Verify: `laya.session.v1` contains `"uiRole":"donor"`
- [ ] ✅ Verify: Firestore `users/{uid}` contains `role: "customer"` (backend role)
- [ ] ✅ Verify: `displayRoleLabel: "Donor"`

**Test Case 2.1.2: NGO Role Stored Correctly**
- [ ] Signup as NGO
- [ ] Check localStorage session
- [ ] ✅ Verify: `"uiRole":"ngo"` in session
- [ ] ✅ Verify: Firestore user document has correct role
- [ ] ✅ Verify: `displayRoleLabel: "NGO"`

**Test Case 2.1.3: Volunteer Role Stored Correctly**
- [ ] Signup as volunteer
- [ ] Check localStorage
- [ ] ✅ Verify: `"uiRole":"volunteer"` in session
- [ ] ✅ Verify: Backend role maps correctly
- [ ] ✅ Verify: `displayRoleLabel: "Volunteer"`

---

### 2.2 Role Persistence After Login and Refresh

**Test Case 2.2.1: Donor Role Persists**
- [ ] Login as donor
- [ ] Refresh page multiple times
- [ ] Check localStorage after each refresh
- [ ] ✅ Verify: Role remains "donor" throughout

**Test Case 2.2.2: NGO Role Persists**
- [ ] Login as NGO
- [ ] Navigate between different pages
- [ ] Refresh page
- [ ] ✅ Verify: Role still "ngo"
- [ ] ✅ Verify: NGO-specific features still visible

**Test Case 2.2.3: Volunteer Role Persists**
- [ ] Login as volunteer
- [ ] Refresh page
- [ ] ✅ Verify: Role remains "volunteer"
- [ ] ✅ Verify: Volunteer features accessible

---

### 2.3 Correct Dashboard Load by Role

**Test Case 2.3.1: Donor Dashboard**
- [ ] Login as donor
- [ ] ✅ Verify: Navigation shows:
  - Overview
  - Food Donations
  - Live Needs
  - Delivery Tracking
  - Profile
- [ ] ✅ Verify: Metrics show "Meals Donated", "Active Deliveries", "NGOs Supported"
- [ ] ✅ Verify: Can create food donations

**Test Case 2.3.2: NGO Dashboard**
- [ ] Login as NGO
- [ ] ✅ Verify: Navigation shows:
  - Overview
  - Intake (Requests)
  - Live Needs
  - Network (Tracking)
  - Profile
- [ ] ✅ Verify: Can create/post needs
- [ ] ✅ Verify: Metrics show "Partner groups", "Active intakes", "Matched donations"

**Test Case 2.3.3: Volunteer Dashboard**
- [ ] Login as volunteer
- [ ] ✅ Verify: Navigation shows:
  - Overview
  - My Assignments
  - Active Delivery
  - History
  - Profile
- [ ] ✅ Verify: Can accept delivery assignments
- [ ] ✅ Verify: Metrics show "Active Deliveries", "Completed Today", "Pending Pickups"

---

## 3. ROLE-BASED ACCESS CONTROL

### 3.1 Donor Cannot Access NGO or Volunteer Features

**Test Case 3.1.1: Donor Cannot See NGO "Intake" Button**
- [ ] Login as donor
- [ ] ✅ Verify: No "Intake" option in navigation
- [ ] ✅ Verify: No "Post Need" button visible
- [ ] ✅ Verify: Only donor-specific features available

**Test Case 3.1.2: Donor Cannot See Volunteer "My Assignments"**
- [ ] Login as donor
- [ ] ✅ Verify: "My Assignments" not in navigation
- [ ] ✅ Verify: Cannot accept delivery assignments
- [ ] ✅ Verify: Cannot access delivery agent interface

**Test Case 3.1.3: Donor Cannot Create Needs**
- [ ] Login as donor
- [ ] Try to navigate directly to URL with NGO features
- [ ] ✅ Verify: Feature not available or redirected
- [ ] ✅ Verify: Only can create donations, not needs

---

### 3.2 NGO Cannot Access Delivery Navigation Features

**Test Case 3.2.1: NGO Cannot See "Active Delivery" Tab**
- [ ] Login as NGO
- [ ] ✅ Verify: "Active Delivery" not in navigation
- [ ] ✅ Verify: No volunteer delivery interface visible

**Test Case 3.2.2: NGO Cannot Accept Deliveries**
- [ ] Login as NGO
- [ ] ✅ Verify: No "Accept Delivery" buttons visible
- [ ] ✅ Verify: No delivery assignment interface

**Test Case 3.2.3: NGO Cannot Mark Deliveries as In Transit**
- [ ] Login as NGO
- [ ] ✅ Verify: Delivery status buttons not available
- [ ] ✅ Verify: Cannot modify delivery status

---

### 3.3 Volunteer Only Sees Delivery-Related Actions

**Test Case 3.3.1: Volunteer Cannot Create Donations**
- [ ] Login as volunteer
- [ ] ✅ Verify: "Food Donations" tab not visible
- [ ] ✅ Verify: No donation creation interface

**Test Case 3.3.2: Volunteer Cannot Post Needs**
- [ ] Login as volunteer
- [ ] ✅ Verify: No "Post Need" option available
- [ ] ✅ Verify: Cannot access NGO need creation

**Test Case 3.3.3: Volunteer Only Sees Delivery Features**
- [ ] Login as volunteer
- [ ] ✅ Verify: "My Assignments" visible
- [ ] ✅ Verify: "Active Delivery" visible
- [ ] ✅ Verify: "History" visible
- [ ] ✅ Verify: Can accept and manage deliveries

---

### 3.4 UI Rendering Based on Role

**Test Case 3.4.1: Role-Specific Buttons Render Correctly**
- [ ] Login as donor
- [ ] ✅ Verify: "+ Create Donation" button visible
- [ ] Logout and login as NGO
- [ ] ✅ Verify: "+ Create Need" button visible instead
- [ ] Logout and login as volunteer
- [ ] ✅ Verify: "Accept Delivery" button visible (when assignments available)

**Test Case 3.4.2: Conditional Components Render**
- [ ] Login as donor
- [ ] ✅ Verify: "Food Donations" panel visible
- [ ] ✅ Verify: "Live Needs" panel accessible
- [ ] ✅ Verify: "Delivery Tracking" shows donor's donations
- [ ] Logout and login as volunteer
- [ ] ✅ Verify: "Delivery Tracking" shows volunteer's assignments
- [ ] ✅ Verify: Different panel content

**Test Case 3.4.3: Role Labels Display Correctly**
- [ ] Login as each role
- [ ] ✅ Verify: Dashboard header shows correct role label
- [ ] ✅ Verify: Profile section shows correct role
- [ ] ✅ Verify: Sparkles badge shows appropriate role name

---

## 4. FIRESTORE INTEGRATION

### 4.1 User Data Storage After Signup

**Test Case 4.1.1: User Document Created in Firestore**
- [ ] Signup as donor with email "firebasetest@example.com"
- [ ] Open Firebase Console → Firestore → `users` collection
- [ ] ✅ Verify: Document exists with uid as key
- [ ] ✅ Verify: Contains fields: `name`, `email`, `role`, `uiRole`, `displayRoleLabel`

**Test Case 4.1.2: Role Correctly Saved in Firestore**
- [ ] Signup as NGO
- [ ] Check Firestore user document
- [ ] ✅ Verify: `role: "delivery-agent"` or appropriate backend role
- [ ] ✅ Verify: `uiRole: "ngo"`
- [ ] ✅ Verify: `displayRoleLabel: "NGO"`

**Test Case 4.1.3: User Info Persists in Firestore**
- [ ] Signup with specific name and email
- [ ] Logout and login
- [ ] ✅ Verify: Name correctly retrieved from Firestore
- [ ] ✅ Verify: Email correctly retrieved
- [ ] ✅ Verify: Role correctly retrieved

---

### 4.2 Data Retrieval After Login

**Test Case 4.2.1: Profile Data Retrieved Correctly**
- [ ] Login as donor
- [ ] Check that session has correct user info
- [ ] ✅ Verify: Name matches signup name
- [ ] ✅ Verify: Email matches signup email
- [ ] ✅ Verify: Role retrieved from Firestore

**Test Case 4.2.2: Role-Specific Data Accessible**
- [ ] Login as NGO
- [ ] Check if needs collection can be queried
- [ ] ✅ Verify: Can retrieve NGO's created needs
- [ ] ✅ Verify: Firestore rules allow access to relevant data

---

## 5. ERROR HANDLING

### 5.1 Invalid Login Credentials

**Test Case 5.1.1: Wrong Email Error**
- [ ] Attempt signin with non-existent email
- [ ] ✅ Verify: Error message displayed: "No matching account was found"
- [ ] ✅ Verify: Clear, user-friendly message
- [ ] ✅ Verify: Application doesn't crash

**Test Case 5.1.2: Wrong Password Error**
- [ ] Attempt signin with correct email but wrong password
- [ ] ✅ Verify: Error message displayed
- [ ] ✅ Verify: User not logged in
- [ ] ✅ Verify: Application stable

**Test Case 5.1.3: Empty Email Field**
- [ ] Try to signin with empty email
- [ ] ✅ Verify: Browser validation prevents submission OR clear error
- [ ] ✅ Verify: Form doesn't submit

---

### 5.2 Network Failure Handling

**Test Case 5.2.1: Firebase Connection Failure**
- [ ] Disable internet connection
- [ ] Try to signup
- [ ] ✅ Verify: Error message displayed
- [ ] ✅ Verify: App doesn't hang or crash
- [ ] ✅ Verify: Falls back to local storage (if configured)

**Test Case 5.2.2: Firestore Unavailable**
- [ ] Disconnect from Firestore (simulate in DevTools)
- [ ] Try to create a donation
- [ ] ✅ Verify: Error message shown
- [ ] ✅ Verify: App switches to offline mode gracefully
- [ ] ✅ Verify: Shows offline indicator if implemented

**Test Case 5.2.3: Offline Mode Fallback**
- [ ] Enable offline mode indicator (if visible)
- [ ] ✅ Verify: App functions with local data
- [ ] ✅ Verify: Data syncs when connection restored
- [ ] ✅ Verify: No data loss

---

### 5.3 Missing Firebase Config

**Test Case 5.3.1: Firebase Not Configured**
- [ ] Remove Firebase environment variables
- [ ] Refresh app
- [ ] ✅ Verify: App still works with local auth
- [ ] ✅ Verify: No "Firebase not configured" errors
- [ ] ✅ Verify: Uses fallback authentication

**Test Case 5.3.2: Graceful Degradation**
- [ ] Verify app functions without Firebase
- [ ] ✅ Verify: Can signup and signin locally
- [ ] ✅ Verify: Data persists in localStorage
- [ ] ✅ Verify: No console errors

---

## 6. SESSION & STATE MANAGEMENT

### 6.1 onAuthStateChanged Implementation

**Test Case 6.1.1: Firebase Auth State Changes Detected**
- [ ] Open app with Firebase configured
- [ ] Login
- [ ] ✅ Verify: `onAuthStateChanged` listener triggered
- [ ] ✅ Verify: Session state updated
- [ ] ✅ Verify: User data retrieved from Firestore

**Test Case 6.1.2: Auth State Persists Across Navigation**
- [ ] Login as donor
- [ ] Navigate between different pages/tabs
- [ ] ✅ Verify: Auth state remains consistent
- [ ] ✅ Verify: User info not lost during navigation

---

### 6.2 User State Updates Correctly

**Test Case 6.2.1: State Updates on Signup**
- [ ] Complete signup flow
- [ ] ✅ Verify: Session state updated with new user info
- [ ] ✅ Verify: localStorage updated
- [ ] ✅ Verify: UI reflects new session state

**Test Case 6.2.2: State Updates on Signin**
- [ ] Complete signin flow
- [ ] ✅ Verify: Session state updated
- [ ] ✅ Verify: Role-specific UI rendered
- [ ] ✅ Verify: Dashboard loads correctly

**Test Case 6.2.3: State Clears on Logout**
- [ ] Logout
- [ ] ✅ Verify: Session state set to null
- [ ] ✅ Verify: localStorage cleared
- [ ] ✅ Verify: Redirected to landing page

---

### 6.3 App Initializes User Session on Load

**Test Case 6.3.1: Session Restored on App Load**
- [ ] Login as donor
- [ ] Close browser tab (or window)
- [ ] Reopen app (in same browser session if possible)
- [ ] ✅ Verify: User automatically logged in (if session persists)
- [ ] ✅ Verify: Dashboard loads without manual login

**Test Case 6.3.2: No Session on Fresh Load**
- [ ] Clear all localStorage data
- [ ] Refresh app
- [ ] ✅ Verify: Landing page displayed (not authenticated)
- [ ] ✅ Verify: Must login to access dashboard

---

## 7. MULTI-SESSION TESTING

### 7.1 Normal Browser (Donor)

**Test Case 7.1.1: Donor Login in Regular Browser**
- [ ] Open Chrome/Firefox normally
- [ ] Login as donor
- [ ] ✅ Verify: Session created
- [ ] ✅ Verify: Donor dashboard loaded
- [ ] ✅ Verify: Can perform donor actions

---

### 7.2 Incognito/Private Window (NGO)

**Test Case 7.2.1: NGO Login in Incognito**
- [ ] Open incognito/private window
- [ ] Login as NGO
- [ ] ✅ Verify: Separate session from normal window
- [ ] ✅ Verify: NGO dashboard loaded
- [ ] ✅ Verify: No data shared with normal window session

**Test Case 7.2.2: Data Isolation**
- [ ] In normal window: Create donation as donor
- [ ] In incognito window: Login as NGO
- [ ] ✅ Verify: Can see the donor's donation in live needs
- [ ] ✅ Verify: Each has separate session
- [ ] ✅ Verify: No session conflicts

---

### 7.3 Another Incognito/Private Window (Volunteer)

**Test Case 7.3.1: Volunteer Login in Another Incognito**
- [ ] Open second incognito window
- [ ] Login as volunteer
- [ ] ✅ Verify: Separate session
- [ ] ✅ Verify: Volunteer dashboard loaded

**Test Case 7.3.2: Multi-Session Sync**
- [ ] Normal window: Donor creates a donation
- [ ] Incognito 1: NGO creates a need
- [ ] Incognito 2: Volunteer accepts delivery assignment
- [ ] ✅ Verify: All sessions see real-time updates
- [ ] ✅ Verify: Data syncs across sessions (via Firestore)
- [ ] ✅ Verify: No conflicts or data corruption

---

### 7.4 Session Conflicts

**Test Case 7.4.1: Simultaneous Login Different Roles**
- [ ] Open 3 separate sessions
- [ ] Donor in window 1
- [ ] NGO in window 2
- [ ] Volunteer in window 3
- [ ] ✅ Verify: All logged in simultaneously
- [ ] ✅ Verify: No session interference
- [ ] ✅ Verify: Each sees correct role-specific UI

**Test Case 7.4.2: Same Role Different Sessions**
- [ ] Open 2 normal windows
- [ ] Login as same donor email in both
- [ ] ✅ Verify: Both sessions active (if allowed)
- [ ] ✅ Verify: No auth conflicts
- [ ] ✅ Verify: Both can perform actions (or blocked if design requires single session)

---

### 7.5 Real-Time Updates Across Sessions

**Test Case 7.5.1: Donation Creates Assignment Across Sessions**
- [ ] Donor (Window 1): Creates a food donation
- [ ] NGO (Window 2): Sees donation in live needs immediately
- [ ] Volunteer (Window 3): Sees delivery assignment immediately
- [ ] ✅ Verify: Real-time updates via Firestore listeners
- [ ] ✅ Verify: No delays in data propagation
- [ ] ✅ Verify: All sessions see consistent state

**Test Case 7.5.2: Delivery Status Updates in Real-Time**
- [ ] Volunteer: Accepts delivery assignment
- [ ] Donor: Sees "Assigned" status immediately
- [ ] NGO: Sees delivery matched to need immediately
- [ ] ✅ Verify: Status updates synced across sessions
- [ ] ✅ Verify: Consistent state in all windows

---

## 8. SECURITY CHECKS

### 8.1 Sensitive Actions Role-Protected

**Test Case 8.1.1: Only NGO Can Create Needs**
- [ ] Attempt to create need as donor
- [ ] ✅ Verify: Feature not available
- [ ] ✅ Verify: Cannot access need creation form
- [ ] Attempt as NGO
- [ ] ✅ Verify: Can create needs

**Test Case 8.1.2: Only Volunteer Can Accept Deliveries**
- [ ] Attempt to accept delivery as donor
- [ ] ✅ Verify: "Accept Delivery" button not visible
- [ ] ✅ Verify: Cannot accept assignments
- [ ] Attempt as volunteer
- [ ] ✅ Verify: Can accept deliveries

**Test Case 8.1.3: Only Donor Can Create Donations**
- [ ] Attempt to create donation as volunteer
- [ ] ✅ Verify: Feature not available
- [ ] ✅ Verify: Navigation doesn't show donation creation
- [ ] Attempt as donor
- [ ] ✅ Verify: Can create donations

---

### 8.2 Firestore Rules Prevent Unauthorized Access

**Test Case 8.2.1: Firestore Read Rules**
- [ ] Login as donor
- [ ] Try to read NGO-specific data directly (if possible)
- [ ] ✅ Verify: Firestore rules deny unauthorized reads
- [ ] ✅ Verify: Only appropriate data accessible

**Test Case 8.2.2: Firestore Write Rules**
- [ ] Login as volunteer
- [ ] Try to modify a need as NGO user (if possible)
- [ ] ✅ Verify: Firestore rules deny unauthorized writes
- [ ] ✅ Verify: Only owner can modify data

**Test Case 8.2.3: Collection-Level Access**
- [ ] Verify Firestore rules enforce collection access
- [ ] ✅ Verify: Users cannot access collections outside their role
- [ ] ✅ Verify: Admin-level data protected

---

### 8.3 No Direct Access to Restricted Data

**Test Case 8.3.1: Cannot Access Other User's Data**
- [ ] Login as donor
- [ ] Try to modify another donor's profile
- [ ] ✅ Verify: Cannot modify other users' data
- [ ] ✅ Verify: Firestore rules enforce ownership

**Test Case 8.3.2: Cannot Impersonate Other Roles**
- [ ] Manipulate localStorage to claim different role
- [ ] Refresh page
- [ ] ✅ Verify: Firestore rules re-validate role
- [ ] ✅ Verify: Cannot access restricted features
- [ ] ✅ Verify: Session rejected if manipulated

**Test Case 8.3.3: Token Expiry**
- [ ] Wait for Firebase auth token to expire (if testing long sessions)
- [ ] Try to perform action
- [ ] ✅ Verify: Re-authentication requested
- [ ] ✅ Verify: Session refreshed securely

---

## 9. UI VALIDATION

### 9.1 Login Screen Works Correctly

**Test Case 9.1.1: Login Page Loads**
- [ ] Logout
- [ ] ✅ Verify: Login/auth page displays
- [ ] ✅ Verify: Email field visible
- [ ] ✅ Verify: Password field visible
- [ ] ✅ Verify: Role selection visible
- [ ] ✅ Verify: Signin button visible

**Test Case 9.1.2: Role Selection Works**
- [ ] Click "Donor" role
- [ ] ✅ Verify: Role selector updates
- [ ] Click "NGO" role
- [ ] ✅ Verify: Role selector updates
- [ ] Click "Volunteer" role
- [ ] ✅ Verify: Role selector updates

**Test Case 9.1.3: Form Validation Works**
- [ ] Try to submit without email
- [ ] ✅ Verify: Browser validation or form error
- [ ] Try to submit without password
- [ ] ✅ Verify: Error message
- [ ] Fill all fields and submit
- [ ] ✅ Verify: Form submits

---

### 9.2 Role Selection Works During Signup

**Test Case 9.2.1: Role Selector in Signup**
- [ ] Click "Get Started" or "Join"
- [ ] Select each role option
- [ ] ✅ Verify: Role selection changes visual feedback
- [ ] ✅ Verify: Description updates for each role
- [ ] Select "Donor" and proceed
- [ ] ✅ Verify: Donor signup flow continues

**Test Case 9.2.2: Role Persists in Signup Form**
- [ ] Select "NGO" role
- [ ] Start filling form (name, email, password)
- [ ] ✅ Verify: Role selection remains NGO
- [ ] ✅ Verify: Changing to different role updates form context

---

### 9.3 Redirects After Login

**Test Case 9.3.1: Donor Redirects to Donor Dashboard**
- [ ] Login as donor
- [ ] ✅ Verify: Redirected to `/app` or equivalent
- [ ] ✅ Verify: Donor-specific components visible
- [ ] ✅ Verify: Dashboard loads with donor data

**Test Case 9.3.2: NGO Redirects to NGO Dashboard**
- [ ] Login as NGO
- [ ] ✅ Verify: Redirected to dashboard
- [ ] ✅ Verify: NGO interface loaded
- [ ] ✅ Verify: Correct navigation and metrics

**Test Case 9.3.3: Volunteer Redirects to Volunteer Dashboard**
- [ ] Login as volunteer
- [ ] ✅ Verify: Redirected correctly
- [ ] ✅ Verify: Volunteer interface loaded
- [ ] ✅ Verify: Assignments and delivery tracking visible

---

### 9.4 Logout Returns to Login Page

**Test Case 9.4.1: Donor Logout Redirect**
- [ ] Login as donor
- [ ] Click logout
- [ ] ✅ Verify: Redirected to login or landing page
- [ ] ✅ Verify: Cannot access dashboard without logging in again

**Test Case 9.4.2: NGO Logout Redirect**
- [ ] Login as NGO
- [ ] Logout
- [ ] ✅ Verify: Session ends
- [ ] ✅ Verify: Redirected to landing page
- [ ] ✅ Verify: NGO dashboard inaccessible

**Test Case 9.4.3: Volunteer Logout Redirect**
- [ ] Login as volunteer
- [ ] Logout
- [ ] ✅ Verify: Session cleared
- [ ] ✅ Verify: Redirected to landing page
- [ ] ✅ Verify: No access to volunteer features

---

## 10. CRITICAL FINDINGS & ISSUES LOG

### Issues Found

| # | Issue | Severity | Status | Notes |
|---|-------|----------|--------|-------|
| 1 | [Description] | [High/Medium/Low] | [ ] | [Details] |
| 2 | [Description] | [High/Medium/Low] | [ ] | [Details] |

### Fixes Applied

| # | Issue # | Fix | Verified |
|---|---------|-----|----------|
| 1 | [Issue #] | [Fix Description] | [ ] |

### Missing Validations

- [ ] Real-time sync validation
- [ ] Firestore rules documentation
- [ ] Offline mode handling
- [ ] Token refresh mechanism
- [ ] Multi-tab session synchronization

### Confirmation of Working Flows

- [ ] Donor: Signup → Login → Create Donation → Logout
- [ ] NGO: Signup → Login → Create Need → Track Donations → Logout
- [ ] Volunteer: Signup → Login → Accept Assignment → Track Delivery → Complete → Logout
- [ ] Multi-session: All roles simultaneously active without conflicts
- [ ] Session persistence: Logout/login restores correct session

---

## TESTING COMPLETED ✅

**Date Tested:** [Insert Date]  
**Tester Name:** [Insert Name]  
**Status:** [PASS / FAIL / NEEDS REVIEW]  
**Overall Coverage:** [%]

---

## Sign-Off

- [ ] All critical tests passed
- [ ] Role-based access verified
- [ ] Security measures validated
- [ ] Multi-session stability confirmed
- [ ] Ready for production / Needs fixes

**Signed:** ___________________ **Date:** ___________
