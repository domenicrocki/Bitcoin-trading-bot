def get_ai_provider(provider_name: str):
    """Factory function that lazily imports the requested AI provider."""
    if provider_name == "openai":
        from ai.openai_provider import OpenAIProvider
        return OpenAIProvider()
    elif provider_name == "gemini":
        from ai.gemini_provider import GeminiProvider
        return GeminiProvider()
    elif provider_name == "anthropic":
        from ai.anthropic_provider import AnthropicProvider
        return AnthropicProvider()
    else:
        raise ValueError(f"Unknown AI provider: {provider_name}. Supported: openai, gemini, anthropic")
