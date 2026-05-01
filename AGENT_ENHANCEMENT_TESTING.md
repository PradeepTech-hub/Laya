# 🧪 Delivery Agent Enhancement - Quick Testing Guide

**Last Updated:** May 2, 2026  
**Time to Complete:** 30-45 minutes

---

## 🚀 Quick Setup

```bash
# 1. Navigate to project
cd "c:\Users\Pradeep M\OneDrive\Desktop\laya\project"

# 2. Start dev server
npm run dev

# Opens at: http://localhost:5173
```

---

## ✅ Test Scenarios

### Test 1: Volunteer Signup with Profile (10 min)

**Goal:** Verify volunteer signup captures vehicle number and profile picture

**Steps:**

1. Open http://localhost:5173
2. Click "Start"
3. Select "Volunteer" role
4. Click "Sign Up"
5. **Fill Form:**
   - Email: `volunteer@test.com`
   - Password: `password123`
   - Full Name: `Ramesh Kumar`
   - Vehicle Number: `KA-05-AB-1234`
   - Profile Picture: Upload or skip
6. Click "Create Account"

**Expected Result:**
- ✅ Account created
- ✅ Redirected to app
- ✅ Can see volunteer dashboard

**Verify in Firestore:**
```
Collection: users
Document: [volunteer-uid]
Fields:
  - name: "Ramesh Kumar"
  - vehicleNumber: "KA-05-AB-1234"
  - profileImageUrl: "data:image/..." (if uploaded)
  - role: "delivery-agent"
  - uiRole: "volunteer"
```

---

### Test 2: Volunteer Signup with Profile Picture (5 min)

**Goal:** Test base64 image upload functionality

**Steps:**

1. Go to signup again with different email
2. Fill all fields
3. Click "Choose File" for profile picture
4. Select any image file from your computer
5. See image preview in the form
6. Submit signup

**Expected Result:**
- ✅ Image uploaded as base64
- ✅ Preview shows in form
- ✅ Image stored in Firestore
- ✅ File size < 100KB (typical for base64)

---

### Test 3: Donor Dashboard with Agent Info (10 min)

**Goal:** Verify agent info displays when assigned

**Steps:**

1. **Window 1 - Donor:**
   - Login as: `customer@laya.com` / `customer123`
   - Go to "Food Donations"
   - Create new donation
   - Fill details
   - Submit
   - Wait for donation to appear

2. **Window 2 - Volunteer:**
   - Open in new tab/browser
   - Login as: `volunteer@test.com` / `password123`
   - Go to "My Assignments"
   - Click "Accept" on the donation
   - Status changes to "Accepted"

3. **Window 1 - Back to Donor:**
   - Refresh "Food Donations"
   - Scroll to the donation
   - Look for **Agent Card**

**Expected Result:**
- ✅ Agent card appears
- ✅ Shows agent name
- ✅ Shows vehicle number: `KA-05-AB-1234`
- ✅ Shows profile picture (or default avatar)
- ✅ Shows status "Assigned"
- ✅ Shows verification badges

---

### Test 4: Real-Time Multi-Session Sync (8 min)

**Goal:** Verify agent info updates in real-time across multiple sessions

**Setup:**
- Window 1: Donor logged in
- Window 2: Volunteer logged in
- Both windows showing the same donation/delivery

**Steps:**

1. **Window 1 (Donor):** View donation (no agent yet)
2. **Window 2 (Volunteer):** Accept delivery
3. **Window 1 (Donor):** Check if agent card appears automatically
   - **DO NOT REFRESH** - should update in real-time
4. **Window 2 (Volunteer):** Change status to "Picked Up"
5. **Window 1 (Donor):** Verify status updates to "Picked"

**Expected Result:**
- ✅ Agent card appears without refresh
- ✅ Status badge updates automatically
- ✅ Updates happen within 1-2 seconds
- ✅ Both windows stay in sync

---

### Test 5: Agent Card with Profile Picture (3 min)

**Goal:** Verify agent card displays profile picture correctly

**Steps:**

1. Create donation as Donor
2. Accept as Volunteer (one with profile picture)
3. Look at Agent Card in Donor dashboard

**Expected Result:**
- ✅ Profile picture displays in circular avatar
- ✅ Image is 64x64px
- ✅ Image has border
- ✅ Falls back to default avatar if missing

---

### Test 6: Fallback Avatar Generation (2 min)

**Goal:** Verify default avatar generates when no image uploaded

**Steps:**

1. Signup as new volunteer without uploading picture
2. Accept a delivery
3. Look at Agent Card

