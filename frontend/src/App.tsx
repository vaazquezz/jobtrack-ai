import { ApiStatus } from './components/ApiStatus'

const roadmap = [
  { title: 'Candidaturas', description: 'Registra empresa, puesto, enlace, fecha, estado y notas.' },
  { title: 'Tablero Kanban', description: 'Visualiza y mueve tus candidaturas entre estados.' },
  { title: 'Dashboard', description: 'Estadísticas de solicitudes, entrevistas y respuestas.' },
  { title: 'Seguimiento', description: 'Búsqueda, filtros y recordatorios de seguimiento.' },
]

function App() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <img src="/favicon.svg" alt="" className="h-8 w-8" />
            <span className="text-lg font-semibold tracking-tight">JobTrack AI</span>
          </div>
          <ApiStatus />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
        <section className="max-w-2xl">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Organiza tu búsqueda de empleo
          </h1>
          <p className="mt-4 text-base text-slate-600 sm:text-lg">
            Esqueleto inicial del proyecto. Las funcionalidades se irán añadiendo por fases.
          </p>
        </section>

        <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {roadmap.map((item) => (
            <article
              key={item.title}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <span className="text-xs font-medium uppercase tracking-wide text-indigo-600">
                Próximamente
              </span>
              <h2 className="mt-2 font-semibold">{item.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{item.description}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  )
}

export default App
