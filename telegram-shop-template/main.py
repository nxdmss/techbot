import logging
import sys
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.database import init_db
from app.bot.loader import bot, dp
from app.bot.handlers import router as bot_router
from app.api.routes import router as api_router

logging.basicConfig(level=logging.INFO, stream=sys.stdout)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    
    # Include bot router
    dp.include_router(bot_router)
    
    # Start Bot Polling in background
    # In production, you might want to run bot in separate process or use webhooks
    polling_task = asyncio.create_task(dp.start_polling(bot))
    
    yield
    
    # Shutdown
    await bot.session.close()
    polling_task.cancel()
    try:
        await polling_task
    except asyncio.CancelledError:
        pass

app = FastAPI(lifespan=lifespan, title="Telegram Shop API")

# Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Routes
app.include_router(api_router)

# Static Files (Frontend)
app.mount("/", StaticFiles(directory="public", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=settings.PORT, reload=False)

