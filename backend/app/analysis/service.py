"""Turns a provider's draft into the final result: evidence check and score."""

import re
import unicodedata

from app.analysis.provider import AIProvider
from app.analysis.schemas import (
    AmbiguousRequirement,
    AnalysisDraft,
    AnalysisResult,
    MetRequirement,
)

SCORE_EXPLANATION = (
    "Puntuación orientativa = (requisitos cumplidos + 0,5 × requisitos ambiguos) ÷ "
    "requisitos analizados × 100. Solo resume este análisis: no es una probabilidad de "
    "ser contratado ni tiene en cuenta factores como el número de candidatos."
)


def normalize(text: str) -> str:
    """Lowercase, strip accents and collapse whitespace, for tolerant comparisons."""
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", text).strip().casefold()


def evidence_in_cv(evidence: str, cv_text: str) -> bool:
    needle = normalize(evidence.strip(" \"'«»“”…."))
    return bool(needle) and needle in normalize(cv_text)


def verify_evidence(
    draft: AnalysisDraft, cv_text: str
) -> tuple[list[MetRequirement], list[AmbiguousRequirement], int]:
    """Keep a requirement as met only if its evidence really appears in the CV.

    Anything else is downgraded to ambiguous, so invented experience can never be
    reported as demonstrated. Returns (met, ambiguous, number of downgrades).
    """
    met: list[MetRequirement] = []
    ambiguous = list(draft.ambiguous)
    downgraded = 0
    for item in draft.met:
        if evidence_in_cv(item.evidence, cv_text):
            met.append(item)
        else:
            downgraded += 1
            ambiguous.append(
                AmbiguousRequirement(
                    requirement=item.requirement,
                    evidence=None,
                    note="La evidencia indicada no aparece en el CV, así que no se da por "
                    "acreditado.",
                )
            )
    return met, ambiguous, downgraded


def score(met: int, missing: int, ambiguous: int) -> int | None:
    total = met + missing + ambiguous
    if total == 0:
        return None
    return round(100 * (met + 0.5 * ambiguous) / total)


def analyze(provider: AIProvider, cv_text: str, job_text: str) -> AnalysisResult:
    draft = provider.analyze(cv_text, job_text)
    met, ambiguous, downgraded = verify_evidence(draft, cv_text)

    notices: list[str] = []
    if provider.mode == "local":
        notices.append(
            "Análisis básico sin IA: compara palabras clave y tecnologías conocidas. No "
            "entiende el contexto, sinónimos poco comunes ni requisitos redactados de otra "
            "forma."
        )
    else:
        notices.append(
            "Análisis generado por un modelo de IA. Puede equivocarse: revisa los resultados "
            "antes de usarlos."
        )
    if downgraded:
        notices.append(
            f"{downgraded} requisito(s) marcados como cumplidos no tenían una evidencia "
            "literal en el CV y se han pasado a ambiguos."
        )

    return AnalysisResult(
        summary=draft.summary,
        met=met,
        missing=draft.missing,
        ambiguous=ambiguous,
        skills=draft.skills,
        recommendations=draft.recommendations,
        mode=provider.mode,
        provider=provider.name,
        model=provider.model,
        score=score(len(met), len(draft.missing), len(ambiguous)),
        score_explanation=SCORE_EXPLANATION,
        notices=notices,
    )
