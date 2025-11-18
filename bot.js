require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('./database');

// Инициализация базы данных
db.initializeDatabase();

// Проверка наличия токена
if (!process.env.BOT_TOKEN) {
    console.error('Ошибка: BOT_TOKEN не найден в .env файле!');
    process.exit(1);
}

// Инициализация бота с улучшенными настройками
const bot = new TelegramBot(process.env.BOT_TOKEN, { 
    polling: {
        interval: 300,
        autoStart: true,
        params: {
            timeout: 10
        }
    }
});

const ADMIN_ID = process.env.ADMIN_ID;

// Инициализация Express для хостинга веб-приложения
const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.disable('x-powered-by'); // Скрываем информацию о Express

// Rate limiting для защиты от DDoS
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 минута
const MAX_REQUESTS = 100; // Максимум запросов в минуту

app.use((req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    if (!requestCounts.has(ip)) {
        requestCounts.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    } else {
        const data = requestCounts.get(ip);
        
        if (now > data.resetTime) {
            data.count = 1;
            data.resetTime = now + RATE_LIMIT_WINDOW;
        } else {
            data.count++;
            
            if (data.count > MAX_REQUESTS) {
                return res.status(429).json({ 
                    error: 'Слишком много запросов. Попробуйте позже.' 
                });
            }
        }
    }
    
    next();
});

// Очистка старых записей rate limit каждые 5 минут
setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of requestCounts.entries()) {
        if (now > data.resetTime) {
            requestCounts.delete(ip);
        }
    }
}, 300000);

// Security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    next();
});

// Хостинг статических файлов
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '1mb' })); // Ограничение размера JSON

// Проверка origin для защиты от CSRF
app.use((req, res, next) => {
    const allowedOrigins = [
        process.env.WEB_APP_URL,
        `http://localhost:${PORT}`,
        'https://web.telegram.org'
    ];
    
    const origin = req.headers.origin;
    if (origin && allowedOrigins.some(allowed => origin.includes(allowed?.replace('https://', '').replace('http://', '')))) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    
    next();
});

// Функция для безопасной отправки сообщений
async function safeSendMessage(chatId, text, options = {}) {
    try {
        return await bot.sendMessage(chatId, text, options);
    } catch (error) {
        console.error('Ошибка отправки сообщения:', error.message);
        return null;
    }
}

// Обработка команды /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.first_name || 'Пользователь';
    
    const webAppUrl = process.env.WEB_APP_URL || `http://localhost:${PORT}`;
    
    // Проверяем, админ ли это
    if (chatId.toString() === ADMIN_ID) {
        await safeSendMessage(chatId, `Привет, ${username}! 👋\n\n👨‍💼 *Режим администратора*\n\nВы будете получать все заказы от клиентов.\n\n📊 Команды:\n/orders - Список заказов\n/stats - Статистика`, {
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [
                    [{ text: '🛍️ Открыть магазин', web_app: { url: webAppUrl } }],
                    [{ text: '📊 Статистика' }, { text: '📋 Заказы' }]
                ],
                resize_keyboard: true
            }
        });
    } else {
        await safeSendMessage(chatId, `Привет, ${username}! 👋\n\n🛍️ Добро пожаловать в *bitter8*!\n\nОткройте каталог и выберите товары.`, {
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [
                    [{ text: '🛍️ Открыть магазин', web_app: { url: webAppUrl } }]
                ],
                resize_keyboard: true
            }
        });
    }
});

