FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_INFERENCE_URL=""
ENV NEXT_PUBLIC_INFERENCE_URL=$NEXT_PUBLIC_INFERENCE_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/out /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
