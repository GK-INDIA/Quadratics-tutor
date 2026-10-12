# One image: the API serves the built web app.
FROM node:22-slim
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
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

# The SQLite file lives on a mounted volume so it survives deploys.
ENV NODE_ENV=production PORT=8080 DB_PATH=/data/tutor.db
EXPOSE 8080
CMD ["pnpm", "start"]
