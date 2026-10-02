FROM node:22-slim AS base
WORKDIR /code
ENV NODE_ENV=production

# 1) Dependencies only. This layer is cached until package.json or package-lock.json change,
#    so editing code doesn't reinstall packages.
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# Local development (docker-compose.yml): all dependencies, source bind-mounted, tsx watches it.
FROM deps AS dev
ENV NODE_ENV=development
COPY . .

# 2) Compile TypeScript to dist/.
FROM deps AS build
COPY tsconfig.json drizzle.config.ts ./
COPY src ./src
RUN npm run build

# Production image: production dependencies + compiled code only. Last stage = default target.
FROM base AS runtime
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /code/dist ./dist
COPY drizzle ./drizzle
USER node
CMD ["node", "dist/api/server.js"]
