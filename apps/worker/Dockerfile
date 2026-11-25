# Worker do atendimento — build a partir da RAIZ do monorepo:
#   docker build -f apps/worker/Dockerfile -t atendimento-worker .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
RUN npm ci -w worker -w @despachante/shared
COPY packages/shared packages/shared
COPY apps/worker apps/worker
RUN npm run build -w worker

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# ffmpeg: converte áudios do WhatsApp (ogg/opus) para transcrição
RUN apk add --no-cache ffmpeg
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
RUN npm ci -w worker --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/apps/worker/dist apps/worker/dist
WORKDIR /app/apps/worker
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8787/health || exit 1
CMD ["node", "dist/index.js"]
