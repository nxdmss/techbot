FROM node:22-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci && npm rebuild better-sqlite3

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
