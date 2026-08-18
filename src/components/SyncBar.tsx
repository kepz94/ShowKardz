import { useState } from 'react';
import { useStore } from '../lib/store';

// Loaded on demand, so the auth SDK stays out of the first paint.
const signIn = () => import('../lib/firebase').then((m) => m.signIn());
const signOutOfApp = () => import('../lib/firebase').then((m) => m.signOutOfApp());

/**
 * Account and sync state, on every screen.
 *
 * Signed out is a legitimate way to run the app, not a broken state — but it is
 * visibly DIFFERENT from signed in, because a device that silently stopped
 * syncing looks exactly like one that never did, and that is how a day's records
 * get stranded on one phone.
 */
export function SyncBar() {
  const { status, user, syncError } = useStore();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function go(action: () => Promise<void>) {
    setBusy(true);
    setFailure(null);
    try {
      await action();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'That did not work');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`syncbar ${status}`}>
      <span className="dot" aria-hidden />
      <span className="text">
        {status === 'error'
          ? <>Not saved to your account<span className="sub">{syncError}</span></>
          : status === 'synced'
            ? <>Syncing to {user?.email ?? 'your account'}</>
            : <>On this device only<span className="sub">Sign in to reach it from your laptop</span></>}
      </span>
      {status === 'local' ? (
        <button className="link" disabled={busy} onClick={() => void go(signIn)}>
          {busy ? 'Opening…' : 'Sign in'}
        </button>
      ) : (
        <button className="link" disabled={busy} onClick={() => void go(signOutOfApp)}>
          Sign out
        </button>
      )}
      {failure && <span className="fail">{failure}</span>}
    </div>
  );
}
