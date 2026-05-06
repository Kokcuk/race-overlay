# Backend: Node + ffmpeg + native deps for node-canvas.
# Two-stage to avoid shipping the toolchain in the runtime image.

FROM node:22-bookworm-slim AS build
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential pkg-config python3 \
      libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev libpixman-1-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./
RUN npm install --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 libpixman-1-0 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY backend/src ./src
COPY backend/package.json ./package.json
EXPOSE 3000
CMD ["node", "src/index.js"]
