import type { PanelState } from '../protocol/types';
import type { LucideIcon } from 'lucide-react';
import { calculateLintStatus, calculateFormatStatus, calculateMetaschemaStatus } from '../utils/tabStatus';

export interface TabsProps {
  activeTab: 'lint' | 'format' | 'metaschema';
  onTabChange: (tab: 'lint' | 'format' | 'metaschema') => void;
  state: PanelState;
}

interface TabProps {
  id: 'lint' | 'format' | 'metaschema';
  label: string;
  Icon: LucideIcon | null;
  color: string;
  disabled?: boolean;
}

export function Tabs({ activeTab, onTabChange, state }: TabsProps) {
  const lintStatus = calculateLintStatus(state.lintResult.errors?.length || 0, state.lintResult.health, state.isLoading, state.noFileSelected);
  const formatStatus = calculateFormatStatus(state.formatResult.exitCode, state.formatLoading, state.fileInfo?.isYaml, state.noFileSelected);
  const metaschemaStatus = calculateMetaschemaStatus(state.metaschemaResult.exitCode, state.isLoading, state.noFileSelected);

  const Tab = ({ 
    id, 
    label, 
    Icon, 
    color,
    disabled = false
  }: TabProps) => (
    <button
      className={`
        px-4 py-2 cursor-pointer border-none bg-transparent
        text-[13px] border-b-2 transition-all flex items-center gap-1.5
        ${activeTab === id 
          ? 'text-(--vscode-fg) border-(--vscode-accent)' 
          : 'text-(--vscode-muted) border-transparent hover:text-(--vscode-fg)'
        }
      `}
      onClick={() => !disabled && onTabChange(id)}
      style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
    >
      {Icon && (
        <Icon size={14} strokeWidth={2} style={{ color }} />
      )}
      <span>{label}</span>
    </button>
  );

  return (
    <div className="flex border-b border-(--vscode-border) mb-5">
      <Tab id="lint" label="Lint" Icon={lintStatus.Icon} color={lintStatus.color} />
      <Tab id="format" label="Format" Icon={formatStatus.Icon} color={formatStatus.color} />
      <Tab id="metaschema" label="Metaschema" Icon={metaschemaStatus.Icon} color={metaschemaStatus.color} />
    </div>
  );
}
