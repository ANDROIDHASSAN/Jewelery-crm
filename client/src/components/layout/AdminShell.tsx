import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { CommandPalette } from './CommandPalette';

export function AdminShell(): JSX.Element {
  const [cmdOpen, setCmdOpen] = useState(false);
  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar onOpenCmdK={() => setCmdOpen(true)} />
        <main className="flex-1 px-4 lg:px-6 py-6">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
    </div>
  );
}
