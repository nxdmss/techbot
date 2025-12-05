from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from app.db.database import get_db
from app.services.product_service import product_service
from app.services.order_service import OrderService
from app.services.image_generation_service import image_generation_service
from app.schemas.product import Product
from app.schemas.order import OrderCreate, OrderItemSchema
from app.bot.loader import bot
from app.core.config import settings
from app.bot.keyboards import get_admin_order_keyboard
from pydantic import BaseModel

router = APIRouter(prefix="/api")

@router.get("/products", response_model=List[Product])
async def get_products(refresh: Optional[str] = None):
    if refresh == "true":
        return product_service.refresh()
    return product_service.get_products()

@router.get("/orders/{telegram_id}")
async def get_user_orders_endpoint(telegram_id: int, db: AsyncSession = Depends(get_db)):
    orders = await OrderService.get_user_orders(db, telegram_id)
    return {"orders": orders}

class PromoValidateRequest(BaseModel):
    code: str
    orderAmount: float

@router.post("/promo/validate")
async def validate_promo(req: PromoValidateRequest):
    return {"valid": False, "error": "Not implemented yet"}

@router.post("/data")
async def create_order_endpoint(data: OrderCreate, db: AsyncSession = Depends(get_db)):
    if not data.userId or data.userId == 'unknown':
         # In production, handle better. For now assume we need a valid ID.
         # Or create a guest user with negative ID?
         pass 

    try:
        # Check if userId is int
        try:
            telegram_id = int(data.userId)
        except:
            # If guest or string ID, handle appropriately. 
            # We'll skip for now and assume int as per typical Telegram flow.
            raise HTTPException(status_code=400, detail="Invalid User ID")

        user = await OrderService.create_or_update_user(
            db, 
            telegram_id=telegram_id, 
            username=None, 
            first_name=data.userName or "Customer"
        )
        
        order = await OrderService.create_order(db, user.id, data)
        
        items_text = "\n".join(
            [f"{i+1}. {item.name}\n   {item.quantity} × {item.price:,.0f}₽ = {item.price*item.quantity:,.0f}₽" 
             for i, item in enumerate(data.items)]
        )
        
        # Notify Admin
        if settings.ADMIN_ID:
            admin_text = (
                f"🆕 *НОВЫЙ ЗАКАЗ (Web)*\n\n📦 `{order.order_number}`\n"
                f"👤 {user.first_name}\n\n"
                f"{items_text}\n\n💰 *{order.total_amount:,.0f}₽*"
            )
            try:
                await bot.send_message(
                    settings.ADMIN_ID, 
                    admin_text, 
                    reply_markup=get_admin_order_keyboard(order.id, telegram_id),
                    parse_mode="Markdown"
                )
            except Exception as e:
                print(f"Failed to notify admin: {e}")

        # Notify User
        user_text = (
            f"✅ *Заказ оформлен!*\n\n📦 `{order.order_number}`\n\n"
            f"{items_text}\n\n💰 *Итого: {order.total_amount:,.0f}₽*\n\n"
            f"⏳ Ожидайте подтверждения!"
        )
        try:
            await bot.send_message(telegram_id, user_text, parse_mode="Markdown")
        except Exception as e:
            print(f"Failed to notify user: {e}")
            
    except Exception as e:
        print(f"Error creating order: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")
        
    return {"success": True}

class GenerateImageRequest(BaseModel):
    prompt: str

@router.post("/generate-image")
async def generate_image_endpoint(request: GenerateImageRequest):
    """
    Генерирует изображение по текстовому запросу.
    """
    try:
        image_bytes = await image_generation_service.generate_image(request.prompt)
        
        if not image_bytes:
            raise HTTPException(status_code=500, detail="Не удалось сгенерировать изображение")
        
        return Response(
            content=image_bytes,
            media_type="image/png",
            headers={
                "Content-Disposition": f'attachment; filename="generated_{request.prompt[:20]}.png"'
            }
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Error generating image: {e}")
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")
