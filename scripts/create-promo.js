#!/usr/bin/env node

/**
 * Скрипт для создания промокодов
 * 
 * Использование:
 * node scripts/create-promo.js CODE10 percent 10 500
 * node scripts/create-promo.js SALE500 fixed 500 2000 100
 */

const db = require('../database');

// Инициализируем БД
db.initializeDatabase();

const args = process.argv.slice(2);

if (args.length < 4) {
    console.log('❌ Недостаточно аргументов!');
    console.log('\nИспользование:');
    console.log('node scripts/create-promo.js <CODE> <type> <value> <min_amount> [max_uses] [expires_days]');
    console.log('\nПримеры:');
    console.log('  node scripts/create-promo.js FIRST10 percent 10 500');
    console.log('  node scripts/create-promo.js SALE500 fixed 500 2000 100 30');
    console.log('\nПараметры:');
    console.log('  CODE         - Код промокода (заглавные буквы)');
    console.log('  type         - Тип скидки: percent (процент) или fixed (фиксированная)');
    console.log('  value        - Размер скидки (10 для 10% или 500 для 500₽)');
    console.log('  min_amount   - Минимальная сумма заказа');
    console.log('  max_uses     - Максимальное количество использований (опционально)');
    console.log('  expires_days - Действителен (дней) (опционально)');
    process.exit(1);
}

const [code, discountType, discountValue, minOrderAmount, maxUses, expiresDays] = args;

// Валидация
if (!['percent', 'fixed'].includes(discountType)) {
    console.error('❌ Тип скидки должен быть "percent" или "fixed"');
    process.exit(1);
}

const value = parseFloat(discountValue);
if (isNaN(value) || value <= 0) {
    console.error('❌ Неверное значение скидки');
    process.exit(1);
}

const minAmount = parseFloat(minOrderAmount);
if (isNaN(minAmount) || minAmount < 0) {
    console.error('❌ Неверная минимальная сумма заказа');
    process.exit(1);
}

// Создаём промокод
try {
    const promoData = {
        code: code.toUpperCase(),
        discountType,
        discountValue: value,
        minOrderAmount: minAmount,
        maxUses: maxUses ? parseInt(maxUses) : null,
        expiresAt: expiresDays ? new Date(Date.now() + parseInt(expiresDays) * 24 * 60 * 60 * 1000).toISOString() : null
    };

    const result = db.createPromoCode(promoData);

    console.log('✅ Промокод успешно создан!');
    console.log('\n📋 Детали:');
    console.log(`  Код: ${promoData.code}`);
    console.log(`  Тип: ${discountType === 'percent' ? 'Процент' : 'Фиксированная сумма'}`);
    console.log(`  Скидка: ${discountType === 'percent' ? value + '%' : value + '₽'}`);
    console.log(`  Мин. сумма: ${minAmount}₽`);
    if (promoData.maxUses) {
        console.log(`  Макс. использований: ${promoData.maxUses}`);
    }
    if (promoData.expiresAt) {
        console.log(`  Действителен до: ${new Date(promoData.expiresAt).toLocaleString('ru-RU')}`);
    }
    
} catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
        console.error('❌ Промокод с таким кодом уже существует!');
    } else {
        console.error('❌ Ошибка создания промокода:', error.message);
    }
    process.exit(1);
}
