/**
 * bitter8 Telegram Shop Bot
 * Сервер + бот для Telegram Web App магазина
 */

require('dotenv').config({ silent: true });

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('./database');

// === КОНФИГУРАЦИЯ ===

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;
const PORT = process.env.PORT || 3000;

// Валидация токена
if (!TOKEN || !/^\d+:[A-Za-z0-9_-]+$/.test(TOKEN)) {
    console.error('❌ BOT_TOKEN не найден или неверный формат');
    process.exit(1);
}

// URL веб-приложения (Railway → WEB_APP_URL → localhost)
const WEB_APP_URL = process.env.RAILWAY_PUBLIC_DOMAIN 
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : process.env.RAILWAY_STATIC_URL || process.env.WEB_APP_URL || `http://localhost:${PORT}`;

// === ИНИЦИАЛИЗАЦИЯ ===

db.initializeDatabase();

const bot = new TelegramBot(TOKEN, { 
    polling: { interval: 1000, autoStart: false, params: { timeout: 30 } }
});

const app = express();
app.disable('x-powered-by');

// === MIDDLEWARE ===

// Rate Limiting (100 req/min)
const rateLimits = new Map();
app.use((req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    const data = rateLimits.get(ip) || { count: 0, reset: now + 60000 };
    
    if (now > data.reset) {
        data.count = 1;
        data.reset = now + 60000;
    } else if (++data.count > 100) {
        return res.status(429).json({ error: 'Слишком много запросов' });
    }
    
    rateLimits.set(ip, data);
    next();
});

// Security Headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// Static Files
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, filePath) => {
        if (/\.(html|css|js)$/.test(filePath)) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));

app.use(express.json({ limit: '1mb' }));

// === УТИЛИТЫ ===

const formatPrice = (price) => new Intl.NumberFormat('ru-RU', {
    style: 'currency', currency: 'RUB', minimumFractionDigits: 0
}).format(price);

const sanitize = (text) => typeof text === 'string' 
    ? text.replace(/[<>]/g, '').substring(0, 500) 
    : '';

const sendMsg = async (chatId, text, opts = {}) => {
    try { return await bot.sendMessage(chatId, text, opts); } 
    catch (e) { console.error('Send error:', e.message); }
};

// Валидация заказа
const validateOrder = (data) => {
    if (!data?.items?.length || data.items.length > 50) return false;
    
    for (const item of data.items) {
        if (!item.name || item.price <= 0 || item.quantity <= 0) return false;
        if (item.quantity > 100 || item.price > 10000000) return false;
    }
    
    const calculated = data.items.reduce((s, i) => s + i.price * i.quantity, 0);
    return Math.abs(calculated - data.total) < 1;
};

// === БОТ: КОМАНДЫ ===

// /start
bot.onText(/\/start/, async (msg) => {
    const { id: chatId } = msg.chat;
    const name = msg.from.first_name || 'Пользователь';
    const isAdmin = chatId.toString() === ADMIN_ID;
    
    const text = isAdmin
        ? `👋 Привет, ${name}!\n\n👨‍💼 *Режим админа*\n\n/orders - Заказы\n/stats - Статистика`
        : `👋 Привет, ${name}!\n\n🛍️ Добро пожаловать в *bitter8*!`;
    
    const keyboard = isAdmin
        ? [[{ text: '🛍️ Магазин', web_app: { url: WEB_APP_URL } }], ['📊 Статистика', '📋 Заказы']]
        : [[{ text: '🛍️ Открыть магазин', web_app: { url: WEB_APP_URL } }]];
    
    await sendMsg(chatId, text, { parse_mode: 'Markdown', reply_markup: { keyboard, resize_keyboard: true } });
});

