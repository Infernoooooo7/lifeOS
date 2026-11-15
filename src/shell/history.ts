import { redo, undo } from '@/core/data/undo';
import { toast } from '@/ui/overlays';

/** Undo / redo with a toast that names what changed and offers the way back. */
export async function undoWithToast(): Promise<void> {
  const label = await undo();
  toast(label ? `Undone: ${label}` : 'Nothing to undo', label ? { icon: 'refresh', action: { label: 'Redo', run: () => void redoWithToast() } } : {});
}
export async function redoWithToast(): Promise<void> {
  const label = await redo();
  toast(label ? `Redone: ${label}` : 'Nothing to redo', label ? { icon: 'refresh', action: { label: 'Undo', run: () => void undoWithToast() } } : {});
}