// Функция валидации данных заказа
function validateOrderData(orderData) {
    // Проверка структуры
    if (!orderData || typeof orderData !== 'object') {
        return { valid: false, error: 'Неверный формат данных' };
    }
    
    // Проверка наличия обязательных полей
    if (!Array.isArray(orderData.items) || orderData.items.length === 0) {
        return { valid: false, error: 'Корзина пуста' };
    }
    
    if (orderData.items.length > 50) {
        return { valid: false, error: 'Слишком много товаров в заказе' };
    }
    
    // Проверка каждого товара
    for (const item of orderData.items) {
        if (!item.name || typeof item.name !== 'string' || item.name.length > 200) {
            return { valid: false, error: 'Неверное название товара' };
        }
        
        if (typeof item.price !== 'number' || item.price <= 0 || item.price > 10000000) {
            return { valid: false, error: 'Неверная цена товара' };
        }
        
        if (typeof item.quantity !== 'number' || item.quantity <= 0 || item.quantity > 100) {
            return { valid: false, error: 'Неверное количество товара' };
        }
    }
    
    // Проверка суммы
    if (typeof orderData.total !== 'number' || orderData.total <= 0 || orderData.total > 10000000) {
        return { valid: false, error: 'Неверная сумма заказа' };
    }
    
    // Проверка соответствия суммы
    const calculatedTotal = orderData.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    if (Math.abs(calculatedTotal - orderData.total) > 0.01) {
        return { valid: false, error: 'Несоответствие суммы заказа' };
    }
    
    return { valid: true };
}

// Функция для санитизации текста (защита от XSS)
function sanitizeText(text) {
    if (typeof text !== 'string') return '';
    return text
        .replace(/[<>]/g, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+=/gi, '')
        .substring(0, 500);
}

// Обработка данных из Web App
bot.on('web_app_data', async (msg) => {
    const chatId = msg.chat.id;
    const data = msg.web_app_data.data;
    
    try {
        const orderData = JSON.parse(data);
        
        // Валидация данных
        const validation = validateOrderData(orderData);
        if (!validation.valid) {
            console.error('Ошибка валидации заказа:', validation.error);
            await safeSendMessage(chatId, `❌ Ошибка: ${validation.error}`);
            return;
        }
        
        console.log('Получен заказ:', orderData);
        
        // Создаём или обновляем пользователя в БД
        const user = db.createOrUpdateUser({
            id: orderData.userId || msg.from.id,
            username: msg.from.username,
            first_name: orderData.userName || msg.from.first_name,
            last_name: msg.from.last_name
        });
        
        // Санитизация данных пользователя
        const sanitizedUserName = sanitizeText(orderData.userName || 'Неизвестно');
        
        // Сохраняем заказ в БД
        const order = db.createOrder(user.id, {
            items: orderData.items,
            total: orderData.total,
            promoCode: orderData.promoCode || null,
            discountAmount: orderData.discountAmount || 0,
            notes: null
        });
        
        // Формируем сообщение для клиента
        let clientMessage = '✅ *Заказ оформлен!*\n\n';
        clientMessage += `📦 Номер заказа: \`${order.order_number}\`\n\n`;
        clientMessage += `📋 *Ваш заказ:*\n`;
        
        orderData.items.forEach((item, index) => {
            const itemTotal = item.price * item.quantity;
            clientMessage += `${index + 1}. ${item.name}\n`;
            clientMessage += `   ${item.quantity} шт. × ${formatPrice(item.price)} = ${formatPrice(itemTotal)}\n`;
        });
        
        clientMessage += `\n💰 *Итого: ${formatPrice(orderData.total)}*\n\n`;
        clientMessage += `⏳ Ожидайте подтверждения от администратора.\nМы свяжемся с вами в ближайшее время!`;
        
        await safeSendMessage(chatId, clientMessage, { parse_mode: 'Markdown' });
        
        // Отправляем заказ админу
        if (ADMIN_ID) {
            let adminMessage = '🆕 *НОВЫЙ ЗАКАЗ*\n\n';
            adminMessage += `📦 Заказ: \`${order.order_number}\`\n`;
            adminMessage += `👤 Клиент: ${sanitizedUserName}\n`;
            adminMessage += `📱 Username: @${msg.from.username || 'не указан'}\n\n`;
            adminMessage += `🛍 *Товары:*\n`;
            
            orderData.items.forEach((item, index) => {
                const itemTotal = item.price * item.quantity;
                adminMessage += `${index + 1}. ${item.name}\n`;
                adminMessage += `   ${item.quantity} шт. × ${formatPrice(item.price)} = ${formatPrice(itemTotal)}\n`;
            });
            
            adminMessage += `\n💰 *Итого: ${formatPrice(orderData.total)}*\n`;
            adminMessage += `\n📅 ${new Date(order.created_at).toLocaleString('ru-RU')}`;
            
            await safeSendMessage(ADMIN_ID, adminMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '✅ Принять', callback_data: `accept_${order.id}` },
                            { text: '❌ Отклонить', callback_data: `reject_${order.id}` }
                        ],
                        [
                            { text: '📞 Связаться с клиентом', url: `tg://user?id=${orderData.userId}` }
                        ]
                    ]
                }
            });
        }
        
    } catch (error) {
        console.error('Ошибка обработки заказа:', error);
        await safeSendMessage(chatId, '❌ Ошибка обработки заказа');
    }
});

