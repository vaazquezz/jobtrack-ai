import { ApiStatus } from './components/ApiStatus'
import { ApplicationsPage } from './components/ApplicationsPage'

function App() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <img src="/favicon.svg" alt="" className="h-8 w-8" />
            <span className="text-lg font-semibold tracking-tight">JobTrack AI</span>
          </div>
          <ApiStatus />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <ApplicationsPage />
      </main>
    </div>
  )
}

export default App
