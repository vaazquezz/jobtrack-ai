"""Basic analysis without AI: keyword and technology matching.

It looks for known technologies and competencies in the job offer and checks whether
the CV mentions them literally. It does not understand context, so the result is a
starting point, not a judgement.
"""

import re
from dataclasses import dataclass

from app.analysis.schemas import (
    AmbiguousRequirement,
    AnalysisDraft,
    AnalysisMode,
    MetRequirement,
    MissingRequirement,
    Recommendation,
    Skill,
)
from app.analysis.service import normalize


@dataclass(frozen=True)
class Term:
    name: str  # display name
    patterns: tuple[str, ...]  # regexes matched against normalized (lowercase) text
    related: tuple[str, ...] = ()  # names of terms that partially cover this one


def _w(word: str) -> str:
    """Whole-word pattern that also works for words with symbols (c++, node.js)."""
    return rf"(?<![\w+#.]){word}(?![\w+#])"


CATALOG: tuple[Term, ...] = (
    # Languages
    Term("Python", (_w("python"),)),
    Term("JavaScript", (_w("javascript"), _w(r"js")), ("TypeScript",)),
    Term("TypeScript", (_w("typescript"), _w(r"ts")), ("JavaScript",)),
    Term("Java", (_w("java"),), ("Kotlin",)),
    Term("Kotlin", (_w("kotlin"),), ("Java",)),
    Term("C#", (_w(r"c#"),), (".NET",)),
    Term("C++", (_w(r"c\+\+"),)),
    Term("Go", (_w("golang"), r"(?<![\w.])go(?= ?\(golang\)| lang)")),
    Term("Rust", (_w("rust"),)),
    Term("PHP", (_w("php"),)),
    Term("Ruby", (_w("ruby"),)),
    # Using a SQL database demonstrates SQL; the reverse is not true (see PostgreSQL).
    Term("SQL", (_w("sql"), _w("postgresql"), _w("postgres"), _w("mysql"), _w("sqlite"))),
    # Frameworks and libraries
    Term("React", (_w("react"), _w(r"react\.js"), _w("reactjs")), ("Vue", "Angular")),
    Term("Vue", (_w("vue"), _w(r"vue\.js")), ("React", "Angular")),
    Term("Angular", (_w("angular"),), ("React", "Vue")),
    Term("Node.js", (_w(r"node\.js"), _w("nodejs"), _w("node")), ("JavaScript",)),
    Term("Next.js", (_w(r"next\.js"), _w("nextjs")), ("React",)),
    Term(".NET", (r"(?<![\w])\.net(?![\w])", _w("dotnet")), ("C#",)),
    Term("Django", (_w("django"),), ("Python", "FastAPI", "Flask")),
    Term("FastAPI", (_w("fastapi"),), ("Python", "Django", "Flask")),
    Term("Flask", (_w("flask"),), ("Python", "Django", "FastAPI")),
    Term("Spring", (_w("spring"), _w("spring boot")), ("Java",)),
    Term("Tailwind CSS", (_w("tailwind"),), ("CSS",)),
    Term("HTML", (_w("html"), _w("html5"))),
    Term("CSS", (_w("css"), _w("css3"))),
    Term("pandas", (_w("pandas"),), ("Python",)),
    Term("TensorFlow", (_w("tensorflow"),), ("PyTorch",)),
    Term("PyTorch", (_w("pytorch"),), ("TensorFlow",)),
    # Data stores
    Term("PostgreSQL", (_w("postgresql"), _w("postgres")), ("SQL", "MySQL")),
    Term("MySQL", (_w("mysql"),), ("SQL", "PostgreSQL")),
    Term("SQLite", (_w("sqlite"),), ("SQL",)),
    Term("MongoDB", (_w("mongodb"), _w("mongo"))),
    Term("Redis", (_w("redis"),)),
    # Cloud and DevOps
    Term("AWS", (_w("aws"), _w("amazon web services")), ("Azure", "Google Cloud")),
    Term("Azure", (_w("azure"),), ("AWS", "Google Cloud")),
    Term("Google Cloud", (_w("gcp"), _w("google cloud")), ("AWS", "Azure")),
    Term("Docker", (_w("docker"),), ("Kubernetes",)),
    Term("Kubernetes", (_w("kubernetes"), _w("k8s")), ("Docker",)),
    Term("Terraform", (_w("terraform"),)),
    Term("Linux", (_w("linux"),)),
    Term("Git", (_w("git"), _w("github"), _w("gitlab"))),
    Term("CI/CD", (_w(r"ci/cd"), _w("github actions"), _w("gitlab ci"), _w("jenkins"))),
    # Practices and testing
    Term("REST APIs", (_w("rest"), _w("restful"), _w("api rest"), _w("apis rest")), ("GraphQL",)),
    Term("GraphQL", (_w("graphql"),), ("REST APIs",)),
    Term("Testing", (_w("testing"), _w("tests"), _w("pytest"), _w("jest"), _w("vitest"))),
    Term("Microservicios", (_w("microservicios"), _w("microservices"))),
    Term("Machine learning", (_w("machine learning"), _w("aprendizaje automatico"))),
    Term("Agile / Scrum", (_w("scrum"), _w("agile"), _w("agil"), _w("kanban"))),
    # Competencies
    Term("Inglés", (_w("ingles"), _w("english"))),
    Term("Liderazgo", (_w("liderazgo"), _w("leadership"), _w("lider tecnico"), _w("tech lead"))),
    Term("Comunicación", (_w("comunicacion"), _w("communication"))),
    Term("Trabajo en equipo", (_w("trabajo en equipo"), _w("teamwork"))),
)

