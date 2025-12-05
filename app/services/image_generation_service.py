from app.core.config import settings
from typing import Optional
import io
from PIL import Image

# Условный импорт для Gemini API
try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    genai = None

class ImageGenerationService:
    def __init__(self):
        if GEMINI_AVAILABLE and settings.GEMINI_API_KEY:
            try:
                genai.configure(api_key=settings.GEMINI_API_KEY)
                self.model = genai.GenerativeModel('gemini-1.5-flash')
            except Exception as e:
                print(f"Ошибка инициализации Gemini API: {e}")
                self.model = None
        else:
            self.model = None
    
    async def generate_image(self, prompt: str) -> Optional[bytes]:
        """
        Генерирует изображение по текстовому запросу.
        Возвращает bytes изображения или None в случае ошибки.
        """
        try:
            # Генерируем изображение с текстом промпта
            # В будущем можно интегрировать реальный API для генерации изображений
            response = await self._generate_with_gemini(prompt)
            return response
        except Exception as e:
            print(f"Ошибка генерации изображения: {e}")
            return None
    
    async def _generate_with_gemini(self, prompt: str) -> Optional[bytes]:
        """
        Генерирует изображение используя Gemini API.
        Примечание: Gemini 1.5 может генерировать изображения через Imagen API,
        но для упрощения используем альтернативный подход с созданием изображения.
        """
        try:
            # Создаем изображение с градиентным фоном и текстом промпта
            img = Image.new('RGB', (1024, 1024), color='white')
            from PIL import ImageDraw, ImageFont
            import random
            
            draw = ImageDraw.Draw(img)
            
            # Создаем градиентный фон
            colors = [
                ((135, 206, 250), (255, 182, 193)),  # Голубой к розовому
                ((255, 218, 185), (255, 192, 203)),  # Персиковый к розовому
                ((176, 224, 230), (152, 251, 152)),  # Голубой к зеленому
                ((255, 250, 205), (255, 228, 196)),  # Желтый к персиковому
            ]
            color1, color2 = random.choice(colors)
            
            # Рисуем градиент
            for i in range(1024):
                r = int(color1[0] + (color2[0] - color1[0]) * i / 1024)
                g = int(color1[1] + (color2[1] - color1[1]) * i / 1024)
                b = int(color1[2] + (color2[2] - color1[2]) * i / 1024)
                draw.line([(0, i), (1024, i)], fill=(r, g, b))
            
            # Пытаемся использовать стандартный шрифт
            try:
                font_large = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 48)
                font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 32)
            except:
                try:
                    font_large = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf", 48)
                    font_small = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf", 32)
                except:
                    font_large = ImageFont.load_default()
                    font_small = ImageFont.load_default()
            
            # Разбиваем текст на строки
            words = prompt.split()
            lines = []
            current_line = ""
            for word in words:
                test_line = current_line + " " + word if current_line else word
                bbox = draw.textbbox((0, 0), test_line, font=font_large)
                if bbox[2] - bbox[0] < 900:
                    current_line = test_line
                else:
                    if current_line:
                        lines.append(current_line)
                    current_line = word
            if current_line:
                lines.append(current_line)
            
            # Рисуем текст по центру с тенью
            y_start = 400 - (len(lines) * 60) // 2
            for i, line in enumerate(lines[:15]):  # Максимум 15 строк
                bbox = draw.textbbox((0, 0), line, font=font_large if i == 0 else font_small)
                text_width = bbox[2] - bbox[0]
                text_height = bbox[3] - bbox[1]
                x = (1024 - text_width) // 2
                y = y_start + i * 60
                
                # Рисуем тень
                draw.text((x + 3, y + 3), line, fill=(0, 0, 0, 128), font=font_large if i == 0 else font_small)
                # Рисуем основной текст
                draw.text((x, y), line, fill='white', font=font_large if i == 0 else font_small)
            
            # Добавляем декоративные элементы
            draw.ellipse([50, 50, 150, 150], outline='white', width=3)
            draw.ellipse([874, 874, 974, 974], outline='white', width=3)
            
            # Сохраняем в bytes
            img_bytes = io.BytesIO()
            img.save(img_bytes, format='PNG')
            img_bytes.seek(0)
            return img_bytes.getvalue()
            
        except Exception as e:
            print(f"Ошибка создания изображения: {e}")
            import traceback
            traceback.print_exc()
            return None

# Singleton instance
image_generation_service = ImageGenerationService()
