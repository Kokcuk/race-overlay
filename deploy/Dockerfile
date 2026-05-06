# Multi-stage build: compile the Vite app, then serve with nginx.
FROM node:22-alpine AS build
WORKDIR /app
COPY raceoverlay/package.json raceoverlay/package-lock.json ./
RUN npm ci
COPY raceoverlay/ ./
RUN npm run build

FROM nginx:alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
