#!/usr/bin/env node
/**
 * Создание промокодов
 * Использование: node scripts/create-promo.js CODE type value min_amount [max_uses] [expires_days]
 */

const db = require('../database');
db.initializeDatabase();

const [,, code, type, value, minAmount, maxUses, expiresDays] = process.argv;

if (!code || !type || !value || !minAmount) {
    console.log(`
Использование: node scripts/create-promo.js <CODE> <type> <value> <min_amount> [max_uses] [expires_days]

Примеры:
  node scripts/create-promo.js FIRST10 percent 10 500
  node scripts/create-promo.js SALE500 fixed 500 2000 100 30

Параметры:
  CODE        - Код промокода
  type        - percent | fixed
  value       - Размер скидки
  min_amount  - Минимальная сумма заказа
  max_uses    - Макс. использований (опционально)
  expires_days - Срок действия в днях (опционально)
`);
    process.exit(1);
}

if (!['percent', 'fixed'].includes(type)) {
    console.error('❌ type должен быть "percent" или "fixed"');
    process.exit(1);
}

try {
    const data = {
        code: code.toUpperCase(),
        discountType: type,
        discountValue: parseFloat(value),
        minOrderAmount: parseFloat(minAmount),
        maxUses: maxUses ? parseInt(maxUses) : null,
        expiresAt: expiresDays ? new Date(Date.now() + parseInt(expiresDays) * 86400000).toISOString() : null
    };

    db.createPromoCode(data);

    console.log(`✅ Промокод создан!
  Код: ${data.code}
  Тип: ${type === 'percent' ? 'Процент' : 'Фиксированная'}
  Скидка: ${type === 'percent' ? value + '%' : value + '₽'}
  Мин. сумма: ${minAmount}₽${data.maxUses ? `\n  Макс. использований: ${data.maxUses}` : ''}${data.expiresAt ? `\n  Истекает: ${new Date(data.expiresAt).toLocaleDateString('ru-RU')}` : ''}`);
} catch (e) {
    console.error(e.message.includes('UNIQUE') ? '❌ Такой промокод уже существует' : `❌ Ошибка: ${e.message}`);
    process.exit(1);
}
