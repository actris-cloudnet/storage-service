FROM node:18 AS dev
WORKDIR /app

FROM node:18 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . ./
RUN npm run build

FROM node:18 AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package*.json ./
RUN npm ci
COPY --from=builder /app/build ./build
EXPOSE 5900/tcp
CMD ["node", "build/server.js"]
