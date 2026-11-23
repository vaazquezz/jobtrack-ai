import { describe, expect, it } from 'vitest'
import type { AnalysisResult } from '../types/application'
import { analysisToText, providerLabel } from './analysis'

const result: AnalysisResult = {
  mode: 'ai',
  provider: 'anthropic',
  model: 'claude-opus-5-5',
  summary: 'Encaje parcial.',
  met: [{ requirement: 'Python', evidence: 'Experiencia con Python' }],
  missing: [{ requirement: 'AWS', note: 'No aparece.' }],
  ambiguous: [{ requirement: 'Kubernetes', evidence: 'Docker', note: 'Solo Docker.' }],
  skills: [
    { name: 'Python', status: 'demonstrated' },
    { name: 'AWS', status: 'missing' },
  ],
  recommendations: [
    { kind: 'cv', text: 'Aclara tu nivel de Docker.' },
    { kind: 'interview', text: 'Prepara un ejemplo con Python.' },
  ],
  score: 50,
  score_explanation: '...',
  notices: ['Análisis generado por un modelo de IA.'],
}

describe('providerLabel', () => {
  it('describes each mode', () => {
    expect(providerLabel(result)).toBe('Análisis con IA · Anthropic · claude-opus-5-5')
    expect(providerLabel({ mode: 'local', provider: 'local-keywords', model: null })).toBe(
      'Análisis básico sin IA (palabras clave)',
    )
  })
})

describe('analysisToText', () => {
  it('includes every section with the evidence and the score caveat', () => {
    const text = analysisToText(result)

    expect(text).toContain('Puntuación orientativa: 50/100 (no es una probabilidad de contratación)')
    expect(text).toContain('Cumple (según el CV) (1)\n- Python. Evidencia: «Experiencia con Python»')
    expect(text).toContain('No acreditado o ausente (1)\n- AWS. No aparece.')
    expect(text).toContain('- Kubernetes. Solo Docker. (CV: «Docker»)')
    expect(text).toContain('- Python: Acreditada')
    expect(text).toContain('Recomendaciones para el CV (1)\n- Aclara tu nivel de Docker.')
    expect(text).toContain('Preparación de la entrevista (1)\n- Prepara un ejemplo con Python.')
  })

  it('marks empty sections and omits the score when there is none', () => {
    const text = analysisToText({ ...result, met: [], score: null })

    expect(text).toContain('Cumple (según el CV) (0)\n- Ninguno')
    expect(text).not.toContain('Puntuación orientativa')
  })
})
