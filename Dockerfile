FROM node:22-alpine

# Установка инструментов для компиляции нативных модулей
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Копирование package файлов
COPY package*.json ./

# Установка зависимостей и пересборка better-sqlite3
RUN npm ci && npm rebuild better-sqlite3

# Копирование остальных файлов
COPY . .

# Открываем порт (Railway автоматически определит порт из переменной PORT)
EXPOSE 3000

# Запуск приложения
CMD ["npm", "start"]

