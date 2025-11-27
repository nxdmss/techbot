from pydantic import BaseModel
from typing import List, Optional

class OrderItemSchema(BaseModel):
    id: Optional[int] = 0
    name: str
    price: float
    quantity: int

class OrderCreate(BaseModel):
    items: List[OrderItemSchema]
    total: float
    promoCode: Optional[str] = None
    discountAmount: Optional[float] = 0.0
    userId: Optional[int] = None
    userName: Optional[str] = None
    timestamp: Optional[str] = None

