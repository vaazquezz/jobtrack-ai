"""Endpoints to analyse a CV against a job offer.

Texts are processed in memory only: they are not stored in the database or logged.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.analysis.anthropic_provider import AnthropicProvider
from app.analysis.local import KeywordAnalyzer
from app.analysis.provider import AIProvider, AIProviderError
from app.analysis.schemas import AnalysisConfig, AnalysisRequest, AnalysisResult
from app.analysis.service import analyze
from app.config import Settings, get_settings

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


def get_ai_provider(
    settings: Annotated[Settings, Depends(get_settings)],
) -> AIProvider | None:
    """The external AI provider, or None when no API key is configured."""
    if settings.anthropic_api_key is None:
        return None
    return AnthropicProvider(
        api_key=settings.anthropic_api_key.get_secret_value(),
        model=settings.anthropic_model,
        timeout=settings.ai_timeout_seconds,
        max_retries=settings.ai_max_retries,
    )


def get_local_provider() -> AIProvider:
    return KeywordAnalyzer()


AIProviderDep = Annotated[AIProvider | None, Depends(get_ai_provider)]
LocalProviderDep = Annotated[AIProvider, Depends(get_local_provider)]


@router.get("/config", response_model=AnalysisConfig)
def analysis_config(ai: AIProviderDep) -> AnalysisConfig:
    """Which modes are available. Never includes the API key."""
    return AnalysisConfig(
        ai_available=ai is not None,
        provider=ai.name if ai else None,
        model=ai.model if ai else None,
    )


@router.post("", response_model=AnalysisResult)
def analyze_offer(
    payload: AnalysisRequest, ai: AIProviderDep, local: LocalProviderDep
) -> AnalysisResult:
    """Compare a CV with a job offer.

    mode="local" never leaves the server. mode="ai" sends both texts to the configured
    provider and requires consent_external=true.
    """
    if payload.mode == "local":
        return analyze(local, payload.cv_text, payload.job_text)

    if ai is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El análisis con IA no está configurado en el servidor. Usa el análisis "
            "básico o configura ANTHROPIC_API_KEY.",
        )
    if not payload.consent_external:
        raise HTTPException(
            status_code=422,
            detail="Hace falta confirmar que aceptas enviar los textos al proveedor de IA.",
        )
    try:
        return analyze(ai, payload.cv_text, payload.job_text)
    except AIProviderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
