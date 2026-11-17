/**
 * ECshape micro-interactions shared by every portal page.
 * - Buttons (.ec-btn): the hover fill grows from the point where the cursor entered.
 * Installed once from main.tsx via event delegation, so it covers buttons rendered at any time.
 */
export function installEcMotion(): void {
  if (typeof window === 'undefined') return;

  const setOrigin = (e: PointerEvent) => {
    const target = (e.target as HTMLElement | null)?.closest?.('.ec-btn') as HTMLElement | null;
    if (!target) return;
    const r = target.getBoundingClientRect();
    target.style.setProperty('--x', `${e.clientX - r.left}px`);
    target.style.setProperty('--y', `${e.clientY - r.top}px`);
  };

  document.addEventListener('pointerover', setOrigin, { passive: true });
  document.addEventListener('pointerout', setOrigin, { passive: true });
}
