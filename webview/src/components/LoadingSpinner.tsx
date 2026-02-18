import type { FileInfo } from '../protocol/types';
import { AlertTriangle } from 'lucide-react';

export interface LoadingSpinnerProps {
  fileInfo?: FileInfo | null;
}

export function LoadingSpinner({ fileInfo }: LoadingSpinnerProps) {
  const isLargeSchema = fileInfo?.lineCount && fileInfo.lineCount > 500;

  return (
    <div className="flex items-center justify-center py-20">
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 border-4 border-(--vscode-muted) opacity-25 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-transparent border-t-(--vscode-fg) rounded-full animate-spin"></div>
        </div>
        <div className="text-(--vscode-muted) text-sm">
          Analyzing schema...
        </div>
        {isLargeSchema && (
          <div className="mt-2 px-4 py-2 
           rounded border-l-[3px] border-(--warning) max-w-md">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} style={{ color: 'var(--warning)', flexShrink: 0 }} strokeWidth={2} />
              <div>
                <p className="text-(--vscode-fg) text-xs font-semibold m-0 mb-1">
                  This schema is big and might take a while to analyse. Hang tight! ({fileInfo.lineCount?.toLocaleString()} lines)
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
