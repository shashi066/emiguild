# 🎮 GameZone Cafe — Slot Booking App

A full-stack gaming cafe slot booking application built with **Next.js 15**, **Prisma ORM**, **NextAuth.js**, and **SQLite**.

---

## 🚀 Quick Start

### 1. Set the project as your active workspace in Antigravity

### 2. Install dependencies
```bash
npm install
```

### 3. Generate Prisma client
```bash
npx prisma generate
```

### 4. Create the SQLite database and run migrations
```bash
npx prisma db push
```

### 5. Seed the database with sample data
```bash
npm run db:seed
```

### 6. Start the dev server
```bash
npm run dev
```

### 7. Open in browser
```
http://localhost:3000
```

---

## 📁 Project Structure

```
gaming-cafe-booking/
├── app/
│   ├── page.tsx              ← Landing page
│   ├── login/page.tsx        ← Login
│   ├── register/page.tsx     ← Registration
│   ├── book/page.tsx         ← Multi-step booking flow
│   ├── book/confirm/         ← Booking confirmation
│   ├── my-bookings/page.tsx  ← User bookings list
│   ├── profile/page.tsx      ← User profile
│   ├── admin/
│   │   ├── page.tsx          ← Admin dashboard
│   │   ├── bookings/         ← All bookings table
│   │   ├── stations/         ← Station management
│   │   └── users/            ← User management
│   └── api/
│       ├── auth/             ← NextAuth handler
│       ├── register/         ← User registration
│       ├── bookings/         ← CRUD bookings
│       ├── stations/         ← CRUD stations
│       └── slots/            ← Availability check
├── components/
│   ├── layout/Navbar.tsx
│   ├── admin/AdminSidebar.tsx
│   └── providers/SessionProvider.tsx
├── lib/
│   ├── prisma.ts             ← Prisma singleton
│   ├── utils.ts              ← Helpers
│   └── validations.ts        ← Zod schemas
├── prisma/
│   ├── schema.prisma         ← DB schema
│   └── seed.ts               ← Seed data
├── auth.ts                   ← NextAuth config
└── middleware.ts             ← Route protection
```

---

## ✨ Features

### 👤 User Features
- Register & login with secure password hashing
- Multi-step booking flow (Date → Station → Time → Confirm)
- Real-time slot availability checking (no double-booking)
- View & cancel upcoming bookings
- User profile with gaming stats
- **Daily Loot Spin**: Spin once a day for a chance to win exclusive rewards and discounts!

### 🔐 Admin Features
- Stats dashboard (bookings, revenue, users, stations)
- All bookings table with search, date & status filters
- Inline booking status management (Confirm / Complete / Cancel)
- Station CRUD with enable/disable toggle
- User management with booking counts
- **Daily Spin Management**: Control spin settings, timezone-aware reset hours, retries, and CRUD loot items with custom drop weights.

---

## 🗃 Database Commands

```bash
npm run db:studio      # Open Prisma Studio (visual DB editor)
npm run db:seed        # Re-seed the database
npx prisma db push     # Apply schema changes
```

---

