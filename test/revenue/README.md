Revenue is the existing non-cancelled booking total plus stored PS5 rental totals
for CONFIRMED, DELIVERED and RETURNED rentals. This includes online orders,
registered walk-ins and guests. Rental totals already include their discounts.
The full rental is counted once on its start date; unscheduled legacy rentals
contribute to all-time revenue only. No payment collection is implied.

Run against a fresh disposable SQLite database, never player data:

```powershell
$env:DATABASE_URL = 'file:./revenue-test.db'
$env:REVENUE_DB_TESTS = '1'
python -c "import sqlite3; sqlite3.connect('prisma/revenue-test.db').close()"
npx prisma db push --schema prisma/schema.prisma --skip-generate
npx tsx --test test/revenue/revenue.test.ts
```

The suite covers source/status eligibility, discounts, inclusive date ranges,
multi-day rentals, unscheduled history, edits/cancellation, empty totals,
read-only aggregation, IST boundaries and API authorization.
