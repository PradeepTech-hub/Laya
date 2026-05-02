# 🍱 Laya – AI-Powered Food Donation & Delivery Platform

🔗 Repository: https://github.com/PradeepTech-hub/Laya.git

Laya is an intelligent web platform designed to bridge the gap between food donors, NGOs, and delivery volunteers. It leverages AI, real-time tracking, and smart routing to reduce food waste and ensure timely distribution to those in need.

---

## 🚀 Problem Statement

Every day, a significant amount of food is wasted while many people go hungry. The lack of coordination between donors, NGOs, and logistics leads to inefficiencies.

**Laya solves this by providing:**

* Smart matching between donors and receivers
* Real-time delivery coordination
* AI-assisted data input
* Optimized logistics for faster distribution

---

## 🎯 Solution Overview

Laya creates a seamless ecosystem where:

* 🧑‍🍳 Donors list surplus food
* 🏢 NGOs receive and manage requests
* 🚴 Volunteers handle delivery
* 🤖 AI assists in decision-making and automation

---

## ✨ Key Features

### 🔐 Multi-Role Authentication

* Secure login using Email & Google
* Role-based access:

  * Donor
  * NGO
  * Volunteer

---

### 🍲 Smart Donation Management

* Add food details:

  * Type (Veg / Non-Veg / Raw / Packed)
  * Quantity
  * Expiry time
* AI-assisted form filling
* Real-time donation tracking
* Priority-based matching system

---

### 🤖 AI Assistant

* Accepts natural language input
* Extracts:

  * Food type
  * Quantity
  * Location
  * Urgency
* Improves user experience with conversational UI

---

### 🚚 Delivery & Tracking

* Live delivery updates
* ETA calculation
* Delivery agent assignment
* Status tracking (Pending → In Transit → Delivered)

---

### 🗺️ Route Optimization

* Smart route calculation
* Distance & time estimation
* Efficient delivery planning
* Dynamic updates for traffic & urgency

---

## 🛠️ Tech Stack

### Frontend

* React (Vite)
* TypeScript
* Tailwind CSS
* Framer Motion

### Backend & Services

* Firebase (Authentication + Firestore)
* Supabase

### Libraries

* React Leaflet
* Leaflet (Maps)
* Lucide Icons
* ESLint & PostCSS

---

## 📁 Project Structure

src/
├── components/
│   ├── AIAssist.tsx
│   ├── DonorDashboard.tsx
│   ├── DonationCard.tsx
│   ├── AgentCard.tsx
│   └── DynamicOptimizationMap.tsx
├── lib/
│   ├── firebase.ts
│   └── routing.ts
├── App.tsx
├── main.tsx
└── index.css

---

## ⚙️ Installation & Setup

### 📌 Prerequisites

* Node.js (v16+)
* npm / yarn
* Firebase project

---

### 📥 Clone Repository

git clone https://github.com/PradeepTech-hub/Laya.git
cd Laya
npm install

---

### 🔑 Environment Variables

Create a `.env` file:

VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_key

---

### ▶️ Run the App

npm run dev

App runs at:
http://localhost:5173

---

### 📦 Build

npm run build
npm run preview

---

## 📊 Data Models

### 🍱 Donation

* Food details
* Quantity & category
* Expiry time
* Pickup location
* Assigned delivery agent

---

### 🚚 Delivery

* Status tracking
* Route details
* ETA
* Assigned volunteer

---

### 👤 User

* Role (Donor / NGO / Volunteer)
* Authentication data
* Location preferences
* Vehicle info (for delivery agents)

---

## 🔐 Security

* Firebase Authentication
* Role-based authorization
* Protected environment variables
* Firestore security rules

---

## 🌐 Browser Support

* Chrome
* Firefox
* Edge
* Safari

---

## 📱 Responsive Design

Fully optimized for:

* Desktop
* Tablet
* Mobile

---

## 🤝 Contributing

1. Fork the repository
2. Create your branch
   git checkout -b feature/your-feature
3. Commit changes
   git commit -m "Added feature"
4. Push
   git push origin feature/your-feature
5. Open Pull Request

---

## 📈 Future Enhancements

* Machine Learning-based demand prediction
* Mobile app (React Native)
* Notification system
* Advanced analytics dashboard
* Payment integration
* Impact tracking (CO₂ & food saved)

---

## 🎓 Learning Outcomes

This project demonstrates:

* Full-stack development
* Real-time applications
* AI integration in UX
* Map-based systems
* Scalable architecture design

---

## ❤️ Acknowledgment

Developed as part of a mission to reduce food waste and support communities.

> “Smart Technology for Zero Hunger.”

---