// Обработка нажатий на кнопки админа
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;
    
    // Проверка, что это админ
    if (chatId.toString() !== ADMIN_ID) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Доступ запрещён' });
        return;
    }
    
    const [action, orderIdStr] = data.split('_');
    const orderId = parseInt(orderIdStr);
    
    const order = db.getOrderById(orderId);
    
    if (!order) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Заказ не найден' });
        return;
    }
    
    // Получаем пользователя для отправки уведомления
    const user = db.getUserByTelegramId(order.user_id);
    
    if (action === 'accept') {
        // Принимаем заказ
        db.updateOrderStatus(orderId, 'processing');
        
        // Уведомляем админа
        await bot.answerCallbackQuery(query.id, { text: '✅ Заказ принят!' });
        
        // Обновляем сообщение админа
        try {
            await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
                chat_id: chatId,
                message_id: messageId
            });
        } catch (err) {
            console.error('Ошибка обновления кнопок:', err.message);
        }
        
        await safeSendMessage(chatId, `✅ Заказ \`${order.order_number}\` принят в работу!`, { parse_mode: 'Markdown' });
        
        // Уведомляем клиента
        const acceptMessage = `✅ *Ваш заказ принят!*\n\n📦 Заказ: \`${order.order_number}\`\n\n🎉 Отлично! Ваш заказ принят и обрабатывается.\nМы свяжемся с вами для уточнения деталей доставки!`;
        
        if (user) {
            await safeSendMessage(user.telegram_id, acceptMessage, { parse_mode: 'Markdown' });
        }
        
    } else if (action === 'reject') {
        // Отклоняем заказ
        db.updateOrderStatus(orderId, 'cancelled');
        
        // Уведомляем админа
        await bot.answerCallbackQuery(query.id, { text: '❌ Заказ отклонён' });
        
        // Обновляем сообщение админа
        try {
            await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
                chat_id: chatId,
                message_id: messageId
            });
        } catch (err) {
            console.error('Ошибка обновления кнопок:', err.message);
        }
        
        await safeSendMessage(chatId, `❌ Заказ \`${order.order_number}\` отклонён.`, { parse_mode: 'Markdown' });
        
        // Уведомляем клиента
        const rejectMessage = `😔 *Заказ отклонён*\n\n📦 Заказ: \`${order.order_number}\`\n\nК сожалению, мы не можем выполнить ваш заказ.\nПожалуйста, свяжитесь с нами для уточнения деталей.`;
        
        if (user) {
            await safeSendMessage(user.telegram_id, rejectMessage, { parse_mode: 'Markdown' });
        }
    }
});

function formatPrice(price) {
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        minimumFractionDigits: 0
    }).format(price);
}

