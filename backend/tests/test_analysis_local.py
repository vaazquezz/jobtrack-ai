"""Local keyword analysis (no AI) and the shared scoring / evidence checks."""

from app.analysis.local import KeywordAnalyzer
from app.analysis.schemas import AnalysisDraft, MetRequirement
from app.analysis.service import analyze, evidence_in_cv, normalize, score, verify_evidence
from tests.analysis_fixtures import CV, JOB


def run(cv: str = CV, job: str = JOB):
    return analyze(KeywordAnalyzer(), cv, job)


def names(items) -> list[str]:
    return [item.requirement for item in items]


def test_classifies_requirements_into_met_missing_and_ambiguous():
    result = run()

    assert names(result.met) == ["Python", "SQL", "Inglés"]
    assert names(result.missing) == ["TypeScript", "React", "AWS"]
    assert names(result.ambiguous) == [
        "Django",
        "Kubernetes",
        "Experiencia mínima de 3 años",
        "Titulación académica",
    ]


def test_met_requirements_quote_the_cv_verbatim():
    result = run()

    for item in result.met:
        assert item.evidence in CV
    assert result.met[0].evidence == "Experiencia con Python y FastAPI construyendo APIs REST."


def test_related_technology_is_ambiguous_with_an_explanation():
    django = next(a for a in run().ambiguous if a.requirement == "Django")

    assert "Python" in django.note and "FastAPI" in django.note
    assert django.evidence is not None and django.evidence in CV


def test_specific_database_demonstrates_sql():
    assert "SQL" in names(run().met)


def test_years_and_degree_are_never_assumed():
    notes = {a.requirement: a.note for a in run().ambiguous}

    assert "no puede comprobar años" in notes["Experiencia mínima de 3 años"]
    assert "titulación" in notes["Titulación académica"]


def test_skills_list_every_detected_term_with_its_status():
    skills = {s.name: s.status for s in run().skills}

    assert skills["Python"] == "demonstrated"
    assert skills["AWS"] == "missing"
    assert skills["Kubernetes"] == "ambiguous"


def test_matching_ignores_case_and_accents():
    result = run(cv="Experiencia en PYTHON y nivel de INGLES avanzado " * 2, job=JOB)

    assert {"Python", "Inglés"} <= set(names(result.met))


def test_words_inside_other_words_do_not_match():
    # "Java" must not match "JavaScript"; "Go" must not match "Google" or "going".
    result = run(cv="Trabajo con JavaScript y Google Docs todos los días.", job=JOB + " Java")

    assert "Java" in names(result.missing)


def test_recommendations_never_suggest_inventing_experience():
    recs = run().recommendations
    cv_recs = [r.text for r in recs if r.kind == "cv"]

    assert any("Si tienes experiencia real con AWS" in text for text in cv_recs)
    assert all("no la incluyas" in t for t in cv_recs if t.startswith("Si tienes experiencia real"))
    assert any(r.kind == "interview" and "Python" in r.text for r in recs)


def test_offer_without_known_terms_has_no_score():
    result = run(job="Buscamos una persona responsable y puntual para nuestra tienda de barrio.")

    assert result.met == result.missing == result.ambiguous == []
    assert result.score is None
    assert "no se han detectado" in result.summary


def test_result_is_marked_as_local_and_explains_its_limits():
    result = run()

    assert result.mode == "local"
    assert result.provider == "local-keywords"
    assert result.model is None
    assert any("sin IA" in notice for notice in result.notices)
    assert "no es una probabilidad" in result.score_explanation


# --- Shared service -------------------------------------------------------------


def test_score_formula():
    assert score(met=3, missing=3, ambiguous=4) == 50  # (3 + 2) / 10
    assert score(met=2, missing=0, ambiguous=0) == 100
    assert score(met=0, missing=5, ambiguous=0) == 0
    assert score(met=0, missing=0, ambiguous=0) is None  # no division by zero


def test_local_result_score_matches_its_counts():
    result = run()

    assert result.score == score(len(result.met), len(result.missing), len(result.ambiguous))


def test_evidence_check_is_tolerant_to_case_accents_and_spacing():
    assert evidence_in_cv("experiencia  con PYTHON", "Tengo Experiencia con Python.")
    assert evidence_in_cv("«Nivel de ingles B2»", CV)
    assert not evidence_in_cv("10 años liderando equipos", CV)
    assert not evidence_in_cv("   ", CV)
    assert normalize("  Ingeniería\n  Informática ") == "ingenieria informatica"


def test_invented_evidence_is_downgraded_to_ambiguous():
    draft = AnalysisDraft(
        summary="s",
        met=[
            MetRequirement(requirement="Python", evidence="Experiencia con Python"),
            MetRequirement(requirement="Kubernetes", evidence="5 años con Kubernetes"),
        ],
        missing=[],
        ambiguous=[],
        skills=[],
        recommendations=[],
    )

    met, ambiguous, downgraded = verify_evidence(draft, CV)

    assert [m.requirement for m in met] == ["Python"]
    assert [a.requirement for a in ambiguous] == ["Kubernetes"]
    assert "no aparece en el CV" in ambiguous[0].note
    assert downgraded == 1
