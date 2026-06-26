
# build: compile the React/TS app into static files
FROM node:22-slim AS build
WORKDIR /app

# Copy only the manifests first so `npm ci` is cached independently
# of source changes — same layer-caching idea as the other two services.
COPY package.json package-lock.json ./
RUN npm ci

# `npm run build` = `tsc -b && vite build` → emits static assets to /app/dist.
COPY . .
RUN npm run build

# serve: nginx hosts the static files + proxies /api
FROM nginx:1.27-alpine AS runtime

COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Copy ONLY the built assets from the build stage
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80


HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --spider http://localhost:80/ || exit 1

# nginx must run in the foreground (daemon off) so it stays PID 1 in the container.
CMD ["nginx", "-g", "daemon off;"]