// Команда для просмотра заказов (только для админа)
bot.onText(/\/orders|📋 Заказы/, async (msg) => {
    const chatId = msg.chat.id;
    
    if (chatId.toString() !== ADMIN_ID) {
        await safeSendMessage(chatId, '❌ Доступ запрещён');
        return;
    }
    
    const orders = db.getAllOrders({ limit: 20 });
    
    if (orders.length === 0) {
        await safeSendMessage(chatId, '📭 Заказов пока нет');
        return;
    }
    
    let message = '📋 *ПОСЛЕДНИЕ ЗАКАЗЫ*\n\n';
    
    const statusEmojis = {
        'new': '🆕',
        'processing': '⏳',
        'paid': '💳',
        'shipped': '🚚',
        'delivered': '✅',
        'cancelled': '❌'
    };
    
    orders.forEach((order) => {
        const statusEmoji = statusEmojis[order.status] || '❓';
        message += `${statusEmoji} \`${order.order_number}\`\n`;
        message += `👤 ${order.first_name}\n`;
        message += `💰 ${formatPrice(order.total_amount)}\n`;
        message += `📅 ${new Date(order.created_at).toLocaleString('ru-RU')}\n\n`;
    });
    
    await safeSendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// Команда для статистики (только для админа)
bot.onText(/\/stats|📊 Статистика/, async (msg) => {
    const chatId = msg.chat.id;
    
    if (chatId.toString() !== ADMIN_ID) {
        await safeSendMessage(chatId, '❌ Доступ запрещён');
        return;
    }
    
    const stats = db.getOrderStats();
    const topProducts = db.getTopProducts(5);
    
    let statsMessage = '📊 *СТАТИСТИКА*\n\n';
    statsMessage += `📦 Всего заказов: *${stats.total_orders || 0}*\n`;
    statsMessage += `👥 Уникальных клиентов: *${stats.unique_customers || 0}*\n`;
    statsMessage += `💰 Общая выручка: *${formatPrice(stats.total_revenue || 0)}*\n`;
    statsMessage += `📈 Средний чек: *${formatPrice(stats.avg_order_value || 0)}*\n\n`;
    
    if (stats.by_status && stats.by_status.length > 0) {
        statsMessage += `*По статусам:*\n`;
        const statusNames = {
            'new': '🆕 Новые',
            'processing': '⏳ В обработке',
            'paid': '💳 Оплачены',
            'shipped': '🚚 Доставляются',
            'delivered': '✅ Доставлены',
            'cancelled': '❌ Отменены'
        };
        
        stats.by_status.forEach(s => {
            statsMessage += `${statusNames[s.status] || s.status}: ${s.count}\n`;
        });
    }
    
    if (topProducts.length > 0) {
        statsMessage += `\n*🏆 Топ товаров:*\n`;
        topProducts.forEach((product, index) => {
            statsMessage += `${index + 1}. ${product.product_name}\n`;
            statsMessage += `   Продано: ${product.total_sold} шт. (${formatPrice(product.total_revenue)})\n`;
        });
    }
    
    await safeSendMessage(chatId, statsMessage, { parse_mode: 'Markdown' });
});

// Обработка сообщений
bot.on('message', async (msg) => {
    // Игнорируем команды и web_app_data
    if (msg.text && !msg.text.startsWith('/') && !msg.web_app_data) {
        const chatId = msg.chat.id;
        await safeSendMessage(chatId, `Вы написали: ${msg.text}\n\nИспользуйте кнопку ниже для открытия приложения! 👇`);
    }
});

// API endpoint для получения данных из веб-приложения (с валидацией)
app.post('/api/data', (req, res) => {
    try {
        const orderData = req.body;
        
        // Валидация данных
        const validation = validateOrderData(orderData);
        if (!validation.valid) {
            return res.status(400).json({ 
                success: false, 
                error: validation.error 
            });
        }
        
        console.log('Получены данные через API:', orderData);
        res.json({ success: true, message: 'Данные получены' });
    } catch (error) {
        console.error('Ошибка обработки данных:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Ошибка обработки данных' 
        });
    }
});

// API endpoint для получения истории заказов пользователя
app.get('/api/orders/:telegramId', (req, res) => {
    try {
        const telegramId = parseInt(req.params.telegramId);
        
        if (!telegramId || isNaN(telegramId)) {
            return res.status(400).json({ error: 'Неверный ID пользователя' });
        }
        
        const user = db.getUserByTelegramId(telegramId);
        
        if (!user) {
            return res.json({ orders: [] });
        }
        
        const orders = db.getUserOrders(user.id, 50);
        
        // Форматируем даты для фронтенда
        const formattedOrders = orders.map(order => ({
            id: order.id,
            order_number: order.order_number,
            status: order.status,
            total_amount: order.total_amount,
            discount_amount: order.discount_amount,
            promo_code: order.promo_code,
            created_at: order.created_at,
            items: order.items
        }));
        
        res.json({ orders: formattedOrders });
    } catch (error) {
        console.error('Ошибка получения заказов:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// API endpoint для проверки промокода
app.post('/api/promo/validate', (req, res) => {
    try {
        const { code, orderAmount } = req.body;
        
        if (!code || typeof code !== 'string') {
            return res.status(400).json({ error: 'Промокод не указан' });
        }
        
        if (!orderAmount || typeof orderAmount !== 'number') {
            return res.status(400).json({ error: 'Сумма заказа не указана' });
        }
        
        const validation = db.validatePromoCode(code, orderAmount);
        
        res.json(validation);
    } catch (error) {
        console.error('Ошибка проверки промокода:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// API endpoint для получения списка товаров (с кешированием)
let productsCache = null;
let productsCacheTime = 0;
const CACHE_DURATION = 60000; // 1 минута

app.get('/api/products', (req, res) => {
    try {
        const now = Date.now();
        
        // Используем кеш если данные свежие
        if (productsCache && (now - productsCacheTime) < CACHE_DURATION) {
            res.setHeader('Cache-Control', 'public, max-age=60');
            return res.json(productsCache);
        }
        
        const productsPath = path.join(__dirname, 'products.json');
        const productsData = fs.readFileSync(productsPath, 'utf8');
        const products = JSON.parse(productsData);
        
        // Валидация товаров
        if (!Array.isArray(products)) {
            throw new Error('Неверный формат данных товаров');
        }
        
        // Санитизация данных - удаляем потенциально опасные поля
        const sanitizedProducts = products.map(p => ({
            id: p.id,
            name: String(p.name || '').substring(0, 200),
            brand: String(p.brand || '').substring(0, 100),
            description: String(p.description || '').substring(0, 500),
            price: Number(p.price) || 0,
            image: String(p.image || ''),
            images: Array.isArray(p.images) ? p.images.slice(0, 10) : [],
            fullDescription: String(p.fullDescription || '').substring(0, 2000),
            specs: Array.isArray(p.specs) ? p.specs.slice(0, 20) : []
        }));
        
        // Обновляем кеш
        productsCache = sanitizedProducts;
        productsCacheTime = now;
        
        res.setHeader('Cache-Control', 'public, max-age=60');
        res.json(sanitizedProducts);
    } catch (error) {
        console.error('Ошибка чтения товаров:', error);
        res.status(500).json({ error: 'Ошибка загрузки товаров' });
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Страница не найдена' });
});

// Запуск веб-сервера
app.listen(PORT, () => {
    console.log(`🚀 Бот запущен!`);
    console.log(`🌐 Веб-сервер работает на порту ${PORT}`);
    console.log(`📱 Web App URL: ${process.env.WEB_APP_URL || `http://localhost:${PORT}`}`);
    console.log(`🔒 Безопасность: Rate limiting, CORS, Headers, Validation ✓`);
});

// Обработка ошибок с логированием
bot.on('polling_error', (error) => {
    console.error(`[${new Date().toISOString()}] Ошибка polling:`, error.code || error.message);
});

bot.on('error', (error) => {
    console.error(`[${new Date().toISOString()}] Общая ошибка бота:`, error.message);
});

// Обработка необработанных отклонений промисов
process.on('unhandledRejection', (reason, promise) => {
    console.error(`[${new Date().toISOString()}] Unhandled Rejection:`, reason);
});

process.on('uncaughtException', (error) => {
    console.error(`[${new Date().toISOString()}] Uncaught Exception:`, error);
    // Даём время на запись логов перед выходом
    setTimeout(() => process.exit(1), 1000);
});

process.on('SIGINT', () => {
    console.log('\n👋 Остановка бота...');
    bot.stopPolling();
    process.exit(0);
});
