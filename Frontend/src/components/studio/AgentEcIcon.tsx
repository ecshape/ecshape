import { cn } from '@/lib/utils';

/** Agent EC mark: the ECshape monogram on the brand gradient with an "AI" spark. */
export function AgentEcIcon({ busy = false, size = 'md', className }: { busy?: boolean; size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <span className={cn('ec-agent-icon', `is-${size}`, busy && 'is-busy', className)} aria-hidden>
      <svg viewBox="0 0 32 32" className="ec-agent-icon-mark">
        {/* E and C monogram */}
        <path d="M19.5 9.2a8 8 0 1 0 0 13.6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M11.2 12.2h7.6M11.2 16h6M11.2 19.8h7.6M11.2 12.2v7.6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <svg viewBox="0 0 24 24" className="ec-agent-icon-spark">
        <path d="M12 2l2.1 6.6L21 11l-6.9 2.4L12 20l-2.1-6.6L3 11l6.9-2.4z" />
      </svg>
    </span>
  );
}

export default AgentEcIcon;
