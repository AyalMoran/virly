FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json

RUN npm ci --workspace client

COPY client ./client

EXPOSE 5173

CMD ["npm", "run", "dev", "--workspace", "client"]
