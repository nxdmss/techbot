/**
 * Database Module
 * Работа с SQLite базой данных через better-sqlite3
 * Управление пользователями, заказами, промокодами
 */

const Database = require('better-sqlite3');
const path = require('path');

// Подключение к базе данных
const dbOptions = process.env.NODE_ENV === 'development' 
    ? { verbose: console.log }  // Логирование SQL в development
    : {};
const db = new Database(path.join(__dirname, 'shop.db'), dbOptions);

// Включаем поддержку внешних ключей для целостности данных
db.pragma('foreign_keys = ON');

/**
 * Инициализация базы данных
 * Создает все необходимые таблицы и индексы
 */
function initializeDatabase() {
    console.log('📊 Инициализация базы данных...');

    try {
    // Таблица пользователей
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            telegram_id INTEGER UNIQUE NOT NULL,
            username TEXT,
            first_name TEXT,
            last_name TEXT,
            phone_number TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Таблица заказов
    db.exec(`
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            order_number TEXT UNIQUE NOT NULL,
            status TEXT DEFAULT 'new',
            total_amount REAL NOT NULL,
            promo_code TEXT,
            discount_amount REAL DEFAULT 0,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // Таблица товаров в заказе
    db.exec(`
        CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            product_name TEXT NOT NULL,
            product_price REAL NOT NULL,
            quantity INTEGER NOT NULL,
            subtotal REAL NOT NULL,
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
        )
    `);

    // Таблица промокодов
    db.exec(`
        CREATE TABLE IF NOT EXISTS promo_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            discount_type TEXT NOT NULL,
            discount_value REAL NOT NULL,
            min_order_amount REAL DEFAULT 0,
            max_uses INTEGER,
            used_count INTEGER DEFAULT 0,
            expires_at DATETIME,
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Таблица истории использования промокодов
    db.exec(`
        CREATE TABLE IF NOT EXISTS promo_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            promo_code_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            order_id INTEGER NOT NULL,
            used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (promo_code_id) REFERENCES promo_codes(id),
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (order_id) REFERENCES orders(id)
        )
    `);
    } catch (error) {
        console.error('❌ Ошибка при создании таблиц:', error.message);
        throw error;
    }

    // Создание индексов для оптимизации запросов
    try {
        db.exec('CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)');
    } catch (error) {
        console.error('⚠️  Ошибка при создании индексов (возможно, уже существуют):', error.message);
    }

    console.log('✅ База данных инициализирована успешно!');
}

// ==================== USERS ====================

/**
 * Создать или обновить пользователя
 * Использует INSERT ... ON CONFLICT для обновления существующих записей
 * @param {object} telegramUser - Данные пользователя из Telegram
 * @returns {object} Объект пользователя из БД
 */
function createOrUpdateUser(telegramUser) {
    const stmt = db.prepare(`
        INSERT INTO users (telegram_id, username, first_name, last_name, phone_number, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(telegram_id) DO UPDATE SET
            username = excluded.username,
            first_name = excluded.first_name,
            last_name = excluded.last_name,
            phone_number = COALESCE(excluded.phone_number, phone_number),
            updated_at = CURRENT_TIMESTAMP
    `);

    const result = stmt.run(
        telegramUser.id,
        telegramUser.username || null,
        telegramUser.first_name || null,
        telegramUser.last_name || null,
        telegramUser.phone_number || null
    );

    return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramUser.id);
}

/**
 * Получить пользователя по Telegram ID
 * @param {number} telegramId - Telegram ID пользователя
 * @returns {object|null} Объект пользователя или null
 */
function getUserByTelegramId(telegramId) {
    return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
}

// ==================== ORDERS ====================

/**
 * Создать новый заказ
 * Использует транзакцию для атомарности операции
 * Генерирует уникальный номер заказа
 * @param {number} userId - ID пользователя
 * @param {object} orderData - Данные заказа (items, total, promoCode и т.д.)
 * @returns {object} Созданный заказ с товарами
 */
