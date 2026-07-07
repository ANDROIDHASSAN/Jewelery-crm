// Manage expense ledgers (heads). Add, rename, re-classify (Revenue vs
// Capital), and archive/delete the ledgers that feed the Record-expense form,
// the Expenses filters, and the General Ledger drill-down.

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useGetExpenseCategoriesQuery,
  useCreateExpenseCategoryMutation,
  useUpdateExpenseCategoryMutation,
  useDeleteExpenseCategoryMutation,
} from '@/features/finance/financeApi';

type Classification = 'REVENUE' | 'CAPITAL';

function errMessage(err: unknown, fallback: string): string {
  return (
    (err as { data?: { error?: { message?: string } } }).data?.error?.message ?? fallback
  );
}

export function ManageLedgersDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): JSX.Element {
  const { data: ledgersRes, isLoading } = useGetExpenseCategoriesQuery(undefined, { skip: !open });
  const [createCategory, { isLoading: creating }] = useCreateExpenseCategoryMutation();
  const [updateCategory] = useUpdateExpenseCategoryMutation();
  const [deleteCategory] = useDeleteExpenseCategoryMutation();

  const ledgers = ledgersRes?.data ?? [];

  const [newName, setNewName] = useState('');
  const [newClass, setNewClass] = useState<Classification>('REVENUE');

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editClass, setEditClass] = useState<Classification>('REVENUE');

  async function handleAdd(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const name = newName.trim();
    if (!name) {
      toast.error('Enter a ledger name');
      return;
    }
    try {
      await createCategory({ name, classification: newClass }).unwrap();
      toast.success('Ledger added');
      setNewName('');
      setNewClass('REVENUE');
    } catch (err) {
      toast.error(errMessage(err, 'Could not add ledger'));
    }
  }

  function startEdit(id: string, name: string, classification: Classification): void {
    setEditId(id);
    setEditName(name);
    setEditClass(classification);
  }

  async function saveEdit(): Promise<void> {
    if (!editId) return;
    const name = editName.trim();
    if (!name) {
      toast.error('Ledger name cannot be empty');
      return;
    }
    try {
      await updateCategory({ id: editId, body: { name, classification: editClass } }).unwrap();
      toast.success('Ledger updated');
      setEditId(null);
    } catch (err) {
      toast.error(errMessage(err, 'Could not update ledger'));
    }
  }

  async function handleDelete(id: string, name: string): Promise<void> {
    if (!confirm(`Remove the "${name}" ledger? Past expenses keep this label.`)) return;
    try {
      await deleteCategory(id).unwrap();
      toast.success('Ledger removed');
    } catch (err) {
      toast.error(errMessage(err, 'Could not remove ledger'));
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-ink-900/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[60] -translate-x-1/2 -translate-y-1/2 w-[94vw] max-w-lg bg-ink-0 rounded-lg shadow-xl border border-ink-100 max-h-[90vh] overflow-y-auto">
          <div className="p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <Dialog.Title className="font-display text-[22px] text-ink-900">
                  Manage ledgers
                </Dialog.Title>
                <p className="text-xs text-ink-500 mt-0.5">
                  Expense heads and their default classification. Capital heads feed the balance
                  sheet; revenue heads hit P&amp;L.
                </p>
              </div>
              <Dialog.Close className="text-ink-500 hover:text-ink-900 p-1" aria-label="Close">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>

            <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2">
              <label className="block text-sm flex-1 min-w-[160px]">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">New ledger</span>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Packaging"
                  maxLength={60}
                />
              </label>
              <label className="block text-sm">
                <span className="text-[11px] uppercase tracking-wider text-ink-500">Type</span>
                <select
                  value={newClass}
                  onChange={(e) => setNewClass(e.target.value as Classification)}
                  className="mt-1 w-full h-10 px-3 rounded-md border border-ink-200 text-sm"
                >
                  <option value="REVENUE">Revenue</option>
                  <option value="CAPITAL">Capital</option>
                </select>
              </label>
              <Button type="submit" disabled={creating}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            </form>

            <div className="rounded-md border border-ink-100 divide-y divide-ink-100">
              {isLoading && <p className="px-4 py-3 text-sm text-ink-500">Loading…</p>}
              {!isLoading && ledgers.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-ink-500">No ledgers yet.</p>
              )}
              {ledgers.map((l) =>
                editId === l.id ? (
                  <div key={l.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      maxLength={60}
                      className="flex-1 min-w-[140px]"
                    />
                    <select
                      value={editClass}
                      onChange={(e) => setEditClass(e.target.value as Classification)}
                      className="h-9 px-2 rounded-md border border-ink-200 text-sm"
                    >
                      <option value="REVENUE">Revenue</option>
                      <option value="CAPITAL">Capital</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => void saveEdit()}
                      className="text-brand-700 hover:text-brand-800 p-1"
                      aria-label="Save"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditId(null)}
                      className="text-ink-400 hover:text-ink-700 p-1"
                      aria-label="Cancel"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div key={l.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="flex-1 text-sm font-medium text-ink-900">{l.name}</span>
                    <span
                      className={
                        l.classification === 'CAPITAL'
                          ? 'inline-block rounded-sm bg-brand-50 px-1.5 py-0.5 text-[11px] text-brand-700 font-medium'
                          : 'inline-block rounded-sm bg-ink-50 px-1.5 py-0.5 text-[11px] text-ink-600'
                      }
                    >
                      {l.classification}
                    </span>
                    {l.isSystem && (
                      <span className="text-[10px] uppercase tracking-wider text-ink-400">
                        built-in
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => startEdit(l.id, l.name, l.classification)}
                      className="text-ink-400 hover:text-ink-700 p-1"
                      aria-label="Edit ledger"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(l.id, l.name)}
                      className="text-ink-400 hover:text-danger-700 p-1"
                      aria-label="Remove ledger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ),
              )}
            </div>

            <div className="flex justify-end pt-1">
              <Button type="button" variant="outline" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
