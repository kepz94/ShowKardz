import type { Route } from '../App';

export function Back({ go, label = 'Back' }: { go: (r: Route) => void; label?: string }) {
  return (
    <button className="back" onClick={() => go('home')}>
      ← {label}
    </button>
  );
}
