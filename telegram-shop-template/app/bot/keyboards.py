from aiogram.types import ReplyKeyboardMarkup, KeyboardButton, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from app.core.config import settings

def get_main_keyboard(is_admin: bool = False) -> ReplyKeyboardMarkup:
    buttons = [
        [KeyboardButton(text="🛍️ Открыть магазин", web_app=WebAppInfo(url=settings.resolved_web_app_url))]
    ]
    
    if is_admin:
        buttons.append([KeyboardButton(text="📊 Статистика"), KeyboardButton(text="📋 Заказы")])
        
    return ReplyKeyboardMarkup(keyboard=buttons, resize_keyboard=True)

def get_admin_order_keyboard(order_id: int, user_telegram_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="✅ Принять", callback_data=f"accept_{order_id}"),
            InlineKeyboardButton(text="❌ Отклонить", callback_data=f"reject_{order_id}")
        ],
        [
            InlineKeyboardButton(text="📞 Связаться", url=f"tg://user?id={user_telegram_id}")
        ]
    ])

