from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    BOT_TOKEN: str
    ADMIN_ID: Optional[str] = None
    DATABASE_URL: str = "sqlite+aiosqlite:///shop.db"
    WEB_APP_URL: Optional[str] = None
    RAILWAY_PUBLIC_DOMAIN: Optional[str] = None
    PORT: int = 8000
    GEMINI_API_KEY: Optional[str] = None

    @property
    def resolved_web_app_url(self) -> str:
        if self.RAILWAY_PUBLIC_DOMAIN:
            return f"https://{self.RAILWAY_PUBLIC_DOMAIN}"
        return self.WEB_APP_URL or f"http://localhost:{self.PORT}"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

settings = Settings()

