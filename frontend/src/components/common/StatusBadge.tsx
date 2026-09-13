import clsx from 'clsx';

type BadgeSize = 'sm' | 'md';

interface StatusBadgeProps {
  status: string;
  size?: BadgeSize;
}

type ColorScheme = {
  bg: string;
  text: string;
  dot: string;
};

const statusColorMap: Record<string, ColorScheme> = {
  // Green
  verified: { bg: 'bg-green-500/15', text: 'text-green-400', dot: 'bg-green-400' },
  active: { bg: 'bg-green-500/15', text: 'text-green-400', dot: 'bg-green-400' },
  approved: { bg: 'bg-green-500/15', text: 'text-green-400', dot: 'bg-green-400' },
  completed: { bg: 'bg-green-500/15', text: 'text-green-400', dot: 'bg-green-400' },
  resolved: { bg: 'bg-green-500/15', text: 'text-green-400', dot: 'bg-green-400' },

  // Yellow
  pending: { bg: 'bg-yellow-500/15', text: 'text-yellow-400', dot: 'bg-yellow-400' },
  upcoming: { bg: 'bg-yellow-500/15', text: 'text-yellow-400', dot: 'bg-yellow-400' },
  investigating: { bg: 'bg-yellow-500/15', text: 'text-yellow-400', dot: 'bg-yellow-400' },

  // Red
  rejected: { bg: 'bg-red-500/15', text: 'text-red-400', dot: 'bg-red-400' },
  inactive: { bg: 'bg-red-500/15', text: 'text-red-400', dot: 'bg-red-400' },
  cancelled: { bg: 'bg-red-500/15', text: 'text-red-400', dot: 'bg-red-400' },
  dismissed: { bg: 'bg-red-500/15', text: 'text-red-400', dot: 'bg-red-400' },

  // Orange
  flagged: { bg: 'bg-orange-500/15', text: 'text-orange-400', dot: 'bg-orange-400' },
  escalated: { bg: 'bg-orange-500/15', text: 'text-orange-400', dot: 'bg-orange-400' },
  critical: { bg: 'bg-orange-500/15', text: 'text-orange-400', dot: 'bg-orange-400' },

  // Purple
  disputed: { bg: 'bg-purple-500/15', text: 'text-purple-400', dot: 'bg-purple-400' },
  suspended: { bg: 'bg-purple-500/15', text: 'text-purple-400', dot: 'bg-purple-400' },

  // Blue
  open: { bg: 'bg-blue-500/15', text: 'text-blue-400', dot: 'bg-blue-400' },
  ongoing: { bg: 'bg-blue-500/15', text: 'text-blue-400', dot: 'bg-blue-400' },
};

const defaultColor: ColorScheme = {
  bg: 'bg-gray-500/15',
  text: 'text-gray-400',
  dot: 'bg-gray-400',
};

function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const normalised = status.toLowerCase().trim();
  const colors = statusColorMap[normalised] ?? defaultColor;

  const displayLabel = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        colors.bg,
        colors.text,
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
      )}
    >
      <span
        className={clsx(
          'rounded-full flex-shrink-0',
          colors.dot,
          size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2'
        )}
      />
      {displayLabel}
    </span>
  );
}

export default StatusBadge;
