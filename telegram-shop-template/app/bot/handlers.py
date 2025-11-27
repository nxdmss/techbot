import json
from aiogram import Router, F, Bot
from aiogram.filters import Command
from aiogram.types import Message, CallbackQuery
from aiogram.fsm.context import FSMContext
from app.core.config import settings
from app.bot.keyboards import get_main_keyboard, get_admin_order_keyboard
from app.services.order_service import OrderService
from app.db.database import AsyncSessionLocal
from app.schemas.order import OrderCreate

router = Router()

@router.message(Command("start"))
async def cmd_start(message: Message):
    is_admin = str(message.from_user.id) == settings.ADMIN_ID
    text = (
        f"👋 Привет, {message.from_user.first_name}!\n\n👨‍💼 *Режим админа*\n\n/orders - Заказы\n/stats - Статистика"
        if is_admin
        else f"👋 Привет, {message.from_user.first_name}!\n\n🛍️ Добро пожаловать в *Shop*!"
    )
    await message.answer(text, reply_markup=get_main_keyboard(is_admin), parse_mode="Markdown")

@router.message(Command("orders"))
async def cmd_orders(message: Message):
    if str(message.from_user.id) != settings.ADMIN_ID:
        return

    async with AsyncSessionLocal() as session:
        orders_data = await OrderService.get_all_orders(session, limit=20)
        
    if not orders_data:
        await message.answer("📭 Заказов нет")
        return

    status_icons = {"new": "🆕", "processing": "⏳", "paid": "💳", "shipped": "🚚", "delivered": "✅", "cancelled": "❌"}
    
    text_lines = []
    for order, user in orders_data:
        icon = status_icons.get(order.status, "❓")
        text_lines.append(f"{icon} `{order.order_number}`\n👤 {user.first_name} • {order.total_amount:,.0f}₽")
        
    await message.answer(f"📋 *ЗАКАЗЫ*\n\n" + "\n\n".join(text_lines), parse_mode="Markdown")

@router.message(Command("stats"))
async def cmd_stats(message: Message):
    if str(message.from_user.id) != settings.ADMIN_ID:
        return

    async with AsyncSessionLocal() as session:
        stats = await OrderService.get_stats(session)
        
    text = (
        f"📊 *СТАТИСТИКА*\n\n"
        f"📦 Заказов: *{stats['total_orders']}*\n"
        f"💰 Выручка: *{stats['total_revenue']:,.0f}₽*"
    )
    await message.answer(text, parse_mode="Markdown")

@router.message(F.content_type == "web_app_data")
async def web_app_data_handler(message: Message, bot: Bot):
    try:
        data_dict = json.loads(message.web_app_data.data)
        # Validate with Pydantic
        order_data = OrderCreate(**data_dict)
        
        async with AsyncSessionLocal() as session:
            # Create User
            user = await OrderService.create_or_update_user(
                session, 
                telegram_id=message.from_user.id,
                username=message.from_user.username,
                first_name=message.from_user.first_name
            )
            
            # Create Order
            order = await OrderService.create_order(session, user.id, order_data)
            
            items_text = "\n".join(
                [f"{i+1}. {item.name}\n   {item.quantity} × {item.price:,.0f}₽ = {item.price*item.quantity:,.0f}₽" 
                 for i, item in enumerate(order_data.items)]
            )
            
            # To User
            await message.answer(
                f"✅ *Заказ оформлен!*\n\n📦 `{order.order_number}`\n\n{items_text}\n\n💰 *Итого: {order.total_amount:,.0f}₽*\n\n⏳ Ожидайте подтверждения!",
                parse_mode="Markdown"
            )
            
            # To Admin
            if settings.ADMIN_ID:
                admin_text = (
                    f"🆕 *НОВЫЙ ЗАКАЗ*\n\n📦 `{order.order_number}`\n"
                    f"👤 {message.from_user.first_name} (@{message.from_user.username or '—'})\n\n"
                    f"{items_text}\n\n💰 *{order.total_amount:,.0f}₽*"
                )
                await bot.send_message(
                    settings.ADMIN_ID, 
                    admin_text, 
                    reply_markup=get_admin_order_keyboard(order.id, message.from_user.id),
                    parse_mode="Markdown"
                )
                
    except Exception as e:
        print(f"Error processing web_app_data: {e}")
        await message.answer("❌ Ошибка обработки заказа")

@router.callback_query(F.data.startswith("accept_") | F.data.startswith("reject_"))
async def order_callback(callback: CallbackQuery, bot: Bot):
    if str(callback.from_user.id) != settings.ADMIN_ID:
        await callback.answer("❌ Доступ запрещён")
        return

    action, order_id_str = callback.data.split("_")
    order_id = int(order_id_str)
    is_accept = action == "accept"
    
    async with AsyncSessionLocal() as session:
        order, items = await OrderService.get_order_with_items(session, order_id)
        if not order:
            await callback.answer("❌ Заказ не найден")
            return
            
        new_status = "processing" if is_accept else "cancelled"
        await OrderService.update_status(session, order_id, new_status)
        
        # Get user telegram id
        # Use a simple query since we don't have a direct relation loaded in get_order_with_items easily without eager loading setup
        result = await session.execute(select(User).where(User.id == order.user_id))
        user = result.scalar_one_or_none()
        
    # Update Admin Message
    try:
        await callback.message.edit_reply_markup(reply_markup=None)
    except:
        pass
    
    await callback.message.answer(
        f"{'✅' if is_accept else '❌'} Заказ `{order.order_number}` {'принят' if is_accept else 'отклонён'}",
        parse_mode="Markdown"
    )
    
    # Notify User
    if user:
        user_text = (
            f"✅ *Заказ принят!*\n\n📦 `{order.order_number}`\n\nМы свяжемся для уточнения доставки!"
            if is_accept
            else f"😔 *Заказ отклонён*\n\n📦 `{order.order_number}`"
        )
        try:
            await bot.send_message(user.telegram_id, user_text, parse_mode="Markdown")
        except Exception as e:
            print(f"Failed to notify user: {e}")

    await callback.answer("✅ Принят" if is_accept else "❌ Отклонён")

