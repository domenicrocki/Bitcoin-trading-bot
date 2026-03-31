import logging

from openai import AsyncOpenAI

from ai.base import AIProvider
from config import get_settings

logger = logging.getLogger(__name__)


class OpenAIProvider(AIProvider):
    """OpenAI GPT-4o provider for trading analysis."""

    MODEL = "gpt-4o"

    def __init__(self) -> None:
        settings = get_settings()
        self._client = AsyncOpenAI(api_key=settings.openai_api_key)

    @property
    def name(self) -> str:
        return "openai"

    async def analyze(self, prompt: str) -> str:
        """Send analysis prompt to OpenAI and return the response text."""
        try:
            response = await self._client.chat.completions.create(
                model=self.MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are an elite cryptocurrency trading analyst. "
                            "Always respond with valid JSON only."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                response_format={"type": "json_object"},
                temperature=0.3,
                max_tokens=1024,
            )
            content = response.choices[0].message.content
            if content is None:
                logger.error("OpenAI returned empty content")
                return ""
            logger.info("OpenAI analysis completed (%d chars)", len(content))
            return content
        except Exception as e:
            logger.error("OpenAI API error: %s", e, exc_info=True)
            return ""
