import clsx from 'clsx';

interface Props {
  title: string;
  description: string;
  icon: string;
  enabled: boolean;
  onToggle: () => void;
  badge?: string;
  badgeTone?: 'blue' | 'live' | 'muted';
  children?: React.ReactNode;
}

export function FeatureToggle({ title, description, icon, enabled, onToggle, badge, badgeTone = 'blue', children }: Props) {
  return (
    <div className={clsx(
      'card p-5 transition-all duration-200',
      enabled && 'border-teal-500/30 bg-teal-500/5'
    )}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <span className="text-2xl mt-0.5">{icon}</span>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-white font-semibold text-sm">{title}</h3>
              {badge && (
                <span className={clsx(
                  'text-xs px-2 py-0.5 rounded-full font-medium border',
                  badgeTone === 'live'
                    ? 'bg-teal-500/20 text-teal-400 border-teal-500/30'
                    : badgeTone === 'muted'
                    ? 'bg-navy-900 text-gray-500 border-navy-600'
                    : 'bg-accent-blue/20 text-accent-blue border-accent-blue/30'
                )}>
                  {badge}
                </span>
              )}
            </div>
            <p className="text-gray-400 text-xs mt-1 leading-relaxed">{description}</p>
          </div>
        </div>
        <button
          onClick={onToggle}
          className={clsx(
            'relative w-12 h-6 rounded-full transition-all duration-300 flex-shrink-0 mt-0.5',
            enabled ? 'bg-teal-500' : 'bg-navy-600 border border-gray-600'
          )}
        >
          <span className={clsx(
            'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-300',
            enabled ? 'left-6' : 'left-0.5'
          )} />
        </button>
      </div>
      {enabled && children && (
        <div className="mt-4 pt-4 border-t border-navy-700">
          {children}
        </div>
      )}
    </div>
  );
}
