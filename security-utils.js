/**
 * Security Utilities
 * Утилиты для безопасности: валидация, хеширование, обнаружение аномалий
 */

/**
 * Валидация Telegram User ID
 * @param {number} id - Telegram ID
 * @returns {boolean} true если ID валиден
 */
function isValidTelegramId(id) {
    return typeof id === 'number' && id > 0 && id < 10000000000;
}

/**
 * Валидация Email
 * @param {string} email - Email адрес
 * @returns {boolean} true если email валиден
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
}

/**
 * Валидация номера телефона (E.164 формат)
 * @param {string} phone - Номер телефона
 * @returns {boolean} true если номер валиден
 */
function isValidPhone(phone) {
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    return phoneRegex.test(phone);
}

/**
 * Генерация безопасного случайного токена
 * Использует crypto.randomBytes для криптографически стойкой генерации
 * @param {number} length - Длина токена в байтах (по умолчанию 32)
 * @returns {string} Hex-строка токена
 */
function generateSecureToken(length = 32) {
    const crypto = require('crypto');
    return crypto.randomBytes(length).toString('hex');
}

/**
 * Хеширование пароля (PBKDF2)
 * Использует соль для защиты от rainbow table атак
 * @param {string} password - Пароль
 * @returns {Promise<string>} Хеш в формате "salt:hash"
 */
async function hashPassword(password) {
    const crypto = require('crypto');
    const salt = crypto.randomBytes(16).toString('hex');
    
    return new Promise((resolve, reject) => {
        crypto.pbkdf2(password, salt, 10000, 64, 'sha512', (err, derivedKey) => {
            if (err) reject(err);
            resolve(salt + ':' + derivedKey.toString('hex'));
        });
    });
}

/**
 * Проверка хеша пароля
 * @param {string} password - Пароль для проверки
 * @param {string} hash - Хеш в формате "salt:hash"
 * @returns {Promise<boolean>} true если пароль совпадает
 */
async function verifyPassword(password, hash) {
    const crypto = require('crypto');
    const [salt, key] = hash.split(':');
    
    return new Promise((resolve, reject) => {
        crypto.pbkdf2(password, salt, 10000, 64, 'sha512', (err, derivedKey) => {
            if (err) reject(err);
            resolve(key === derivedKey.toString('hex'));
        });
    });
}

/**
 * Безопасное сравнение строк (защита от timing attacks)
 * Использует crypto.timingSafeEqual для постоянного времени выполнения
 * @param {string} a - Первая строка
 * @param {string} b - Вторая строка
 * @returns {boolean} true если строки совпадают
 */
function secureCompare(a, b) {
    const crypto = require('crypto');
    
    if (typeof a !== 'string' || typeof b !== 'string') {
        return false;
    }
    
    if (a.length !== b.length) {
        return false;
    }
    
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Логирование событий безопасности
 * @param {string} event - Название события
 * @param {object} data - Данные события
 */
function securityLog(event, data = {}) {
    const timestamp = new Date().toISOString();
    console.log(`[SECURITY] ${timestamp} - ${event}:`, JSON.stringify(data));
}

/**
 * Обнаружение подозрительной активности в заказах
 * Проверяет: большие суммы, большое количество товаров, подозрительные символы
 * @param {object} orderData - Данные заказа
 * @returns {Array<string>} Массив предупреждений
 */
function detectSuspiciousActivity(orderData) {
    const warnings = [];
    
    // Слишком большой заказ
    if (orderData.total > 500000) {
        warnings.push('Очень большая сумма заказа');
    }
    
    // Слишком много одинаковых товаров
    const maxQuantity = Math.max(...orderData.items.map(i => i.quantity));
    if (maxQuantity > 20) {
        warnings.push('Подозрительно большое количество товаров');
    }
    
    // Необычные символы в имени
    const suspiciousChars = /[<>{}[\]\\\/]/;
    if (suspiciousChars.test(orderData.userName)) {
        warnings.push('Подозрительные символы в имени');
    }
    
    return warnings;
}

/**
 * IP Blacklist - управление заблокированными IP адресами
 * Используется для блокировки злоумышленников
 */
const ipBlacklist = new Set();

/**
 * Проверить, заблокирован ли IP
 * @param {string} ip - IP адрес
 * @returns {boolean} true если IP заблокирован
 */
function isIpBlocked(ip) {
    return ipBlacklist.has(ip);
}

/**
 * Заблокировать IP адрес
 * @param {string} ip - IP адрес
 * @param {string} reason - Причина блокировки
 */
function blockIp(ip, reason) {
    ipBlacklist.add(ip);
    securityLog('IP_BLOCKED', { ip, reason });
}

/**
 * Разблокировать IP адрес
 * @param {string} ip - IP адрес
 */
function unblockIp(ip) {
    ipBlacklist.delete(ip);
    securityLog('IP_UNBLOCKED', { ip });
}

module.exports = {
    isValidTelegramId,
    isValidEmail,
    isValidPhone,
    generateSecureToken,
    hashPassword,
    verifyPassword,
    secureCompare,
    securityLog,
    detectSuspiciousActivity,
    isIpBlocked,
    blockIp,
    unblockIp
};
