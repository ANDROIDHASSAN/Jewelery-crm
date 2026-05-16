// First-login forced password change. Also accessible from Settings later.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { setUser } from './authSlice';
import { useChangePasswordMutation } from './authApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ChangePasswordPage(): JSX.Element {
  const user = useAppSelector((s) => s.auth.user);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submit, { isLoading }] = useChangePasswordMutation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (next.length < 10) {
      toast.error('Password must be at least 10 characters.');
      return;
    }
    if (next !== confirm) {
      toast.error('Passwords do not match.');
      return;
    }
    try {
      await submit({ currentPassword: current, newPassword: next, confirmPassword: confirm }).unwrap();
      if (user) dispatch(setUser({ ...user, mustChangePassword: false }));
      toast.success('Password updated.');
      navigate('/admin', { replace: true });
    } catch (err: unknown) {
      const e = err as { data?: { error?: { message?: string } } };
      toast.error(e.data?.error?.message ?? 'Failed to change password');
    }
  }

  return (
    <div className="min-h-screen bg-ink-25 flex items-center justify-center px-4 sm:px-6 py-10 sm:py-16">
      <div className="w-full max-w-md space-y-6 sm:space-y-8">
        <header className="space-y-2">
          <p className="text-eyebrow uppercase text-ink-500">First sign-in</p>
          <h2 className="font-display text-xl sm:text-display-sm text-ink-900">Set your password.</h2>
          <p className="text-sm text-ink-500">
            Your super admin gave you a temporary password. Set a new one to continue. Minimum 10 characters,
            mix of upper/lower-case + a digit.
          </p>
        </header>
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="current">Current password</Label>
            <Input id="current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="next">New password</Label>
            <Input id="next" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm new password</Label>
            <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
            {isLoading ? 'Updating…' : 'Set new password'}
          </Button>
        </form>
      </div>
    </div>
  );
}
