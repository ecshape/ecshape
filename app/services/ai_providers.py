"""AI providers a trainer can connect with their own key (Studio → Settings → AI keys).

Anthropic runs through the official SDK; every other provider speaks the OpenAI-compatible
chat-completions protocol, so one HTTP client covers them all.
"""
from __future__ import annotations

import re
from typing import Dict, List, Optional

PROVIDERS: List[Dict] = [
    {"id": "anthropic", "label": "Anthropic", "product": "Claude", "placeholder": "sk-ant-…", "key_url": "https://console.anthropic.com/settings/keys",
     "default_model": "claude-opus-5-5", "models": ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"], "base_url": None},
    {"id": "openai", "label": "OpenAI", "product": "ChatGPT", "placeholder": "sk-…", "key_url": "https://platform.openai.com/api-keys",
     "default_model": "gpt-4.1", "models": ["gpt-4.1", "gpt-4.1-mini", "gpt-4o", "o4-mini"], "base_url": "https://api.openai.com/v1"},
    {"id": "google", "label": "Google", "product": "Gemini", "placeholder": "AIza…", "key_url": "https://aistudio.google.com/apikey",
     "default_model": "gemini-2.5-flash", "models": ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"], "base_url": "https://generativelanguage.googleapis.com/v1beta/openai"},
    {"id": "mistral", "label": "Mistral AI", "product": "Le Chat", "placeholder": "…", "key_url": "https://console.mistral.ai/api-keys",
     "default_model": "mistral-large-latest", "models": ["mistral-large-latest", "mistral-medium-latest", "mistral-small-latest"], "base_url": "https://api.mistral.ai/v1"},
    {"id": "xai", "label": "xAI", "product": "Grok", "placeholder": "xai-…", "key_url": "https://console.x.ai",
     "default_model": "grok-3", "models": ["grok-3", "grok-3-mini"], "base_url": "https://api.x.ai/v1"},
    {"id": "deepseek", "label": "DeepSeek", "product": "DeepSeek", "placeholder": "sk-…", "key_url": "https://platform.deepseek.com/api_keys",
     "default_model": "deepseek-chat", "models": ["deepseek-chat", "deepseek-reasoner"], "base_url": "https://api.deepseek.com/v1"},
    {"id": "groq", "label": "Groq", "product": "Llama (Groq)", "placeholder": "gsk_…", "key_url": "https://console.groq.com/keys",
     "default_model": "llama-3.3-70b-versatile", "models": ["llama-3.3-70b-versatile", "qwen/qwen3-32b"], "base_url": "https://api.groq.com/openai/v1"},
    {"id": "openrouter", "label": "OpenRouter", "product": "OpenRouter", "placeholder": "sk-or-…", "key_url": "https://openrouter.ai/keys",
     "default_model": "openrouter/auto", "models": ["openrouter/auto", "anthropic/claude-opus-5-5", "openai/gpt-4.1", "google/gemini-2.5-pro"], "base_url": "https://openrouter.ai/api/v1"},
    {"id": "custom", "label": "Other (OpenAI-compatible)", "product": "Custom", "placeholder": "API key", "key_url": "",
     "default_model": "", "models": [], "base_url": None, "needs_base_url": True},
]

_BY_ID = {p["id"]: p for p in PROVIDERS}
# Older rows written before the catalogue existed
_ALIASES = {"other": "custom"}


def provider_info(pid: Optional[str]) -> Optional[Dict]:
    if not pid:
        return None
    return _BY_ID.get(_ALIASES.get(pid, pid))


def detect_provider(api_key: str) -> Optional[str]:
    """Recognise the provider from the pasted key's prefix (None = can't tell)."""
    key = (api_key or "").strip()
    if len(key) < 12:
        return None
    if key.startswith("sk-ant-"):
        return "anthropic"
    if key.startswith("sk-or-"):
        return "openrouter"
    if key.startswith("AIza"):
        return "google"
    if key.startswith("gsk_"):
        return "groq"
    if key.startswith("xai-"):
        return "xai"
    if re.fullmatch(r"sk-[a-f0-9]{32}", key):
        return "deepseek"
    if key.startswith("sk-"):
        return "openai"
    if re.fullmatch(r"[A-Za-z0-9]{32}", key):
        return "mistral"
    return None


def public_catalogue() -> List[Dict]:
    return [{k: v for k, v in p.items()} for p in PROVIDERS]
