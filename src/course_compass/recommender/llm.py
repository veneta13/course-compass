"""Thin wrapper around Ollama for embeddings and structured answers."""
from __future__ import annotations

from typing import TypeVar

import httpx
import numpy as np
from ollama import Client, ResponseError
from pydantic import BaseModel

from . import config
from .models import normalize

T = TypeVar("T", bound=BaseModel)


class LLMUnavailable(RuntimeError):
    """Ollama isn't running, or a model hasn't been downloaded."""


class OllamaLLM:
    def __init__(self, host: str | None = config.OLLAMA_HOST,
                 embed_model: str = config.EMBED_MODEL, chat_model: str = config.CHAT_MODEL):
        self.client = Client(host=host) if host else Client()
        self.embed_model = embed_model
        self.chat_model = chat_model

    def embed(self, texts: list[str], batch_size: int = 16) -> np.ndarray:
        """Normalized embeddings, one row per text."""
        vectors: list[list[float]] = []
        for start in range(0, len(texts), batch_size):
            response = self._call(self.client.embed, model=self.embed_model, input=texts[start:start + batch_size])
            vectors.extend(response["embeddings"])
        return normalize(np.asarray(vectors, dtype=np.float32))

    def extract(self, system: str, user: str, schema: type[T]) -> T:
        """Ask the chat model for an answer that follows `schema`.

        Ollama constrains the output to the JSON schema, so it always parses;
        temperature 0 makes the answer repeatable.
        """
        response = self._call(
            self.client.chat,
            model=self.chat_model,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            format=schema.model_json_schema(),
            options={"temperature": 0},
        )
        return schema.model_validate_json(response["message"]["content"])

    @staticmethod
    def _call(fn, **kwargs):
        model = kwargs.get("model")
        try:
            return fn(**kwargs)
        except ResponseError as e:
            if e.status_code == 404:
                raise LLMUnavailable(f"The Ollama model '{model}' isn't downloaded. Run: ollama pull {model}") from e
            raise LLMUnavailable(f"Ollama error: {e.error}") from e
        except (ConnectionError, httpx.ConnectError, httpx.TimeoutException) as e:
            raise LLMUnavailable("Ollama isn't running. Start it with: brew services start ollama") from e
