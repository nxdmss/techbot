/**
 * Database Module
 * SQLite через better-sqlite3
 */

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'shop.db'));
db.pragma('foreign_keys = ON');

// === ИНИЦИАЛИЗАЦИЯ ===

function initializeDatabase() {
    console.log('📊 Инициализация БД...');
    
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
        );
        
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
        );
        
        CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            product_name TEXT NOT NULL,
            product_price REAL NOT NULL,
            quantity INTEGER NOT NULL,
            subtotal REAL NOT NULL,
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
        );
        
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
        );
        
        CREATE TABLE IF NOT EXISTS promo_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            promo_code_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            order_id INTEGER NOT NULL,
            used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (promo_code_id) REFERENCES promo_codes(id),
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (order_id) REFERENCES orders(id)
        );
    `);
    
    // Индексы
    try {
        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
            CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
            CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
        `);
    } catch {}
    
    console.log('✅ БД готова');
}

// === USERS ===

function createOrUpdateUser(user) {
    db.prepare(`
        INSERT INTO users (telegram_id, username, first_name, last_name, phone_number, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(telegram_id) DO UPDATE SET
            username = excluded.username,
            first_name = excluded.first_name,
            last_name = excluded.last_name,
            updated_at = CURRENT_TIMESTAMP
    `).run(user.id, user.username, user.first_name, user.last_name, user.phone_number);
    
    return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(user.id);
}

function getUserByTelegramId(telegramId) {
    return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
}

// === ORDERS ===

function createOrder(userId, data) {
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    
    const tx = db.transaction(() => {
        const { lastInsertRowid: orderId } = db.prepare(`
            INSERT INTO orders (user_id, order_number, status, total_amount, promo_code, discount_amount)
            VALUES (?, ?, 'new', ?, ?, ?)
        `).run(userId, orderNumber, data.total, data.promoCode, data.discountAmount || 0);
        
        const itemStmt = db.prepare(`
            INSERT INTO order_items (order_id, product_id, product_name, product_price, quantity, subtotal)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        for (const item of data.items) {
            itemStmt.run(orderId, item.id || 0, item.name, item.price, item.quantity, item.price * item.quantity);
        }
        
        return orderId;
    });
    
    return getOrderById(tx());
}

function getOrderById(id) {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (order) order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);
    return order;
}

function getUserOrders(userId, limit = 50) {
    const orders = db.prepare(`
        SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
    `).all(userId, limit);
    
    for (const order of orders) {
        order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    }
    return orders;
}

function updateOrderStatus(id, status) {
    const valid = ['new', 'processing', 'paid', 'shipped', 'delivered', 'cancelled'];
    if (!valid.includes(status)) throw new Error('Invalid status');
    
    return db.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, id);
}

function getAllOrders(filters = {}) {
    let query = 'SELECT o.*, u.telegram_id, u.first_name, u.username FROM orders o JOIN users u ON o.user_id = u.id';
    const params = [];
    const conditions = [];
    
    if (filters.status) { conditions.push('o.status = ?'); params.push(filters.status); }
    if (filters.startDate) { conditions.push('o.created_at >= ?'); params.push(filters.startDate); }
    if (filters.endDate) { conditions.push('o.created_at <= ?'); params.push(filters.endDate); }
    
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY o.created_at DESC';
    if (filters.limit) query += ` LIMIT ${parseInt(filters.limit)}`;
    
    const orders = db.prepare(query).all(...params);
    for (const order of orders) {
        order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    }
    return orders;
}

// === PROMO ===

function createPromoCode(data) {
    return db.prepare(`
        INSERT INTO promo_codes (code, discount_type, discount_value, min_order_amount, max_uses, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(data.code.toUpperCase(), data.discountType, data.discountValue, data.minOrderAmount || 0, data.maxUses, data.expiresAt);
}

function validatePromoCode(code, orderAmount) {
    const promo = db.prepare('SELECT * FROM promo_codes WHERE code = ? AND is_active = 1').get(code.toUpperCase());
    
    if (!promo) return { valid: false, error: 'Промокод не найден' };
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) return { valid: false, error: 'Промокод истёк' };
    if (promo.max_uses && promo.used_count >= promo.max_uses) return { valid: false, error: 'Промокод исчерпан' };
    if (orderAmount < promo.min_order_amount) return { valid: false, error: `Минимум: ${promo.min_order_amount}₽` };
    
    const discount = promo.discount_type === 'percent' 
        ? (orderAmount * promo.discount_value) / 100 
        : promo.discount_value;
    
    return { valid: true, promoId: promo.id, discount: Math.min(discount, orderAmount), code: promo.code };
}

function usePromoCode(promoId, userId, orderId) {
    db.transaction(() => {
        db.prepare('UPDATE promo_codes SET used_count = used_count + 1 WHERE id = ?').run(promoId);
        db.prepare('INSERT INTO promo_usage (promo_code_id, user_id, order_id) VALUES (?, ?, ?)').run(promoId, userId, orderId);
    })();
}

// === STATS ===

function getOrderStats() {
    const stats = db.prepare(`
        SELECT COUNT(*) as total_orders, SUM(total_amount) as total_revenue,
               AVG(total_amount) as avg_order_value, COUNT(DISTINCT user_id) as unique_customers
        FROM orders WHERE status != 'cancelled'
    `).get();
    
    stats.by_status = db.prepare('SELECT status, COUNT(*) as count FROM orders GROUP BY status').all();
    return stats;
}

function getTopProducts(limit = 10) {
    return db.prepare(`
        SELECT product_name, SUM(quantity) as total_sold, SUM(subtotal) as total_revenue
        FROM order_items GROUP BY product_name ORDER BY total_sold DESC LIMIT ?
    `).all(limit);
}

// === EXPORT ===

module.exports = {
    db, initializeDatabase,
    createOrUpdateUser, getUserByTelegramId,
    createOrder, getOrderById, getUserOrders, updateOrderStatus, getAllOrders,
    createPromoCode, validatePromoCode, usePromoCode,
    getOrderStats, getTopProducts
};
