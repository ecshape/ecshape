import { cn } from '@/lib/utils';
import { EcMark } from '@/components/brand/EcMark';

/** Agent EC mark: the ECshape initials ring (from the logo) on the brand gradient, with an AI spark. */
export function AgentEcIcon({ busy = false, size = 'md', className }: { busy?: boolean; size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <span className={cn('ec-agent-icon', `is-${size}`, busy && 'is-busy', className)} aria-hidden>
      <EcMark mono className="ec-agent-icon-mark" title="Agent EC" />
      <svg viewBox="0 0 24 24" className="ec-agent-icon-spark">
        <path d="M12 2l2.1 6.6L21 11l-6.9 2.4L12 20l-2.1-6.6L3 11l6.9-2.4z" />
      </svg>
    </span>
  );
}

export default AgentEcIcon;
