from abc import ABC, abstractmethod


class AIProvider(ABC):
    @abstractmethod
    async def analyze(self, prompt: str) -> str:
        """Send analysis prompt and return raw text response."""
        ...

    @property
    @abstractmethod
    def name(self) -> str:
        ...
