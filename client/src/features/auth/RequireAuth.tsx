import { Navigate, useLocation } from 'react-router-dom';
import { useAppSelector } from '@/app/hooks';

export function RequireAuth({ children }: { children: JSX.Element }): JSX.Element {
  const token = useAppSelector((s) => s.auth.accessToken);
  const loc = useLocation();
  if (!token) return <Navigate to="/admin/login" replace state={{ from: loc }} />;
  return children;
}
