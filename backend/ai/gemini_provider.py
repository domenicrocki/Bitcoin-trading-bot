import logging

import google.generativeai as genai

from ai.base import AIProvider
from config import get_settings

logger = logging.getLogger(__name__)


class GeminiProvider(AIProvider):
    """Google Gemini provider for trading analysis."""

    MODEL = "gemini-2.0-flash"

    def __init__(self) -> None:
        settings = get_settings()
        genai.configure(api_key=settings.gemini_api_key)
        self._model = genai.GenerativeModel(
            model_name=self.MODEL,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                temperature=0.3,
                max_output_tokens=1024,
            ),
        )

    @property
    def name(self) -> str:
        return "gemini"

    async def analyze(self, prompt: str) -> str:
        """Send analysis prompt to Gemini and return the response text."""
        try:
            response = await self._model.generate_content_async(prompt)
            content = response.text
            if content is None:
                logger.error("Gemini returned empty content")
                return ""
            logger.info("Gemini analysis completed (%d chars)", len(content))
            return content
        except Exception as e:
            logger.error("Gemini API error: %s", e, exc_info=True)
            return ""
