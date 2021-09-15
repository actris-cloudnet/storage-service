FROM node:14 AS dev

WORKDIR /app

COPY . /app

RUN npm ci
RUN npm run build

FROM node:14 AS prod

WORKDIR /app

COPY --from=dev /app/package* /app/
RUN npm ci --only=prod
COPY --from=dev /app/build /app/build

EXPOSE 5900/tcp

CMD ["node", "build/server.js"]
