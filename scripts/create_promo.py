import asyncio
import sys
import os
from datetime import datetime, timedelta

# Add project root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.database import AsyncSessionLocal
from app.db.models import PromoCode

async def create_promo():
    if len(sys.argv) < 5:
        print("Использование: python scripts/create_promo.py <CODE> <type> <value> <min_amount> [max_uses] [expires_days]")
        print("Пример: python scripts/create_promo.py SUMMER2024 percent 10 1000")
        return

    code = sys.argv[1].upper()
    discount_type = sys.argv[2]
    try:
        discount_value = float(sys.argv[3])
        min_amount = float(sys.argv[4])
        max_uses = int(sys.argv[5]) if len(sys.argv) > 5 else None
        expires_days = int(sys.argv[6]) if len(sys.argv) > 6 else None
    except ValueError:
        print("Ошибка: Неверный формат чисел")
        return

    if discount_type not in ['percent', 'fixed']:
        print("Ошибка: type должен быть 'percent' или 'fixed'")
        return

    expires_at = datetime.now() + timedelta(days=expires_days) if expires_days else None

    async with AsyncSessionLocal() as session:
        promo = PromoCode(
            code=code,
            discount_type=discount_type,
            discount_value=discount_value,
            min_order_amount=min_amount,
            max_uses=max_uses,
            expires_at=expires_at
        )
        session.add(promo)
        try:
            await session.commit()
            print(f"✅ Промокод {code} создан!")
        except Exception as e:
            print(f"❌ Ошибка создания: {e}")

if __name__ == "__main__":
    asyncio.run(create_promo())

