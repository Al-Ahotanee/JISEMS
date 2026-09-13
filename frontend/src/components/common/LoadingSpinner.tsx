import clsx from 'clsx';

type SpinnerSize = 'sm' | 'md' | 'lg';

interface LoadingSpinnerProps {
  size?: SpinnerSize;
  fullPage?: boolean;
}

const sizeMap: Record<SpinnerSize, { spinner: string; text: string }> = {
  sm: { spinner: 'w-5 h-5 border-2', text: 'text-xs' },
  md: { spinner: 'w-8 h-8 border-[3px]', text: 'text-sm' },
  lg: { spinner: 'w-12 h-12 border-4', text: 'text-base' },
};

function LoadingSpinner({ size = 'md', fullPage = false }: LoadingSpinnerProps) {
  const styles = sizeMap[size];

  const spinner = (
    <div className="flex flex-col items-center justify-center gap-3">
      <div
        className={clsx(
          'rounded-full border-primary-500/30 border-t-primary-500 animate-spin',
          styles.spinner
        )}
      />
      {(size === 'md' || size === 'lg') && (
        <p className={clsx('text-text-muted font-medium', styles.text)}>Loading…</p>
      )}
    </div>
  );

  if (fullPage) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark-bg/80 backdrop-blur-sm">
        {spinner}
      </div>
    );
  }

  return <div className="flex items-center justify-center py-12">{spinner}</div>;
}

export default LoadingSpinner;