function createOrder(userId, orderData) {
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    
    // Начинаем транзакцию
    const transaction = db.transaction((userId, orderData) => {
        // Создаём заказ
        const orderStmt = db.prepare(`
            INSERT INTO orders (user_id, order_number, status, total_amount, promo_code, discount_amount, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        const orderResult = orderStmt.run(
            userId,
            orderNumber,
            'new',
            orderData.total,
            orderData.promoCode || null,
            orderData.discountAmount || 0,
            orderData.notes || null
        );

        const orderId = orderResult.lastInsertRowid;

        // Добавляем товары в заказ
        const itemStmt = db.prepare(`
            INSERT INTO order_items (order_id, product_id, product_name, product_price, quantity, subtotal)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        for (const item of orderData.items) {
            itemStmt.run(
                orderId,
                item.id || 0,
                item.name,
                item.price,
                item.quantity,
                item.price * item.quantity
            );
        }

        return orderId;
    });

    const orderId = transaction(userId, orderData);
    return getOrderById(orderId);
}

/**
 * Получить заказ по ID с товарами
 * @param {number} orderId - ID заказа
 * @returns {object|null} Заказ с массивом items или null
 */
function getOrderById(orderId) {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    
    if (order) {
        order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
    }
    
    return order;
}

/**
 * Получить заказ по номеру с товарами
 * @param {string} orderNumber - Номер заказа (ORD-...)
 * @returns {object|null} Заказ с массивом items или null
 */
function getOrderByNumber(orderNumber) {
    const order = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(orderNumber);
    
    if (order) {
        order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    }
    
    return order;
}

/**
 * Получить все заказы пользователя
 * @param {number} userId - ID пользователя
 * @param {number} limit - Максимальное количество заказов (по умолчанию 50)
 * @returns {Array} Массив заказов с товарами
 */
function getUserOrders(userId, limit = 50) {
    const orders = db.prepare(`
        SELECT * FROM orders 
        WHERE user_id = ? 
        ORDER BY created_at DESC 
        LIMIT ?
    `).all(userId, limit);

    // Добавляем товары к каждому заказу
    for (const order of orders) {
        order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    }

    return orders;
}

/**
 * Обновить статус заказа
 * @param {number} orderId - ID заказа
 * @param {string} status - Новый статус (new, processing, paid, shipped, delivered, cancelled)
 * @returns {object} Результат обновления
 */
function updateOrderStatus(orderId, status) {
    const validStatuses = ['new', 'processing', 'paid', 'shipped', 'delivered', 'cancelled'];
    
    if (!validStatuses.includes(status)) {
        throw new Error(`Invalid status: ${status}`);
    }

    const stmt = db.prepare(`
        UPDATE orders 
        SET status = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
    `);

    return stmt.run(status, orderId);
}

/**
 * Получить все заказы с фильтрацией (для админа)
 * @param {object} filters - Фильтры (status, startDate, endDate, limit)
 * @returns {Array} Массив заказов с данными пользователей и товарами
 */
function getAllOrders(filters = {}) {
    let query = 'SELECT o.*, u.telegram_id, u.first_name, u.username FROM orders o JOIN users u ON o.user_id = u.id';
    const conditions = [];
    const params = [];

    if (filters.status) {
        conditions.push('o.status = ?');
        params.push(filters.status);
    }

    if (filters.startDate) {
        conditions.push('o.created_at >= ?');
        params.push(filters.startDate);
    }

    if (filters.endDate) {
        conditions.push('o.created_at <= ?');
        params.push(filters.endDate);
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY o.created_at DESC';

    if (filters.limit) {
        query += ` LIMIT ${parseInt(filters.limit)}`;
    }

    const orders = db.prepare(query).all(...params);

    // Добавляем товары к каждому заказу
    for (const order of orders) {
        order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    }

    return orders;
}

// ==================== PROMO CODES ====================

/**
 * Создать промокод
 * @param {object} promoData - Данные промокода (code, discountType, discountValue и т.д.)
 * @returns {object} Результат создания
 */
function createPromoCode(promoData) {
    const stmt = db.prepare(`
        INSERT INTO promo_codes (code, discount_type, discount_value, min_order_amount, max_uses, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    return stmt.run(
        promoData.code.toUpperCase(),
        promoData.discountType, // 'percent' или 'fixed'
        promoData.discountValue,
        promoData.minOrderAmount || 0,
        promoData.maxUses || null,
        promoData.expiresAt || null
    );
}

/**
 * Проверить промокод
 * Проверяет: существование, активность, срок действия, лимиты, минимальную сумму
 * @param {string} code - Код промокода
 * @param {number} orderAmount - Сумма заказа
 * @returns {{valid: boolean, error?: string, promoId?: number, discount?: number, code?: string}}
 */
function validatePromoCode(code, orderAmount) {
    const promo = db.prepare(`
        SELECT * FROM promo_codes 
        WHERE code = ? AND is_active = 1
    `).get(code.toUpperCase());

    if (!promo) {
        return { valid: false, error: 'Промокод не найден' };
    }

    // Проверка срока действия
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
        return { valid: false, error: 'Промокод истёк' };
    }

    // Проверка лимита использований
    if (promo.max_uses && promo.used_count >= promo.max_uses) {
        return { valid: false, error: 'Промокод больше недействителен' };
    }

    // Проверка минимальной суммы заказа
    if (orderAmount < promo.min_order_amount) {
        return { 
            valid: false, 
            error: `Минимальная сумма заказа: ${promo.min_order_amount}₽` 
        };
    }

    // Вычисляем скидку
    let discount = 0;
    if (promo.discount_type === 'percent') {
        discount = (orderAmount * promo.discount_value) / 100;
    } else {
        discount = promo.discount_value;
    }

    return {
        valid: true,
        promoId: promo.id,
        discount: Math.min(discount, orderAmount),
        code: promo.code
    };
}

/**
 * Использовать промокод
 * Увеличивает счетчик использований и записывает в историю
 * Использует транзакцию для атомарности
 * @param {number} promoId - ID промокода
 * @param {number} userId - ID пользователя
 * @param {number} orderId - ID заказа
 */
function usePromoCode(promoId, userId, orderId) {
    const transaction = db.transaction((promoId, userId, orderId) => {
        // Увеличиваем счётчик использований
        db.prepare('UPDATE promo_codes SET used_count = used_count + 1 WHERE id = ?').run(promoId);

        // Записываем историю использования
        db.prepare(`
            INSERT INTO promo_usage (promo_code_id, user_id, order_id)
            VALUES (?, ?, ?)
        `).run(promoId, userId, orderId);
    });

    transaction(promoId, userId, orderId);
}

// ==================== STATISTICS ====================

/**
 * Получить статистику по заказам
 * @returns {object} Статистика: total_orders, total_revenue, avg_order_value, unique_customers, by_status
 */
function getOrderStats() {
    const stats = db.prepare(`
        SELECT 
            COUNT(*) as total_orders,
            SUM(total_amount) as total_revenue,
            AVG(total_amount) as avg_order_value,
            COUNT(DISTINCT user_id) as unique_customers
        FROM orders
        WHERE status != 'cancelled'
    `).get();

    const statusStats = db.prepare(`
        SELECT status, COUNT(*) as count
        FROM orders
        GROUP BY status
    `).all();

    return {
        ...stats,
        by_status: statusStats
    };
}

/**
 * Получить топ товары по продажам
 * @param {number} limit - Количество товаров (по умолчанию 10)
 * @returns {Array} Массив товаров с количеством продаж и выручкой
 */
function getTopProducts(limit = 10) {
    return db.prepare(`
        SELECT 
            product_name,
            SUM(quantity) as total_sold,
            SUM(subtotal) as total_revenue,
            COUNT(DISTINCT order_id) as orders_count
        FROM order_items
        GROUP BY product_name
        ORDER BY total_sold DESC
        LIMIT ?
    `).all(limit);
}

// ==================== EXPORT ====================

module.exports = {
    db,
    initializeDatabase,
    
    // Users
    createOrUpdateUser,
    getUserByTelegramId,
    
    // Orders
    createOrder,
    getOrderById,
    getOrderByNumber,
    getUserOrders,
    updateOrderStatus,
    getAllOrders,
    
    // Promo codes
    createPromoCode,
    validatePromoCode,
    usePromoCode,
    
    // Statistics
    getOrderStats,
    getTopProducts
};
