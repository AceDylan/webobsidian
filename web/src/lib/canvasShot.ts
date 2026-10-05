import { useStore } from './store';

/** Pane ⋯ → "Copy screenshot": put a PNG of `canvas` on the clipboard, or download it. */
export async function deliverScreenshot(canvas: HTMLCanvasElement, name: string): Promise<void> {
  try {
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) throw new Error('toBlob failed');
    if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      useStore.getState().notify('Graph screenshot copied');
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
      useStore.getState().notify('Graph screenshot downloaded');
    }
  } catch {
    useStore.getState().notify('Screenshot failed');
  }
}
