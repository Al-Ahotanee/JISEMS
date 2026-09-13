import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: EmptyStateAction;
}

const containerVariants = {
  initial: { opacity: 0, y: 16 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: 'easeOut' },
  },
};

function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <motion.div
      variants={containerVariants}
      initial="initial"
      animate="animate"
      className="flex flex-col items-center justify-center py-20 px-6 text-center"
    >
      <div className="w-20 h-20 rounded-full bg-dark-surface-2 border border-dark-border flex items-center justify-center mb-5">
        <Icon className="w-10 h-10 text-text-muted opacity-50" />
      </div>

      <h3 className="font-display text-xl font-semibold text-text-primary mb-2">
        {title}
      </h3>

      <p className="text-sm text-text-muted max-w-sm leading-relaxed">
        {description}
      </p>

      {action && (
        <button
          onClick={action.onClick}
          className="btn-primary mt-6"
        >
          {action.label}
        </button>
      )}
    </motion.div>
  );
}

export default EmptyState;
