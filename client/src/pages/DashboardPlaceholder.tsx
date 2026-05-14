// Empty admin shell placeholder. Day 5 replaces this with the full Linear-grade shell + ShopSwitcher.

export function DashboardPlaceholder(): JSX.Element {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md text-center space-y-3">
        <p className="text-eyebrow uppercase text-ink-500">Welcome to Zelora</p>
        <h1 className="font-display text-display-md text-ink-900">You&apos;re signed in.</h1>
        <p className="text-sm text-ink-500">
          The admin shell ships on Day 5 — sidebar, top bar, shop switcher, command palette. Until then, this is your
          marker that auth works end-to-end.
        </p>
      </div>
    </div>
  );
}
