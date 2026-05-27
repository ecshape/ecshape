import * as React from "react"

/**
 * Hook to detect if an element's children are overflowing when in row layout
 * @param ref - React ref to the element to monitor
 * @returns boolean indicating if the element is overflowing
 */
export function useOverflow(ref: React.RefObject<HTMLElement>) {
  const [isOverflowing, setIsOverflowing] = React.useState(false);

  React.useEffect(() => {
    if (!ref.current) return;

    const checkOverflow = () => {
      if (!ref.current) return;
      
      // Get computed style to check current flex direction
      const computedStyle = window.getComputedStyle(ref.current);
      const flexDirection = computedStyle.flexDirection;
      
      // Only check overflow when in row mode (or if not set, assume row)
      if (flexDirection === 'column') {
        setIsOverflowing(false);
        return;
      }
      
      // Check if content width exceeds container width
      // Add a small threshold (1px) to account for rounding and borders
      const hasOverflow = ref.current.scrollWidth > ref.current.clientWidth + 1;
      setIsOverflowing(hasOverflow);
    };

    // Initial check with a small delay to ensure layout is complete
    const timeoutId = setTimeout(checkOverflow, 10);

    // Use ResizeObserver to watch for size changes
    const resizeObserver = new ResizeObserver(() => {
      // Small delay to ensure layout is complete after resize
      setTimeout(checkOverflow, 10);
    });
    resizeObserver.observe(ref.current);

    // Also listen to window resize for cases where container size changes
    window.addEventListener('resize', checkOverflow);

    return () => {
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', checkOverflow);
    };
  }, [ref]);

  return isOverflowing;
}

