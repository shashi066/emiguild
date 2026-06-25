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

## 🎁 Daily Loot Spin Feature

The Daily Loot Spin allows authenticated users to win daily rewards.

### Seeded Rewards (Default Drop Table)
The database seed scripts inserts the following default items and weights:
- **5% Discount** (Weight: 40) - 40% Drop Rate
- **10% Discount** (Weight: 20) - 20% Drop Rate
- **Extra XP** (Weight: 15) - 15% Drop Rate
- **Free Drink** (Weight: 10) - 10% Drop Rate
- **Bronze Pass** (Weight: 5) - 5% Drop Rate
- **Gold Pass** (Weight: 1) - ~1% Drop Rate

### How to Test Locally
1. Sync schema: `npx prisma db push`
2. Seed rewards: `npm run db:seed`
3. Start the app: `npx next dev --webpack`
4. Visit `/admin/daily-spin` (as admin) to manage rewards and settings (e.g. reset hour, allow retries).
5. Visit `/daily-spin` as a user to test the spin.

### Running Tests
To run the unit and API behavior tests for the daily spin feature:
```bash
node --test test/daily-spin/*.js
```
