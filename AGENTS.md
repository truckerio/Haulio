Project: Haulio / demo-truckerio1

Monorepo (pnpm workspace)

Apps:
- apps/web → Next.js 14 (App Router)
- apps/api → Node + Express + Prisma
- apps/worker → background jobs
- packages/db → Prisma schema

Commands:
- Install: pnpm install
- API dev: pnpm --filter @truckerio/api dev
- Web dev: pnpm --filter @truckerio/web dev
- Build: pnpm build

Infra:
- Web → Vercel
- API + Worker + Postgres → Railway