**Expected Result:**
- ✅ Avatar generates based on name (using Dicebear API)
- ✅ Avatar is unique per volunteer
- ✅ No errors in console

---

### Test 7: Offline Mode (5 min)

**Goal:** Verify system works with localStorage fallback

**Steps:**

1. Open DevTools (F12)
2. Go to Network tab
3. Set to "Offline"
4. Try accepting delivery as volunteer
5. Switch to donor view
6. Check if agent info displays

**Expected Result:**
- ✅ Works in offline mode
- ✅ Uses localStorage
- ✅ No errors in console
- ✅ Data persists on page refresh

---

### Test 8: Status Indicator Colors (3 min)

**Goal:** Verify status badges show correct colors

**Steps:**

1. Create delivery
2. Accept as volunteer (status: "Assigned") → Blue badge
3. Update to "Picked Up" → Gray badge
4. Update to "In Transit" → Green badge
5. Update to "Delivered" → Green badge

**Expected Result:**
- ✅ "Assigned" → Blue: `bg-cyan-50 text-cyan-800`
- ✅ "Picked" → Gray: `bg-slate-50 text-slate-800`
- ✅ "In Transit" → Green: `bg-green-50 text-green-800`
- ✅ "Delivered" → Green: `bg-emerald-50 text-emerald-800`

---

### Test 9: Error Handling (3 min)

**Goal:** Verify graceful error handling

**Steps:**

1. Create donation
2. Manually delete agent from Firestore users collection
3. Accept delivery
4. Refresh donor view
5. Check if agent card displays fallback

**Expected Result:**
- ✅ No errors in console
- ✅ Shows "Agent not assigned yet" if data missing
- ✅ Graceful degradation
- ✅ App doesn't crash

---

### Test 10: Responsive Design (2 min)

**Goal:** Verify agent card works on mobile

**Steps:**

1. Open DevTools (F12)
2. Toggle Device Toolbar
3. Select "iPhone 12" or similar
4. View agent card
5. Verify layout adapts

**Expected Result:**
- ✅ Agent card fits on small screen
- ✅ Text is readable
- ✅ No horizontal scroll
- ✅ Image displays correctly

---

## 📊 Verification Checklist

### Volunteer Signup:
- [ ] Vehicle number field appears only for volunteers
- [ ] Profile picture upload works
- [ ] Image preview shows
- [ ] Data saved to Firestore
- [ ] Vehicle number visible in user profile

### Agent Card Display:
- [ ] Shows when status = "assigned"
- [ ] Shows agent name
- [ ] Shows vehicle number
- [ ] Shows profile picture (or default)
- [ ] Shows status badge

### Real-Time Sync:
- [ ] Agent info appears without page refresh
- [ ] Updates within 1-2 seconds
- [ ] Works across multiple browser windows
- [ ] Survives page refresh

### Error Handling:
- [ ] Missing agent data doesn't crash app
- [ ] Default avatar shows if image missing
- [ ] Works in offline mode
- [ ] No console errors

---

## 🐛 Debugging Tips

### Check Firestore Data:
```
Firebase Console → Firestore → Collections → users
Look for:
  - vehicleNumber field
  - profileImageUrl field
  - createdAt timestamp
```

### Check Console Errors:
```
F12 → Console tab
Look for:
  - Firebase errors
  - TypeError about agent data
  - Image loading errors
```

### Check Network:
```
F12 → Network tab
Look for:
  - Firestore calls
  - Real-time listener updates
  - Failed requests
```

### Check Real-Time Updates:
```
F12 → Network tab → Filter "deliveries"
Should see:
  - Updates when status changes
  - Agent data in payload
  - Real-time listener active
```

---

## 📱 Test Credentials

### Pre-created Accounts:

| Role | Email | Password | Vehicle |
|------|-------|----------|---------|
| Donor | customer@laya.com | customer123 | N/A |
| Volunteer | agent@laya.com | agent123 | Demo Vehicle |
| New Volunteer | [create new] | [create new] | [your choice] |

### Create Test Accounts:

1. **New Volunteer:**
   - Email: `volunteer1@test.com`
   - Password: `password123`
   - Name: `Priya Singh`
   - Vehicle: `KA-05-CD-5678`

2. **New Volunteer:**
   - Email: `volunteer2@test.com`
   - Password: `password123`
   - Name: `Arjun Patel`
   - Vehicle: `KA-05-EF-9012`

3. **New Donor:**
   - Email: `donor1@test.com`
   - Password: `password123`

---

## 🎯 Success Criteria

