# Gate 0 Baseline Migration

This is the **baseline migration** for PesanPro Gate 0. It creates the full schema from an empty database.

## Fresh install

```bash
npx prisma migrate deploy
npx prisma generate
```

## Existing upstream baseline database (created via `prisma db push`)

Your database already has tables. Mark this baseline as applied without re-running:

```bash
npx prisma migrate resolve --applied 20250825000000_gate0_init
npx prisma generate
```

After that, future migrations (`migrate deploy`) will apply incrementally.

## What changed in Gate 0 vs upstream baseline original

- `AuthState`: `value` made nullable, added `encValue` (TEXT), `iv`, `authTag` (AES-256-GCM)
- New table `AuditLog` for security audit trail
- `SystemConfig.appName` default changed to `PesanPro`
- `BotConfig.botName` default changed to `PesanPro Bot`
- `User` now has relation to `AuditLog`
