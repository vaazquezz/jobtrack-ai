import type { AnalysisConfig, AnalysisRequest, AnalysisResult } from '../types/application'
import { apiRequest } from './client'

export function getAnalysisConfig(signal?: AbortSignal): Promise<AnalysisConfig> {
  return apiRequest<AnalysisConfig>('/api/analysis/config', { signal })
}

/** Texts are sent to the backend only; they are never stored by JobTrack AI. */
export function analyzeOffer(request: AnalysisRequest): Promise<AnalysisResult> {
  return apiRequest<AnalysisResult>('/api/analysis', {
    method: 'POST',
    body: JSON.stringify(request),
  })
}
