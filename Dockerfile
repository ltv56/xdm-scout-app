FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY apps apps
RUN npm run build

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace apps/api --include-workspace-root

FROM node:22-bookworm-slim
WORKDIR /app/apps/api
ENV NODE_ENV=production
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/package.json ./package.json
COPY --from=build /app/apps/web/dist /app/apps/web/dist
COPY fixtures /app/fixtures
ENV WEB_DIST=/app/apps/web/dist
USER node
EXPOSE 3001
CMD ["sh", "-c", "node /app/node_modules/typeorm/cli.js -d dist/data-source.js migration:run && exec node dist/main.js"]
