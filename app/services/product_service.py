import json
import os
from typing import List
from app.schemas.product import Product

class ProductService:
    def __init__(self, json_path: str = "public/products.json"):
        self.json_path = json_path
        self._cache: List[Product] = []
        self._last_loaded = 0

    def load_products(self) -> List[Product]:
        if not os.path.exists(self.json_path):
            return []
        
        try:
            with open(self.json_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                
            products = []
            for idx, item in enumerate(data):
                # Ensure ID exists
                if "id" not in item:
                    item["id"] = idx + 1
                
                # Handle images array logic from original JS
                images = [item.get("image")] + item.get("images", [])
                images = [img for img in images if img]
                item["images"] = list(set(images))[:10]
                if not item.get("image") and images:
                    item["image"] = images[0]
                
                products.append(Product(**item))
            
            self._cache = products
            return products
        except Exception as e:
            print(f"Error loading products: {e}")
            return []

    def get_products(self) -> List[Product]:
        # Simple caching strategy: reload if empty, otherwise serve cached
        # In production, might want a TTL or explicit reload method
        if not self._cache:
            return self.load_products()
        return self._cache

    def refresh(self):
        return self.load_products()

product_service = ProductService()