// Обработка заказа из Web App
bot.on('web_app_data', async (msg) => {
    const chatId = msg.chat.id;
    
    try {
        const data = JSON.parse(msg.web_app_data.data);
        if (!validateOrder(data)) {
            return sendMsg(chatId, '❌ Ошибка валидации заказа');
        }
        
        // Сохранение в БД
        const user = db.createOrUpdateUser({
            id: data.userId || msg.from.id,
            username: msg.from.username,
            first_name: data.userName || msg.from.first_name
        });
        
        const order = db.createOrder(user.id, {
            items: data.items,
            total: data.total,
            promoCode: data.promoCode
        });
        
        // Список товаров
        const itemsList = data.items.map((i, n) => 
            `${n + 1}. ${i.name}\n   ${i.quantity} × ${formatPrice(i.price)} = ${formatPrice(i.price * i.quantity)}`
        ).join('\n');
        
        // Клиенту
        await sendMsg(chatId, 
            `✅ *Заказ оформлен!*\n\n📦 \`${order.order_number}\`\n\n${itemsList}\n\n💰 *Итого: ${formatPrice(data.total)}*\n\n⏳ Ожидайте подтверждения!`,
            { parse_mode: 'Markdown' }
        );
        
        // Админу
        if (ADMIN_ID) {
            await sendMsg(ADMIN_ID,
                `🆕 *НОВЫЙ ЗАКАЗ*\n\n📦 \`${order.order_number}\`\n👤 ${sanitize(data.userName)} (@${msg.from.username || '—'})\n\n${itemsList}\n\n💰 *${formatPrice(data.total)}*`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '✅ Принять', callback_data: `accept_${order.id}` }, { text: '❌ Отклонить', callback_data: `reject_${order.id}` }],
                            [{ text: '📞 Связаться', url: `tg://user?id=${data.userId}` }]
                        ]
                    }
                }
            );
        }
    } catch (e) {
        console.error('Order error:', e);
        sendMsg(chatId, '❌ Ошибка обработки заказа');
    }
});

// Callback кнопки (принять/отклонить заказ)
bot.on('callback_query', async (query) => {
    const { chat: { id: chatId }, message_id: msgId } = query.message;
    
    if (chatId.toString() !== ADMIN_ID) {
        return bot.answerCallbackQuery(query.id, { text: '❌ Доступ запрещён' });
    }
    
    const [action, orderId] = query.data.split('_');
    const order = db.getOrderById(parseInt(orderId));
    
    if (!order) {
        return bot.answerCallbackQuery(query.id, { text: '❌ Заказ не найден' });
    }
    
    const isAccept = action === 'accept';
    db.updateOrderStatus(order.id, isAccept ? 'processing' : 'cancelled');
    
    // Убираем кнопки
    try { await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: msgId }); } catch {}
    
    await sendMsg(chatId, `${isAccept ? '✅' : '❌'} Заказ \`${order.order_number}\` ${isAccept ? 'принят' : 'отклонён'}`, { parse_mode: 'Markdown' });
    
    // Уведомление клиенту
    const user = db.getUserByTelegramId(order.user_id);
    if (user) {
        const text = isAccept
            ? `✅ *Заказ принят!*\n\n📦 \`${order.order_number}\`\n\nМы свяжемся для уточнения доставки!`
            : `😔 *Заказ отклонён*\n\n📦 \`${order.order_number}\``;
        await sendMsg(user.telegram_id, text, { parse_mode: 'Markdown' });
    }
    
    bot.answerCallbackQuery(query.id, { text: isAccept ? '✅ Принят' : '❌ Отклонён' });
});

// /orders - Список заказов (админ)
bot.onText(/\/orders|📋 Заказы/, async (msg) => {
    if (msg.chat.id.toString() !== ADMIN_ID) return;
    
    const orders = db.getAllOrders({ limit: 20 });
    if (!orders.length) return sendMsg(msg.chat.id, '📭 Заказов нет');
    
    const statusIcons = { new: '🆕', processing: '⏳', paid: '💳', shipped: '🚚', delivered: '✅', cancelled: '❌' };
    const list = orders.map(o => 
        `${statusIcons[o.status] || '❓'} \`${o.order_number}\`\n👤 ${o.first_name} • ${formatPrice(o.total_amount)}`
    ).join('\n\n');
    
    await sendMsg(msg.chat.id, `📋 *ЗАКАЗЫ*\n\n${list}`, { parse_mode: 'Markdown' });
});

