# One image: the API serves the built web app.
FROM node:22-slim
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
# Build tools are only needed if better-sqlite3 has no prebuilt binary for this platform.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY curriculum/package.json curriculum/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Mount a volume at /data to keep the SQLite file across deploys (Render's free plan has none).
ENV NODE_ENV=production PORT=8080 DB_PATH=/data/tutor.db
EXPOSE 8080
CMD ["pnpm", "start"]
