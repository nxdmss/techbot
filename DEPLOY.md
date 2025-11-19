# Инструкция по развертыванию на сервере

## Проблема с better-sqlite3

`better-sqlite3` - это нативный модуль Node.js, который требует компиляции под конкретную платформу. Если вы загрузили `node_modules` с локальной машины (macOS/Windows), они не будут работать на Linux сервере.

## Решение

### Вариант 1: Автоматическая пересборка (рекомендуется)

Скрипт `postinstall` автоматически пересоберет модуль после установки зависимостей:

```bash
npm install
```

### Вариант 2: Ручная пересборка

Если автоматическая пересборка не сработала:

```bash
# Удалите node_modules и package-lock.json
rm -rf node_modules package-lock.json

# Переустановите зависимости (они соберутся под вашу платформу)
npm install

# Или пересоберите только better-sqlite3
npm rebuild better-sqlite3
```

### Вариант 3: Использование Docker (если доступно)

Если вы используете Docker, убедитесь, что в Dockerfile есть:

```dockerfile
RUN npm install
RUN npm rebuild better-sqlite3
```

## Требования для компиляции

На сервере должны быть установлены инструменты для компиляции:

- **Ubuntu/Debian:**
  ```bash
  sudo apt-get update
  sudo apt-get install -y build-essential python3
  ```

- **Alpine Linux:**
  ```bash
  apk add --no-cache python3 make g++
  ```

## Проверка

После установки проверьте, что модуль работает:

```bash
node -e "require('better-sqlite3')"
```

Если ошибок нет - всё готово!