// /stats - Статистика (админ)
bot.onText(/\/stats|📊 Статистика/, async (msg) => {
    if (msg.chat.id.toString() !== ADMIN_ID) return;
    
    const stats = db.getOrderStats();
    const top = db.getTopProducts(5);
    
    let text = `📊 *СТАТИСТИКА*\n\n📦 Заказов: *${stats.total_orders || 0}*\n👥 Клиентов: *${stats.unique_customers || 0}*\n💰 Выручка: *${formatPrice(stats.total_revenue || 0)}*\n📈 Средний чек: *${formatPrice(stats.avg_order_value || 0)}*`;
    
    if (top.length) {
        text += '\n\n*🏆 Топ товаров:*\n' + top.map((p, i) => 
            `${i + 1}. ${p.product_name} (${p.total_sold} шт.)`
        ).join('\n');
    }
    
    await sendMsg(msg.chat.id, text, { parse_mode: 'Markdown' });
});

// === API ===

// Кеш товаров
let productsCache = null;
let cacheTime = 0;

app.get('/api/products', (req, res) => {
    try {
        const now = Date.now();
        if (productsCache && (now - cacheTime) < 10000 && req.query.refresh !== 'true') {
            return res.json(productsCache);
        }
        
        const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'products.json'), 'utf8'));
        
        productsCache = raw.map((p, i) => {
            const images = [p.image, ...(p.images || [])].filter(Boolean);
            return {
                id: p.id || i + 1,
                name: String(p.name || '').substring(0, 200),
                brand: String(p.brand || '').substring(0, 100),
                description: String(p.description || '').substring(0, 500),
                price: Number(p.price) || 0,
                emoji: p.emoji || '🛍️',
                image: images[0] || '',
                images: [...new Set(images)].slice(0, 10),
                fullDescription: String(p.fullDescription || p.description || '').substring(0, 2000),
                specs: (p.specs || []).slice(0, 20),
                dateAdded: p.dateAdded || new Date().toISOString()
            };
        });
        cacheTime = now;
        
        res.json(productsCache);
    } catch (e) {
        console.error('Products error:', e);
        res.status(500).json({ error: 'Ошибка загрузки товаров' });
    }
});

app.get('/api/orders/:id', (req, res) => {
    try {
        const user = db.getUserByTelegramId(parseInt(req.params.id));
        res.json({ orders: user ? db.getUserOrders(user.id, 50) : [] });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/promo/validate', (req, res) => {
    const { code, orderAmount } = req.body;
    if (!code || !orderAmount) return res.status(400).json({ error: 'Неверные данные' });
    res.json(db.validatePromoCode(code, orderAmount));
});

app.post('/api/data', (req, res) => {
    if (!validateOrder(req.body)) {
        return res.status(400).json({ error: 'Неверные данные' });
    }
    res.json({ success: true });
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// === ЗАПУСК ===

(async () => {
    try {
        const me = await bot.getMe();
        console.log(`✅ Бот: @${me.username}`);
        await bot.stopPolling().catch(() => {});
        await new Promise(r => setTimeout(r, 1000));
        await bot.startPolling();
        console.log('✅ Polling запущен');
    } catch (e) {
        console.error('❌ Ошибка бота:', e.message);
    }
})();

app.listen(PORT, () => {
    console.log(`🚀 Сервер: порт ${PORT}`);
    console.log(`📱 Web App: ${WEB_APP_URL}`);
});

// Обработка ошибок
bot.on('polling_error', (e) => {
    if (e.response?.statusCode !== 409) {
        console.error('Polling error:', e.message);
    }
});

process.on('unhandledRejection', (e) => console.error('Unhandled:', e));
process.on('SIGINT', () => { bot.stopPolling(); process.exit(0); });