BY_NAME = {term.name: term for term in CATALOG}

YEARS_PATTERN = re.compile(r"(\d{1,2})\s*\+?\s*(?:anos|years)")
DEGREE_PATTERN = re.compile(
    r"(?<!\w)(grado en|titulacion|titulado|licenciatura|ingenieria|degree|bachelor)(?!\w)"
)


def _mentions(term: Term, normalized_text: str) -> bool:
    return any(re.search(pattern, normalized_text) for pattern in term.patterns)


def _cv_excerpt(term: Term, cv_text: str) -> str | None:
    """First CV line that mentions the term, verbatim (trimmed to a readable length)."""
    for line in cv_text.splitlines():
        if _mentions(term, normalize(line)):
            excerpt = line.strip()
            return excerpt if len(excerpt) <= 160 else excerpt[:157].rstrip() + "…"
    return None


class KeywordAnalyzer:
    """Local provider used when there is no API key or the user prefers no AI."""

    name = "local-keywords"
    model: str | None = None
    mode: AnalysisMode = "local"

    def analyze(self, cv_text: str, job_text: str) -> AnalysisDraft:
        cv, job = normalize(cv_text), normalize(job_text)
        wanted = [term for term in CATALOG if _mentions(term, job)]

        met: list[MetRequirement] = []
        missing: list[MissingRequirement] = []
        ambiguous: list[AmbiguousRequirement] = []
        skills: list[Skill] = []

        for term in wanted:
            excerpt = _cv_excerpt(term, cv_text) if _mentions(term, cv) else None
            if excerpt:
                met.append(MetRequirement(requirement=term.name, evidence=excerpt))
                skills.append(Skill(name=term.name, status="demonstrated"))
                continue
            related = [name for name in term.related if _mentions(BY_NAME[name], cv)]
            if related:
                ambiguous.append(
                    AmbiguousRequirement(
                        requirement=term.name,
                        evidence=_cv_excerpt(BY_NAME[related[0]], cv_text),
                        note=f"El CV menciona {', '.join(related)}, relacionado con "
                        f"{term.name}, pero no {term.name} de forma explícita.",
                    )
                )
                skills.append(Skill(name=term.name, status="ambiguous"))
            else:
                missing.append(
                    MissingRequirement(
                        requirement=term.name, note="La oferta lo menciona y el CV no."
                    )
                )
                skills.append(Skill(name=term.name, status="missing"))

        years = YEARS_PATTERN.search(job)
        if years:
            ambiguous.append(
                AmbiguousRequirement(
                    requirement=f"Experiencia mínima de {years.group(1)} años",
                    note="El análisis básico no puede comprobar años de experiencia: "
                    "revisa las fechas de tu CV.",
                )
            )
        if DEGREE_PATTERN.search(job):
            ambiguous.append(
                AmbiguousRequirement(
                    requirement="Titulación académica",
                    note="La oferta menciona una titulación; el análisis básico no puede "
                    "comprobar si la tuya encaja.",
                )
            )

        return AnalysisDraft(
            summary=self._summary(len(wanted), len(met), len(ambiguous), len(missing)),
            met=met,
            missing=missing,
            ambiguous=ambiguous,
            skills=skills,
            recommendations=self._recommendations(met, missing, ambiguous),
        )

    @staticmethod
    def _summary(found: int, met: int, ambiguous: int, missing: int) -> str:
        if found == 0 and ambiguous == 0:
            return (
                "Análisis básico sin IA: no se han detectado en la oferta tecnologías ni "
                "competencias del catálogo. Prueba con el análisis con IA o revisa la oferta "
                "manualmente."
            )
        return (
            f"Análisis básico sin IA: de {found} tecnologías y competencias detectadas en la "
            f"oferta, {met} aparecen en el CV. Hay {ambiguous} punto(s) ambiguos y {missing} "
            "que el CV no menciona."
        )

    @staticmethod
    def _recommendations(
        met: list[MetRequirement],
        missing: list[MissingRequirement],
        ambiguous: list[AmbiguousRequirement],
    ) -> list[Recommendation]:
        recs: list[Recommendation] = []
        for item in missing[:4]:
            recs.append(
                Recommendation(
                    kind="cv",
                    text=f"Si tienes experiencia real con {item.requirement}, añádela al CV con "
                    "un ejemplo concreto. Si no la tienes, no la incluyas: valora formarte o "
                    "explicar cómo la aprenderías.",
                )
            )
        for item in ambiguous[:3]:
            recs.append(
                Recommendation(
                    kind="cv",
                    text=f"Deja claro en el CV lo relativo a «{item.requirement}», solo si es "
                    "cierto en tu caso: ahora mismo no se puede comprobar.",
                )
            )
        for item in met[:3]:
            recs.append(
                Recommendation(
                    kind="interview",
                    text=f"Prepara un ejemplo concreto (situación, qué hiciste, resultado) en "
                    f"el que usaste {item.requirement}.",
                )
            )
        if missing:
            recs.append(
                Recommendation(
                    kind="interview",
                    text="Prepara una respuesta honesta sobre los requisitos que no cumples y "
                    "cómo te pondrías al día.",
                )
            )
        return recs
