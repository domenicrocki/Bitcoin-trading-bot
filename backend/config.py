from pydantic_settings import BaseSettings
from typing import List


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

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


_settings = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
