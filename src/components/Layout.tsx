import { Link, Outlet } from "react-router-dom";
import { useAuth } from "./useAuth";

function Wordmark() {
  return (
    <Link to="/" className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight text-ink">
      <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="13" cy="16" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <circle cx="19" cy="16" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" />
      </svg>
      Overlap
    </Link>
  );
}

export default function Layout() {
  const { session } = useAuth();
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-paper focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="border-b border-paper-line bg-paper">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Wordmark />
          <nav aria-label="Primary" className="text-[15px]">
            <Link to={session ? "/organizer/polls" : "/organizer"} className="text-ink-soft hover:text-ink">
              {session ? "My polls" : "Organizer sign in"}
            </Link>
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-5 py-8 sm:py-12">
        <Outlet />
      </main>
      <footer className="border-t border-paper-line">
        <div className="mx-auto flex max-w-5xl flex-wrap gap-x-6 gap-y-2 px-5 py-6 text-[15px] text-ink-mute">
          <Link to="/privacy" className="hover:text-ink">Privacy</Link>
          <span>Overlap is an open-source scheduling tool.</span>
        </div>
      </footer>
    </div>
  );
}
