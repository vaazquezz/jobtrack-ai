import type { AnalysisResult, SkillStatus } from '../types/application'

export const SKILL_STATUS_LABELS: Record<SkillStatus, string> = {
  demonstrated: 'Acreditada',
  missing: 'No aparece',
  ambiguous: 'Ambigua',
}

export function providerLabel(result: Pick<AnalysisResult, 'mode' | 'provider' | 'model'>) {
  if (result.mode === 'local') return 'Análisis básico sin IA (palabras clave)'
  const provider = result.provider === 'anthropic' ? 'Anthropic' : result.provider
  return `Análisis con IA · ${provider}${result.model ? ` · ${result.model}` : ''}`
}

/** Plain-text version of the analysis, for copying to the clipboard. */
export function analysisToText(result: AnalysisResult): string {
  const lines: string[] = ['Análisis de compatibilidad — JobTrack AI', providerLabel(result), '']
  if (result.score !== null) {
    lines.push(`Puntuación orientativa: ${result.score}/100 (no es una probabilidad de contratación)`)
  }
  lines.push('', 'Resumen', result.summary)

  const section = (title: string, items: string[]) => {
    lines.push('', `${title} (${items.length})`)
    if (items.length === 0) lines.push('- Ninguno')
    for (const item of items) lines.push(`- ${item}`)
  }
  section(
    'Cumple (según el CV)',
    result.met.map((m) => `${m.requirement}. Evidencia: «${m.evidence}»`),
  )
  section(
    'No acreditado o ausente',
    result.missing.map((m) => `${m.requirement}. ${m.note}`),
  )
  section(
    'Ambiguo',
    result.ambiguous.map(
      (a) => `${a.requirement}. ${a.note}${a.evidence ? ` (CV: «${a.evidence}»)` : ''}`,
    ),
  )
  section(
    'Tecnologías y competencias',
    result.skills.map((s) => `${s.name}: ${SKILL_STATUS_LABELS[s.status]}`),
  )
  section(
    'Recomendaciones para el CV',
    result.recommendations.filter((r) => r.kind === 'cv').map((r) => r.text),
  )
  section(
    'Preparación de la entrevista',
    result.recommendations.filter((r) => r.kind === 'interview').map((r) => r.text),
  )
  if (result.notices.length) section('Avisos', result.notices)
  return lines.join('\n')
}
