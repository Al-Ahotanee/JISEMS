import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Info } from 'lucide-react';
import clsx from 'clsx';

type DialogVariant = 'danger' | 'primary';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: DialogVariant;
}

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const dialogVariants = {
  hidden: { opacity: 0, scale: 0.9, y: 20 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 400, damping: 30 },
  },
  exit: {
    opacity: 0,
    scale: 0.92,
    y: 10,
    transition: { duration: 0.15 },
  },
};

function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'primary',
}: ConfirmDialogProps) {
  const isDanger = variant === 'danger';

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Overlay */}
          <motion.div
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Dialog */}
          <motion.div
            variants={dialogVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="relative w-full max-w-md bg-dark-surface-2 border border-dark-border rounded-xl shadow-2xl overflow-hidden"
          >
            <div className="p-6">
              {/* Icon */}
              <div
                className={clsx(
                  'w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4',
                  isDanger ? 'bg-red-500/15' : 'bg-primary-500/15'
                )}
              >
                {isDanger ? (
                  <AlertTriangle className="w-6 h-6 text-red-400" />
                ) : (
                  <Info className="w-6 h-6 text-primary-300" />
                )}
              </div>

              {/* Content */}
              <h3 className="text-lg font-display font-semibold text-text-primary text-center">
                {title}
              </h3>
              <p className="mt-2 text-sm text-text-muted text-center leading-relaxed">
                {message}
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={onClose}
                className="flex-1 btn-outline text-center"
              >
                {cancelText}
              </button>
              <button
                onClick={handleConfirm}
                className={clsx(
                  'flex-1 text-center font-semibold py-2.5 px-6 rounded-lg transition-all duration-200 active:scale-95',
                  isDanger
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'btn-primary'
                )}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default ConfirmDialog;
