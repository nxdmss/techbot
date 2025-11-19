# Исправление ошибки better-sqlite3 на Railway

## Проблема
```
Error: /app/node_modules/better-sqlite3/build/Release/better_sqlite3.node: invalid ELF header
```

Это происходит потому, что `better-sqlite3` был скомпилирован для macOS, а Railway использует Linux.

## Решение для Railway

### Шаг 1: Убедитесь, что node_modules не в репозитории

Проверьте `.gitignore` - там должна быть строка:
```
node_modules/
```

**ВАЖНО:** `package-lock.json` НЕ должен быть в `.gitignore` - его нужно коммитить!

### Шаг 2: Настройка Railway

Railway автоматически выполняет `npm install` при деплое, но нужно убедиться, что модуль пересобирается:

**Вариант A: Через веб-интерфейс Railway:**

1. Откройте ваш проект на Railway
2. Перейдите в **Settings** → **Build & Deploy**
3. В разделе **Build Command** установите:
   ```bash
   npm install && npm rebuild better-sqlite3
   ```
4. В разделе **Start Command** оставьте:
   ```bash
   npm start
   ```

**Вариант B: Через Railway CLI (если используете):**

Railway автоматически выполнит `npm install`, и скрипт `postinstall` пересоберет модуль.

### Шаг 3: Убедитесь, что package.json правильный

В `package.json` должны быть скрипты:
```json
{
  "scripts": {
    "prestart": "npm rebuild better-sqlite3 || true",
    "start": "node bot.js",
    "postinstall": "npm rebuild better-sqlite3"
  }
}
```

### Шаг 4: Пересоберите проект

1. В Railway нажмите **Deploy** или **Redeploy**
2. Railway автоматически:
   - Удалит старые `node_modules`
   - Выполнит `npm install` (который запустит `postinstall`)
   - Пересоберет `better-sqlite3` для Linux
   - Запустит приложение

### Шаг 5: Проверка логов

После деплоя проверьте логи Railway. Вы должны увидеть:
```
> npm rebuild better-sqlite3
```

Если видите ошибки компиляции, возможно, нужно добавить переменные окружения.

## Если проблема сохраняется

### Проверка переменных окружения

В Railway добавьте переменную окружения (если нужно):
- `NODE_ENV=production`

### Альтернативное решение: Использовать Dockerfile

Если автоматическая пересборка не работает, создайте `Dockerfile`:

```dockerfile
FROM node:22-alpine

# Установка инструментов для компиляции
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Копирование package файлов
COPY package*.json ./

# Установка зависимостей
RUN npm ci && npm rebuild better-sqlite3

# Копирование остальных файлов
COPY . .

# Запуск приложения
CMD ["npm", "start"]
```

## Быстрое решение

1. **Удалите `node_modules` из репозитория** (если он там есть):
   ```bash
   git rm -r --cached node_modules
   git commit -m "Remove node_modules from repo"
   ```

2. **Закоммитьте изменения:**
   ```bash
   git add package.json .gitignore
   git commit -m "Fix better-sqlite3 for Railway"
   git push
   ```

3. **В Railway нажмите Redeploy**

Railway автоматически пересоберет всё для Linux!

