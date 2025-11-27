from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func, desc
from app.db.models import User, Order, OrderItem, PromoCode, PromoUsage
from app.schemas.order import OrderCreate
import datetime
import random

class OrderService:
    @staticmethod
    async def create_or_update_user(session: AsyncSession, telegram_id: int, username: str, first_name: str):
        stmt = select(User).where(User.telegram_id == telegram_id)
        result = await session.execute(stmt)
        user = result.scalar_one_or_none()

        if user:
            user.username = username
            user.first_name = first_name
            user.updated_at = datetime.datetime.now()
        else:
            user = User(telegram_id=telegram_id, username=username, first_name=first_name)
            session.add(user)
        
        await session.commit()
        await session.refresh(user)
        return user

    @staticmethod
    async def create_order(session: AsyncSession, user_id: int, data: OrderCreate):
        order_number = f"ORD-{int(datetime.datetime.now().timestamp())}-{random.randint(1000, 9999)}"
        
        # Calculate total to verify (optional, simplified here)
        
        order = Order(
            user_id=user_id,
            order_number=order_number,
            total_amount=data.total,
            promo_code=data.promoCode,
            discount_amount=data.discountAmount or 0,
            status="new"
        )
        session.add(order)
        await session.flush()

        for item in data.items:
            order_item = OrderItem(
                order_id=order.id,
                product_id=item.id or 0,
                product_name=item.name,
                product_price=item.price,
                quantity=item.quantity,
                subtotal=item.price * item.quantity
            )
            session.add(order_item)

        await session.commit()
        await session.refresh(order)
        return order

    @staticmethod
    async def get_order(session: AsyncSession, order_id: int):
        stmt = select(Order).where(Order.id == order_id)
        result = await session.execute(stmt)
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_order_with_items(session: AsyncSession, order_id: int):
        # Eager loading would be better but for simplicity
        order = await OrderService.get_order(session, order_id)
        if order:
            stmt = select(OrderItem).where(OrderItem.order_id == order.id)
            res = await session.execute(stmt)
            items = res.scalars().all()
            return order, items
        return None, []

    @staticmethod
    async def update_status(session: AsyncSession, order_id: int, status: str):
        stmt = update(Order).where(Order.id == order_id).values(status=status)
        await session.execute(stmt)
        await session.commit()

    @staticmethod
    async def get_user_orders(session: AsyncSession, telegram_id: int, limit: int = 50):
        stmt = select(User).where(User.telegram_id == telegram_id)
        result = await session.execute(stmt)
        user = result.scalar_one_or_none()
        
        if not user:
            return []
            
        stmt = select(Order).where(Order.user_id == user.id).order_by(desc(Order.created_at)).limit(limit)
        result = await session.execute(stmt)
        return result.scalars().all()

    @staticmethod
    async def get_all_orders(session: AsyncSession, limit: int = 20):
        stmt = select(Order).order_by(desc(Order.created_at)).limit(limit)
        result = await session.execute(stmt)
        orders = result.scalars().all()
        # To get user info, we might need a join or eager load. 
        # For now, we'll fetch user separately or use join in query if needed.
        # A simple join:
        stmt = select(Order, User).join(User).order_by(desc(Order.created_at)).limit(limit)
        result = await session.execute(stmt)
        return result.all() # returns list of (Order, User) tuples

    @staticmethod
    async def get_stats(session: AsyncSession):
        # Simplified stats
        total_orders = await session.scalar(select(func.count(Order.id)))
        total_revenue = await session.scalar(select(func.sum(Order.total_amount)).where(Order.status != 'cancelled'))
        
        return {
            "total_orders": total_orders,
            "total_revenue": total_revenue or 0
        }

