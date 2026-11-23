import { useState, type ReactNode } from 'react'
import { analysisToText, providerLabel, SKILL_STATUS_LABELS } from '../lib/analysis'
import type { AnalysisResult, SkillStatus } from '../types/application'
import { AlertIcon, Button, CheckIcon, CloseIcon, CopyIcon, SparklesIcon } from './ui'

const SKILL_STYLES: Record<SkillStatus, { chip: string; mark: string }> = {
  demonstrated: { chip: 'bg-emerald-50 text-emerald-800 ring-emerald-200', mark: '✓' },
  missing: { chip: 'bg-rose-50 text-rose-800 ring-rose-200', mark: '✕' },
  ambiguous: { chip: 'bg-amber-50 text-amber-900 ring-amber-200', mark: '?' },
}

function ResultList({
  title,
  description,
  accent,
  icon,
  count,
  empty,
  children,
}: {
  title: string
  description: string
  accent: string
  icon: ReactNode
  count: number
  empty: string
  children: ReactNode
}) {
  return (
    <section
      aria-label={title}
      className={`flex min-w-0 flex-col rounded-xl border border-t-4 border-slate-200 bg-white p-4 shadow-sm ${accent}`}
    >
      <h3 className="flex items-center gap-2 font-semibold text-slate-900">
        {icon}
        {title}
        <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
          {count}
        </span>
      </h3>
      <p className="mt-0.5 text-xs text-slate-500">{description}</p>
      {count === 0 ? (
        <p className="mt-3 text-sm text-slate-400">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-3">{children}</ul>
      )}
    </section>
  )
}

function Quote({ text }: { text: string }) {
  return (
    <blockquote className="mt-1 border-l-2 border-slate-200 pl-2 text-xs text-slate-500 italic">
      «{text}»
    </blockquote>
  )
}

export function AnalysisResultView({ result }: { result: AnalysisResult }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const cvTips = result.recommendations.filter((r) => r.kind === 'cv')
  const interviewTips = result.recommendations.filter((r) => r.kind === 'interview')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(analysisToText(result))
      setCopyState('copied')
    } catch {
      setCopyState('error')
    }
  }

  return (
    <div className="space-y-4" aria-label="Resultado del análisis">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                result.mode === 'ai'
                  ? 'bg-indigo-50 text-indigo-700 ring-indigo-200'
                  : 'bg-slate-100 text-slate-700 ring-slate-200'
              }`}
            >
              {result.mode === 'ai' && <SparklesIcon className="h-3.5 w-3.5" />}
              {providerLabel(result)}
            </span>
            <h2 className="mt-3 text-lg font-semibold text-slate-900">Resumen de compatibilidad</h2>
            <p className="mt-1 text-sm text-slate-700">{result.summary}</p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <Button variant="secondary" onClick={() => void copy()}>
              <CopyIcon />
              {copyState === 'copied' ? 'Copiado' : 'Copiar resultado'}
            </Button>
            <span role="status" className="text-xs text-slate-500">
              {copyState === 'copied' && 'Análisis copiado al portapapeles.'}
              {copyState === 'error' && 'No se pudo copiar. Selecciona el texto manualmente.'}
            </span>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 rounded-lg bg-slate-50 p-4 sm:flex-row sm:items-center sm:gap-5">
          <div className="shrink-0">
            <p className="text-xs font-medium text-slate-500">Puntuación orientativa</p>
            <p className="text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">
              {result.score === null ? '—' : result.score}
              {result.score !== null && <span className="text-base font-normal text-slate-400">/100</span>}
            </p>
          </div>
          <p className="text-xs text-slate-600">
            {result.score === null
              ? 'No se ha podido calcular porque no se han detectado requisitos en la oferta. '
              : ''}
            {result.score_explanation}
          </p>
        </div>

        {result.notices.length > 0 && (
          <ul className="mt-4 space-y-2">
            {result.notices.map((notice) => (
              <li
                key={notice}
                className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900"
              >
                <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {notice}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <ResultList
          title="Cumple"
          description="Demostrado en el CV, con la frase que lo acredita."
          accent="border-t-emerald-500"
          icon={<CheckIcon className="h-4 w-4 text-emerald-600" />}
          count={result.met.length}
          empty="Ningún requisito queda acreditado por el CV."
        >
          {result.met.map((item) => (
            <li key={item.requirement} className="text-sm">
              <p className="font-medium text-slate-900">{item.requirement}</p>
              <Quote text={item.evidence} />
            </li>
          ))}
        </ResultList>
        <ResultList
          title="No acreditado o ausente"
          description="La oferta lo pide y el CV no lo menciona."
          accent="border-t-rose-500"
          icon={<CloseIcon className="h-4 w-4 text-rose-600" />}
          count={result.missing.length}
          empty="No falta ningún requisito detectado."
        >
          {result.missing.map((item) => (
            <li key={item.requirement} className="text-sm">
              <p className="font-medium text-slate-900">{item.requirement}</p>
              <p className="text-xs text-slate-500">{item.note}</p>
            </li>
          ))}
        </ResultList>
        <ResultList
          title="Ambiguo"
          description="El CV lo sugiere, pero no lo acredita con claridad."
          accent="border-t-amber-500"
          icon={<AlertIcon className="h-4 w-4 text-amber-600" />}
          count={result.ambiguous.length}
          empty="No hay requisitos ambiguos."
        >
          {result.ambiguous.map((item) => (
            <li key={item.requirement} className="text-sm">
              <p className="font-medium text-slate-900">{item.requirement}</p>
              <p className="text-xs text-slate-500">{item.note}</p>
              {item.evidence && <Quote text={item.evidence} />}
            </li>
          ))}
        </ResultList>
      </div>

      <section
        aria-label="Tecnologías y competencias"
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <h3 className="font-semibold text-slate-900">Tecnologías y competencias relevantes</h3>
        {result.skills.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">No se han identificado tecnologías concretas.</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {result.skills.map((skill) => (
              <li
                key={skill.name}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${SKILL_STYLES[skill.status].chip}`}
              >
                <span aria-hidden="true">{SKILL_STYLES[skill.status].mark}</span>
                {skill.name}
                <span className="sr-only">: {SKILL_STATUS_LABELS[skill.status]}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-slate-500">
          ✓ acreditada en el CV · ? ambigua · ✕ no aparece en el CV
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {[
          { title: 'Para mejorar el CV', items: cvTips },
          { title: 'Para preparar la entrevista', items: interviewTips },
        ].map((group) => (
          <section
            key={group.title}
            aria-label={group.title}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <h3 className="font-semibold text-slate-900">{group.title}</h3>
            {group.items.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">Sin recomendaciones.</p>
            ) : (
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-700">
                {group.items.map((item) => (
                  <li key={item.text}>{item.text}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
