// Empty states are CONTENT, never illustrations. Per specs/design-references.md.

import type { ReactNode } from 'react';

export function EmptyState({
  eyebrow,
  title,
  body,
  action,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  action?: ReactNode;
}): JSX.Element {
  return (
    <div className="rounded-md border border-dashed border-ink-200 bg-ink-25 px-6 py-12 text-center">
      <div className="mx-auto max-w-md space-y-3">
        {eyebrow && <p className="text-eyebrow uppercase text-ink-500">{eyebrow}</p>}
        <h2 className="font-display text-display-sm text-ink-900">{title}</h2>
        {body && <p className="text-sm text-ink-500">{body}</p>}
        {action && <div className="pt-2">{action}</div>}
      </div>
    </div>
  );
}
