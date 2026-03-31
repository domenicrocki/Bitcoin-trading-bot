from ai.openai_provider import OpenAIProvider
from ai.gemini_provider import GeminiProvider
from ai.anthropic_provider import AnthropicProvider


def get_ai_provider(provider_name: str):
    providers = {
        "openai": OpenAIProvider,
        "gemini": GeminiProvider,
        "anthropic": AnthropicProvider,
    }
    if provider_name not in providers:
        raise ValueError(f"Unknown AI provider: {provider_name}")
    return providers[provider_name]()
