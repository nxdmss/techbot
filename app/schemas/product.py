from pydantic import BaseModel, Field
from typing import List, Optional

class Product(BaseModel):
    id: int
    name: str
    brand: Optional[str] = ""
    description: Optional[str] = ""
    price: float
    emoji: Optional[str] = "🛍️"
    image: Optional[str] = ""
    images: List[str] = []
    fullDescription: Optional[str] = ""
    specs: List[str] = []
    dateAdded: Optional[str] = None

class ProductList(BaseModel):
    products: List[Product]

