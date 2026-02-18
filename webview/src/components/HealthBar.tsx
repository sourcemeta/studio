import type { LintResult } from '../protocol/types';

export interface HealthBarProps {
  lintResult: LintResult;
  isLoading?: boolean | undefined;
  noFileSelected?: boolean | undefined;
}

export function HealthBar({ lintResult, isLoading, noFileSelected }: HealthBarProps) {
  const errorCount = lintResult.errors?.length || 0;

  let health: number;

  if (noFileSelected) {
    health = 0;
  } else if (lintResult.health !== null && lintResult.health !== undefined) {
    health = lintResult.health;
  } else if (lintResult.errors !== undefined) {
    health = errorCount === 0 ? 100 : Math.max(0, 100 - errorCount * 10);
  } else {
    health = 0;
  }

  const getHealthColor = (health: number): string => {
    if (health >= 80) return 'var(--success)';
    if (health >= 50) return 'var(--warning)';
    return 'var(--error)';
  };

  const showUnknown = !noFileSelected && (isLoading || (lintResult.health === null && lintResult.errors === undefined));

  return (
    <div className="mb-5">
      <div className="text-(--vscode-fg) text-xs mb-1.5 font-semibold">
        Schema Health: {noFileSelected ? (
          <span className="text-(--vscode-muted)">N/A</span>
        ) : showUnknown ? (
          <span className="text-(--vscode-muted)">?%</span>
        ) : (
          `${health}%`
        )}
      </div>
      <div className="w-full h-2 bg-(--vscode-selection) rounded overflow-hidden">
        {showUnknown || noFileSelected ? (
          <div className="h-full bg-(--vscode-muted) opacity-30 w-full" />
        ) : (
          <div 
            className="h-full rounded transition-all duration-300"
            style={{ 
              width: `${health}%`,
              backgroundColor: getHealthColor(health)
            }}
          />
        )}
      </div>
    </div>
  );
}
