import * as Dialog from '@radix-ui/react-dialog';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ArrowRight, Plus, ScanLine, Users, Boxes } from 'lucide-react';
import { cn } from '@/lib/cn';

interface Action {
  id: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  go: string;
}

const actions: Action[] = [
  { id: 'pos', label: 'New bill', hint: 'Open POS', icon: Plus, go: '/pos' },
  { id: 'item', label: 'Add inventory item', icon: Boxes, go: '/admin/inventory?new=1' },
  { id: 'customer', label: 'Add customer', icon: Users, go: '/admin/crm?new=customer' },
  { id: 'scan', label: 'Scan barcode', icon: ScanLine, go: '/pos?scan=1' },
];

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }): JSX.Element {
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  // ⌘K / Ctrl+K toggle
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const filtered = actions.filter((a) => a.label.toLowerCase().includes(q.toLowerCase()));

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/30 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-[20%] z-50 -translate-x-1/2 w-full max-w-lg rounded-lg border border-ink-100 bg-ink-0 shadow-lg data-[state=open]:animate-in data-[state=open]:zoom-in-95">
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type a command or search…"
            className="w-full h-12 px-4 bg-transparent text-sm placeholder:text-ink-400 border-b border-ink-100 outline-none"
          />
          <ul className="max-h-80 overflow-y-auto py-1">
            {filtered.map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => {
                    onOpenChange(false);
                    navigate(a.go);
                  }}
                  className={cn(
                    'flex items-center gap-3 w-full px-3 py-2 text-sm text-ink-700 hover:bg-ink-50 hover:text-ink-900 transition-colors duration-fast',
                  )}
                >
                  <a.icon className="h-4 w-4 text-ink-500" aria-hidden />
                  <span className="flex-1 text-left">{a.label}</span>
                  {a.hint && <span className="text-xs text-ink-400">{a.hint}</span>}
                  <ArrowRight className="h-3.5 w-3.5 text-ink-400" />
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-6 text-center text-xs text-ink-400">No matches.</li>
            )}
          </ul>
          <div className="px-3 py-2 border-t border-ink-100 text-xs text-ink-400 flex items-center justify-between">
            <span>↑↓ to navigate</span>
            <span>Esc to close</span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
