import { useEffect, useId, useState, type FormEvent } from 'react'
import { analyzeOffer, getAnalysisConfig } from '../api/analysis'
import type { AnalysisConfig, AnalysisMode, AnalysisResult } from '../types/application'
import { AnalysisResultView } from './AnalysisResultView'
import { Modal } from './Modal'
import { AlertIcon, Button, ShieldIcon, SparklesIcon } from './ui'

const DEFAULT_CONFIG: AnalysisConfig = {
  ai_available: false,
  provider: null,
  model: null,
  min_chars: 30,
  max_chars: 20000,
}

const textareaClass =
  'block min-h-56 w-full resize-y rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 aria-[invalid=true]:ring-rose-400 sm:min-h-72'

function providerName(config: AnalysisConfig) {
  return config.provider === 'anthropic' ? 'Anthropic' : (config.provider ?? 'el proveedor de IA')
}

interface TextFieldProps {
  id: string
  label: string
  hint: string
  value: string
  max: number
  error?: string
  placeholder: string
  onChange: (value: string) => void
}

function TextField({ id, label, hint, value, max, error, placeholder, onChange }: TextFieldProps) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-slate-700">
          {label}
        </label>
        <span className="text-xs text-slate-400 tabular-nums">
          {value.length.toLocaleString('es-ES')}/{max.toLocaleString('es-ES')}
        </span>
      </div>
      <textarea
        id={id}
        value={value}
        maxLength={max}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={textareaClass}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : `${id}-hint`}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-rose-600">
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-500">
          {hint}
        </p>
      )}
    </div>
  )
}

export function AnalysisView() {
  const id = useId()
  const [config, setConfig] = useState<AnalysisConfig>(DEFAULT_CONFIG)
  const [cvText, setCvText] = useState('')
  const [jobText, setJobText] = useState('')
  const [mode, setMode] = useState<AnalysisMode>('local')
  const [errors, setErrors] = useState<{ cv?: string; job?: string }>({})
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [result, setResult] = useState<AnalysisResult | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    getAnalysisConfig(controller.signal)
      .then(setConfig)
      .catch(() => {
        // Without the config the local analysis still works.
      })
    return () => controller.abort()
  }, [])

  const aiMode = mode === 'ai' && config.ai_available

  const validate = () => {
    const next: { cv?: string; job?: string } = {}
    const min = config.min_chars
    if (cvText.trim().length < min) next.cv = `Pega el texto de tu CV (mínimo ${min} caracteres).`
    if (jobText.trim().length < min)
      next.job = `Pega la descripción de la oferta (mínimo ${min} caracteres).`
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const run = async (consent: boolean) => {
    setConfirming(false)
    setLoading(true)
    setRequestError(null)
    try {
      const data = await analyzeOffer({
        cv_text: cvText,
        job_text: jobText,
        mode: aiMode ? 'ai' : 'local',
        consent_external: aiMode && consent,
      })
      setResult(data)
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'No se pudo analizar la oferta.')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!validate()) return
    // Sending texts to an external provider always needs explicit confirmation.
    if (aiMode) setConfirming(true)
    else void run(false)
  }

  const clear = () => {
    setCvText('')
    setJobText('')
    setErrors({})
    setResult(null)
    setRequestError(null)
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <p className="flex items-start gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
          <ShieldIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          JobTrack AI no guarda el CV ni la oferta: se analizan y se descartan. No incluyas datos
          que no quieras compartir. El análisis no inventa experiencia; solo usa lo que está en
          tu CV.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            id={`${id}-cv`}
            label="Texto del CV"
            hint="Copia y pega el contenido de tu CV como texto."
            value={cvText}
            max={config.max_chars}
            error={errors.cv}
            placeholder="Experiencia, formación, tecnologías, idiomas…"
            onChange={(value) => {
              setCvText(value)
              if (errors.cv) setErrors((e) => ({ ...e, cv: undefined }))
            }}
          />
          <TextField
            id={`${id}-job`}
            label="Oferta de empleo"
            hint="Pega la descripción completa del puesto y sus requisitos."
            value={jobText}
            max={config.max_chars}
            error={errors.job}
            placeholder="Responsabilidades, requisitos, valorables…"
            onChange={(value) => {
              setJobText(value)
              if (errors.job) setErrors((e) => ({ ...e, job: undefined }))
            }}
          />
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">Tipo de análisis</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${
                mode === 'local' ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200 bg-white'
              }`}
            >
              <input
                type="radio"
                name={`${id}-mode`}
                value="local"
                checked={mode === 'local'}
                onChange={() => setMode('local')}
                className="mt-0.5 text-indigo-600 focus:ring-indigo-600"
              />
              <span>
                <span className="block font-medium text-slate-900">Básico, sin IA</span>
                <span className="text-xs text-slate-500">
                  Compara palabras clave y tecnologías. Los textos no salen del servidor.
                </span>
              </span>
            </label>
            <label
              className={`flex items-start gap-3 rounded-lg border p-3 text-sm transition ${
                !config.ai_available
                  ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-70'
                  : mode === 'ai'
                    ? 'cursor-pointer border-indigo-500 bg-indigo-50/50'
                    : 'cursor-pointer border-slate-200 bg-white'
              }`}
            >
              <input
                type="radio"
                name={`${id}-mode`}
                value="ai"
                checked={aiMode}
                disabled={!config.ai_available}
                onChange={() => setMode('ai')}
                className="mt-0.5 text-indigo-600 focus:ring-indigo-600"
              />
              <span>
                <span className="flex items-center gap-1.5 font-medium text-slate-900">
                  <SparklesIcon className="h-3.5 w-3.5 text-indigo-600" />
                  Con IA{config.ai_available ? ` · ${providerName(config)}` : ''}
                </span>
                <span className="text-xs text-slate-500">
                  {config.ai_available
                    ? `Envía los textos a ${providerName(config)} (${config.model}). Te pediremos confirmación.`
                    : 'No disponible: el servidor no tiene una clave de API configurada (ANTHROPIC_API_KEY).'}
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        {requestError && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
          >
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            {requestError}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={clear} disabled={loading}>
            Limpiar
          </Button>
          <Button type="submit" loading={loading}>
            {aiMode && <SparklesIcon />}
            Analizar oferta
          </Button>
        </div>
      </form>

      {result && !loading && <AnalysisResultView result={result} />}

      {confirming && (
        <Modal
          title={`¿Enviar los textos a ${providerName(config)}?`}
          onClose={() => setConfirming(false)}
          size="sm"
        >
          <div className="space-y-3 text-sm text-slate-600">
            <p>
              Para el análisis con IA se enviará el <strong>texto completo de tu CV y de la oferta</strong>{' '}
              a {providerName(config)} (modelo {config.model}), un servicio externo.
            </p>
            <p>
              Revisa que no incluyan datos que no quieras compartir, como teléfono, dirección o
              documento de identidad. JobTrack AI no guarda los textos.
            </p>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void run(true)}>Enviar y analizar</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
