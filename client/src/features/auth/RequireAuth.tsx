import { Navigate, useLocation } from 'react-router-dom';
import { useAppSelector } from '@/app/hooks';
import { hasAnyPermission, hasPermission } from './authSlice';

export function RequireAuth({ children }: { children: JSX.Element }): JSX.Element {
  const token = useAppSelector((s) => s.auth.accessToken);
  const user = useAppSelector((s) => s.auth.user);
  const loc = useLocation();
  if (!token) return <Navigate to="/admin/login" replace state={{ from: loc }} />;
  // Force the password change flow before anything else.
  if (user?.mustChangePassword && loc.pathname !== '/admin/change-password') {
    return <Navigate to="/admin/change-password" replace />;
  }
  return children;
}

/**
 * Wrap a route or component to require a specific permission. Falls back to
 * a "Forbidden" panel that points the user to whoever can grant access.
 */
export function RequirePermission({
  permission,
  any,
  children,
  fallback,
}: {
  permission?: string;
  any?: readonly string[];
  children: JSX.Element;
  fallback?: JSX.Element;
}): JSX.Element {
  const user = useAppSelector((s) => s.auth.user);
  const allowed = permission ? hasPermission(user, permission) : any ? hasAnyPermission(user, any) : true;
  if (allowed) return children;
  return fallback ?? <ForbiddenPanel missing={permission ?? any?.[0] ?? 'this action'} />;
}

function ForbiddenPanel({ missing }: { missing: string }): JSX.Element {
  return (
    <div className="flex flex-col items-start justify-center h-[60vh] max-w-md mx-auto gap-3 px-6">
      <p className="text-eyebrow uppercase text-ink-500">Access denied</p>
      <h2 className="font-display text-display-sm text-ink-900">You don't have permission to view this.</h2>
      <p className="text-sm text-ink-500">
        Your role is missing <code className="text-ink-700">{missing}</code>. Ask your super admin to grant it
        from <span className="font-medium text-ink-700">Settings &rarr; Team & Roles</span>.
      </p>
    </div>
  );
}
