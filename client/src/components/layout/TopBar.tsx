import { Search, Bell } from 'lucide-react';
import { ShopSwitcher } from './ShopSwitcher';
import { Button } from '@/components/ui/button';

interface TopBarProps {
  onOpenCmdK: () => void;
}

export function TopBar({ onOpenCmdK }: TopBarProps): JSX.Element {
  return (
    <header className="h-14 sticky top-0 z-30 bg-ink-0/85 backdrop-blur border-b border-ink-100 flex items-center px-4 lg:px-6 gap-3">
      <ShopSwitcher />
      <div className="flex-1 flex justify-center">
        <button
          onClick={onOpenCmdK}
          className="hidden md:flex items-center gap-2 w-full max-w-md h-9 px-3 rounded-md border border-ink-200 bg-ink-25 text-sm text-ink-500 hover:bg-ink-50 transition-colors duration-fast"
          aria-label="Open command palette"
        >
          <Search className="h-4 w-4" />
          <span>Search or jump to…</span>
          <kbd className="ml-auto font-mono text-xs text-ink-400 border border-ink-200 rounded px-1.5 py-0.5">⌘K</kbd>
        </button>
      </div>
      <Button variant="ghost" size="sm" aria-label="Notifications">
        <Bell className="h-4 w-4" />
      </Button>
      <div className="h-8 w-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-medium">
        AK
      </div>
    </header>
  );
}
