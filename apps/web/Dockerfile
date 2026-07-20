FROM node:22-alpine AS build

WORKDIR /workspace

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/chart-schema/package.json packages/chart-schema/package.json
RUN npm ci

COPY apps/web apps/web
COPY packages/chart-schema packages/chart-schema

ARG VITE_API_BASE_URL=/api
ARG VITE_BUILD_ID=container
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_BUILD_ID=$VITE_BUILD_ID

RUN npm run build --workspace @rhythm-game/chart-schema \
    && npm run build --workspace @rhythm-game/web

FROM nginxinc/nginx-unprivileged:1.29-alpine AS runtime

ARG NGINX_CONFIG=apps/web/nginx.conf
COPY ${NGINX_CONFIG} /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html

EXPOSE 8080
