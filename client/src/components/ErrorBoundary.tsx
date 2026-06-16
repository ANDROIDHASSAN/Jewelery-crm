import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /**
   * When this value changes, the boundary resets and re-renders its children.
   * Pass the current route path so navigating away from a crashed page clears
   * the error without a full reload.
   */
  resetKey?: string;
  /** Optional label shown in the fallback ("Stock & inventory" couldn't load). */
  area?: string;
}

interface State {
  error: Error | null;
}

/**
 * Catches render/lifecycle errors in its subtree and shows a contained,
 * recoverable fallback instead of letting one broken component white-screen
 * the entire app (React unmounts the whole tree on an uncaught error).
 *
 * Before this existed, a single bad component — e.g. a Rules-of-Hooks
 * violation — replaced the whole page with a bare "Unexpected Application
 * Error". Now the surrounding chrome (sidebar/topbar) stays put, the user can
 * navigate elsewhere to recover, and the actual error message is shown so the
 * fault is identifiable rather than a mystery minified stack.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidUpdate(prev: Props): void {
    // Reset on navigation so a crashed route doesn't trap the user.
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface to the console for support/debugging. A remote logger (Sentry
    // etc.) would hook in here.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] Uncaught render error:', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-xl border border-ink-200 bg-ink-0 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink-900">
            {this.props.area ? `${this.props.area} couldn't load` : 'Something went wrong'}
          </h2>
          <p className="mt-1.5 text-sm text-ink-600">
            This part of the app hit an unexpected error. Your data is safe — try again, or move to
            another section from the menu.
          </p>
          <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-ink-50 px-3 py-2 text-xs text-ink-700 whitespace-pre-wrap break-words">
            {error.message || String(error)}
          </pre>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="inline-flex h-9 items-center rounded-md border border-ink-300 px-3 text-sm text-ink-800 hover:bg-ink-50"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-9 items-center rounded-md bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
