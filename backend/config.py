from pathlib import Path
from pydantic_settings import BaseSettings
from typing import List

# Resolve .env: check both backend/.env and project-root/.env
_THIS_DIR = Path(__file__).resolve().parent
_ENV_CANDIDATES = [
    _THIS_DIR / ".env",          # backend/.env (if .env copied here)
    _THIS_DIR.parent / ".env",   # project-root/.env (default location)
]
_ENV_FILE = next((p for p in _ENV_CANDIDATES if p.exists()), _THIS_DIR.parent / ".env")


class Settings(BaseSettings):
    # Binance
    binance_api_key: str = ""
    binance_api_secret: str = ""
    binance_testnet: bool = True

    # AI Providers
    openai_api_key: str = ""
    gemini_api_key: str = ""
    anthropic_api_key: str = ""

    # Application
    database_url: str = "sqlite:///./trading_bot.db"
    log_level: str = "INFO"
    cors_origins: List[str] = ["http://localhost:5173", "http://localhost:3000"]

    model_config = {"env_file": str(_ENV_FILE), "env_file_encoding": "utf-8"}


_settings = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
