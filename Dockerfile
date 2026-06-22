FROM node:22-alpine AS dev

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json

RUN npm ci --workspace server

COPY server ./server

EXPOSE 3000

CMD ["npm", "run", "dev", "--workspace", "server"]

FROM dev AS build

RUN npm run build --workspace server
RUN npm prune --omit=dev --workspace server

FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/dist ./server/dist

EXPOSE 3000

CMD ["npm", "run", "start", "--workspace", "server"]
