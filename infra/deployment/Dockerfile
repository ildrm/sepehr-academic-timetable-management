FROM node:24-trixie-slim AS compile
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package*.json ./
COPY apps/web/package.json apps/web/
RUN npm ci
COPY prisma ./prisma
COPY prisma.config.ts tsconfig*.json ./
COPY packages ./packages
COPY apps ./apps
RUN npm run db:generate && NODE_OPTIONS=--max-old-space-size=1024 npm run build && rm -rf apps/web/.next/cache

FROM node:24-trixie-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=compile --chown=node:node /app/node_modules ./node_modules
COPY --from=compile --chown=node:node /app/dist ./dist
COPY --from=compile --chown=node:node /app/apps/web/.next ./apps/web/.next
COPY package.json prisma.config.ts ./
COPY prisma ./prisma
COPY apps/web/package.json apps/web/next.config.ts ./apps/web/
COPY services/solver ./services/solver
COPY docx/artifacts ./docx/artifacts
RUN python3 -m venv /app/solver-env && /app/solver-env/bin/pip install --no-cache-dir -r services/solver/requirements.txt
USER node
ENV NODE_ENV=production APP_ENV=production SOLVER_PYTHON=/app/solver-env/bin/python NEXT_TELEMETRY_DISABLED=1
CMD ["node", "dist/apps/api/src/main.js"]
