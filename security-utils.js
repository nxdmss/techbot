// Security utilities for bitter8 bot

/**
 * Валидация Telegram User ID
 */
function isValidTelegramId(id) {
    return typeof id === 'number' && id > 0 && id < 10000000000;
}

/**
 * Валидация Email (если будет использоваться)
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
}

/**
 * Валидация номера телефона
 */
function isValidPhone(phone) {
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    return phoneRegex.test(phone);
}

/**
 * Генерация безопасного случайного токена
 */
function generateSecureToken(length = 32) {
    const crypto = require('crypto');
    return crypto.randomBytes(length).toString('hex');
}

/**
 * Хеширование пароля (если будет использоваться)
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
 * Защита от timing attacks при сравнении строк
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
 * Логирование безопасных событий
 */
function securityLog(event, data = {}) {
    const timestamp = new Date().toISOString();
    console.log(`[SECURITY] ${timestamp} - ${event}:`, JSON.stringify(data));
}

/**
 * Проверка на подозрительную активность
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
 * IP whitelist/blacklist (для будущего использования)
 */
const ipBlacklist = new Set();

function isIpBlocked(ip) {
    return ipBlacklist.has(ip);
}

function blockIp(ip, reason) {
    ipBlacklist.add(ip);
    securityLog('IP_BLOCKED', { ip, reason });
}

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
