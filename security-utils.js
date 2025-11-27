/**
 * Security Utilities
 * Валидация, хеширование, безопасность
 */

const crypto = require('crypto');

// === ВАЛИДАЦИЯ ===

const isValidTelegramId = (id) => typeof id === 'number' && id > 0 && id < 10000000000;
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
const isValidPhone = (phone) => /^\+?[1-9]\d{1,14}$/.test(phone);

// === ТОКЕНЫ И ХЕШИ ===

const generateSecureToken = (len = 32) => crypto.randomBytes(len).toString('hex');

const hashPassword = async (password) => {
    const salt = crypto.randomBytes(16).toString('hex');
    return new Promise((resolve, reject) => {
        crypto.pbkdf2(password, salt, 10000, 64, 'sha512', (err, key) => {
            err ? reject(err) : resolve(`${salt}:${key.toString('hex')}`);
        });
    });
};

const verifyPassword = async (password, hash) => {
    const [salt, key] = hash.split(':');
    return new Promise((resolve, reject) => {
        crypto.pbkdf2(password, salt, 10000, 64, 'sha512', (err, derived) => {
            err ? reject(err) : resolve(key === derived.toString('hex'));
        });
    });
};

// Timing-safe сравнение
const secureCompare = (a, b) => {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

// === ЛОГИРОВАНИЕ ===

const securityLog = (event, data = {}) => {
    console.log(`[SECURITY] ${new Date().toISOString()} - ${event}:`, JSON.stringify(data));
};

// === ДЕТЕКЦИЯ ===

const detectSuspiciousActivity = (orderData) => {
    const warnings = [];
    if (orderData.total > 500000) warnings.push('Большая сумма');
    if (Math.max(...orderData.items.map(i => i.quantity)) > 20) warnings.push('Много товаров');
    if (/[<>{}[\]\\\/]/.test(orderData.userName)) warnings.push('Подозрительные символы');
    return warnings;
};

// === IP BLACKLIST ===

const ipBlacklist = new Set();
const isIpBlocked = (ip) => ipBlacklist.has(ip);
const blockIp = (ip, reason) => { ipBlacklist.add(ip); securityLog('IP_BLOCKED', { ip, reason }); };
const unblockIp = (ip) => { ipBlacklist.delete(ip); securityLog('IP_UNBLOCKED', { ip }); };

module.exports = {
    isValidTelegramId, isValidEmail, isValidPhone,
    generateSecureToken, hashPassword, verifyPassword, secureCompare,
    securityLog, detectSuspiciousActivity,
    isIpBlocked, blockIp, unblockIp
};
