FROM node:18-alpine

# Установка зависимостей для сборки нативных модулей (python3, make, g++)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Копируем только файлы зависимостей
COPY package*.json ./

# Устанавливаем зависимости (включая пересборку better-sqlite3)
RUN npm ci

# Копируем остальные файлы приложения
COPY . .

# Порт (Railway подставит свой, но это хорошая практика)
EXPOSE 3000

CMD ["npm", "start"]
