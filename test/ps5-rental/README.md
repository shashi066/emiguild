Run these API tests against the dedicated disposable SQLite database only:

```powershell
$env:DATABASE_URL = 'file:./rental-admin-test.db'
python -c "import sqlite3; sqlite3.connect('prisma/rental-admin-test.db').close()"
npx prisma db push --skip-generate
npx tsx --test test/ps5-rental/admin.test.ts
```

The suite checks admin access, guest/registered rentals, price/discount validation, stale writes, status transitions, and active-rental uniqueness. It deletes rental, game, and user fixtures from this dedicated database after running.

Production deployment applies the PostgreSQL migration through the existing build script. It adds guest support/source/discount defaults and pauses Guess 36. For local SQLite development, back up the database before `prisma db push`, and set `guess_36_enabled` to `false` through admin settings. Public creation remains registered-user-only.