### All tests must pass:
- [ ] ✅ Volunteer signup captures vehicle number
- [ ] ✅ Profile picture uploads as base64
- [ ] ✅ Agent info displays on donor dashboard
- [ ] ✅ Real-time sync works across sessions
- [ ] ✅ Default avatar generates
- [ ] ✅ Offline mode works
- [ ] ✅ No console errors
- [ ] ✅ Responsive design works
- [ ] ✅ Error handling is graceful
- [ ] ✅ Status indicators show correct colors

---

## 📸 Expected UI States

### Volunteer Signup Form:
```
┌─────────────────────────────────┐
│ Sign Up                         │
├─────────────────────────────────┤
│ Full Name: [_________________]  │
│ Email: [____________________]   │
│ Password: [_________________]   │
│ Vehicle Number: [KA-05-AB-1234] │ ← NEW
│ Profile Picture: [Choose File]  │ ← NEW
│ [Image Preview]                 │ ← NEW
│                                 │
│ [Create Account]                │
└─────────────────────────────────┘
```

### Agent Card (in Donation):
```
┌──────────────────────────────────┐
│ 🚚 Delivery Agent      [Assigned]│
│ Real-time tracking enabled       │
├──────────────────────────────────┤
│ [👤]  Ramesh Kumar              │
│ 📍 KA-05-AB-1234                │
├──────────────────────────────────┤
│ ✓ Background verified  📍 GPS    │
└──────────────────────────────────┘
```

---

## 🔧 Common Test Issues

### Issue: Vehicle number not saving
**Solution:** Check that volunteer signup is being used, not donor signup

### Issue: Profile picture not showing
**Solution:** Check browser console for base64 encoding errors

### Issue: Real-time updates not working
**Solution:** Check Firestore listeners are active in Network tab

### Issue: Agent card not appearing
**Solution:** Verify delivery status is "assigned" or higher

### Issue: Default avatar not loading
**Solution:** Check Dicebear API is accessible (internet required)

---

## 📊 Performance Targets

| Metric | Target | How to Measure |
|--------|--------|---|
| Agent info appears | < 2 sec | Network tab latency |
| Image load time | < 1 sec | Network tab timing |
| Firestore update | < 1 sec | Real-time listener lag |
| Component render | < 100 ms | React DevTools |

---

## 🎓 Learning Outcomes

After completing these tests, you'll verify:

✅ Volunteer profile enhancement works  
✅ Real-time Firestore sync functions correctly  
✅ Multi-session data consistency maintained  
✅ Base64 image handling works properly  
✅ Fallback mechanisms are robust  
✅ Error handling is graceful  
✅ UI/UX is polished and responsive  

---

## 📝 Test Report Template

```
TEST DATE: _______________
TESTER: ___________________
ENVIRONMENT: ______________

Test 1 - Volunteer Signup: [ ] PASS [ ] FAIL
  Notes: _________________________________

Test 2 - Profile Picture: [ ] PASS [ ] FAIL
  Notes: _________________________________

Test 3 - Agent Info Display: [ ] PASS [ ] FAIL
  Notes: _________________________________

Test 4 - Real-Time Sync: [ ] PASS [ ] FAIL
  Notes: _________________________________

Test 5 - Default Avatar: [ ] PASS [ ] FAIL
  Notes: _________________________________

Test 6 - Offline Mode: [ ] PASS [ ] FAIL
  Notes: _________________________________

Test 7 - Error Handling: [ ] PASS [ ] FAIL
  Notes: _________________________________

Test 8 - Responsive Design: [ ] PASS [ ] FAIL
  Notes: _________________________________

Test 9 - Status Indicators: [ ] PASS [ ] FAIL
  Notes: _________________________________

Test 10 - Multi-Session: [ ] PASS [ ] FAIL
  Notes: _________________________________

OVERALL RESULT: [ ] PASS [ ] FAIL

Issues Found:
1. ___________________________
2. ___________________________
3. ___________________________

Recommendations:
1. ___________________________
2. ___________________________
```

---

## ✨ Next Steps After Testing

1. **All Tests Pass:**
   - [ ] Review code changes
   - [ ] Plan deployment
   - [ ] Prepare release notes

2. **Some Tests Fail:**
   - [ ] Document issues
   - [ ] Create bug fixes
   - [ ] Re-test fixes
   - [ ] Review with team

3. **Performance Issues:**
   - [ ] Optimize images
   - [ ] Review Firestore queries
   - [ ] Check listener efficiency
   - [ ] Profile with DevTools

---

**Happy Testing! 🚀**

Start with Test 1 and work through sequentially. Expected total time: 30-45 minutes.
