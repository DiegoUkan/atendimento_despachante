# Notas para quem desenvolve aqui

- Monorepo npm workspaces: `apps/web` (Next.js 16, Turbopack, `cacheComponents` ligado), `apps/worker` (Node + tsx/tsup), `packages/shared` (TS puro, transpilado pelo Next e embutido pelo tsup).
- **Next 16 é diferente do que você conhece**: leia `apps/web/AGENTS.md` e os guias em `node_modules/next/dist/docs/` antes de mexer em roteamento/cache. `middleware` virou `proxy` (`apps/web/src/proxy.ts`).
- Páginas do painel são componentes cliente que leem o Supabase com a sessão do usuário (RLS) e escutam Realtime. Evite `useSearchParams` (exige Suspense): use `useUrlParam` de `src/lib/hooks.ts`. Não exporte nada além do componente default em `page.tsx`.
- Banco: toda mudança vira um arquivo novo em `supabase/migrations/` **e** é aplicada no projeto (ref `izlctgakeabmrlkfoenm`). Depois regenere `packages/shared/src/database.types.ts`.
- Funções chamadas por gatilhos usam `enqueue_job_internal` (não exposta). A RPC `enqueue_job` só aceita tipos da lista permitida.
- A IA nunca escreve direto no banco: toda ação passa por `apps/worker/src/ai/tools.ts`, onde ficam as regras de negócio.
- Checagens: `npm run typecheck`; `npx next build` em `apps/web`; `npx tsup` em `apps/worker`.
