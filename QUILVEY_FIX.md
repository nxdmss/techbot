# Исправление ошибки better-sqlite3 на Quilvey

## Проблема
```
Error: /app/node_modules/better-sqlite3/build/Release/better_sqlite3.node: invalid ELF header
```

Это происходит потому, что `better-sqlite3` был скомпилирован для другой платформы (macOS/Windows), а не для Linux.

## Решение

### Шаг 1: Убедитесь, что node_modules не в репозитории

Проверьте `.gitignore` - там должна быть строка:
```
node_modules/
```

**ВАЖНО:** `package-lock.json` НЕ должен быть в `.gitignore` - его нужно коммитить!

### Шаг 2: На сервере Quilvey выполните:

**Вариант A: Через SSH/консоль сервера (если доступна):**

```bash
# Удалите старые node_modules
rm -rf node_modules

# Переустановите зависимости (они соберутся под Linux)
npm install

# Или принудительно пересоберите
npm rebuild better-sqlite3
```

**Вариант B: Через настройки Quilvey:**

1. В настройках проекта найдите раздел "Build Command" или "Install Command"
2. Установите команду установки:
   ```bash
   npm install && npm rebuild better-sqlite3
   ```
3. Или в "Start Command" используйте:
   ```bash
   npm run rebuild && npm start
   ```

### Шаг 3: Убедитесь, что на сервере есть инструменты компиляции

Если пересборка не работает, возможно, на сервере нет необходимых инструментов. 

**Для Ubuntu/Debian:**
```bash
apt-get update
apt-get install -y build-essential python3
```

**Для Alpine Linux:**
```bash
apk add --no-cache python3 make g++
```

### Шаг 4: Проверка

После пересборки проверьте:
```bash
node -e "require('better-sqlite3')"
```

Если ошибок нет - всё готово!

## Автоматическое решение

Я добавил скрипт `prestart` в `package.json`, который автоматически пересобирает модуль перед каждым запуском. Но это работает только если:
1. `node_modules` установлены на сервере (не загружены с локальной машины)
2. На сервере есть инструменты для компиляции

## Если ничего не помогает

Альтернативное решение - использовать другую базу данных (например, PostgreSQL через `pg`), но это потребует изменения кода.

