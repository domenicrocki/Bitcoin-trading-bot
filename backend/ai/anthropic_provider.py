import logging

from anthropic import AsyncAnthropic

from ai.base import AIProvider
from config import get_settings

logger = logging.getLogger(__name__)


class AnthropicProvider(AIProvider):
    """Anthropic Claude provider for trading analysis."""

    MODEL = "claude-sonnet-4-20250514"

    def __init__(self) -> None:
        settings = get_settings()
        self._client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    @property
    def name(self) -> str:
        return "anthropic"

    async def analyze(self, prompt: str) -> str:
        """Send analysis prompt to Anthropic Claude and return the response text."""
        try:
            message = await self._client.messages.create(
                model=self.MODEL,
                max_tokens=1024,
                temperature=0.3,
                system=(
                    "You are an elite cryptocurrency trading analyst. "
                    "Always respond with valid JSON only, no markdown or extra text."
                ),
                messages=[{"role": "user", "content": prompt}],
            )
            content = message.content[0].text
            if content is None:
                logger.error("Anthropic returned empty content")
                return ""
            logger.info("Anthropic analysis completed (%d chars)", len(content))
            return content
        except Exception as e:
            logger.error("Anthropic API error: %s", e, exc_info=True)
            return ""
