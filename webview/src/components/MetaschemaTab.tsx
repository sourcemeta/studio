import type { MetaschemaResult, MetaschemaError, Position } from '../protocol/types';
import { goToPosition } from '../message';
import { RawOutput } from './RawOutput';
import { CheckCircle, AlertTriangle, FileQuestion } from 'lucide-react';

export interface MetaschemaTabProps {
  metaschemaResult: MetaschemaResult;
  noFileSelected?: boolean | undefined;
}

function isMetaschemaError(error: unknown): error is MetaschemaError {
  return typeof error === 'object' && error !== null && 'instancePosition' in error;
}

export function MetaschemaTab({ metaschemaResult, noFileSelected }: MetaschemaTabProps) {
  const handleGoToPosition = (position: Position) => {
    goToPosition(position);
  };

  const errors = metaschemaResult.errors || [];
  const metaschemaErrors = errors.filter(isMetaschemaError);

  if (noFileSelected) {
    return (
      <div className="text-center py-10 px-5">
        <div className="flex justify-center mb-4">
          <FileQuestion size={48} className="text-(--vscode-muted)" strokeWidth={1.5} />
        </div>
        <div className="text-lg font-semibold text-(--vscode-fg) mb-2">No Schema File Selected</div>
        <div className="text-[13px] text-(--vscode-muted) max-w-md mx-auto">
          Open a JSON or YAML schema file to validate against its meta-schema.
        </div>
      </div>
    );
  }

  if (metaschemaResult.exitCode === 0) {
    return (
      <>
        <div className="text-center py-10 px-5">
          <div className="flex justify-center mb-4">
            <CheckCircle size={48} style={{ color: 'var(--success)' }} strokeWidth={1.5} />
          </div>
          <div className="text-lg font-semibold text-(--vscode-fg) mb-2">
            Schema is valid according to its meta-schema!
          </div>
          <div className="text-[13px] text-(--vscode-muted)">
            No validation errors found.
          </div>
        </div>
        <RawOutput output={metaschemaResult.output} />
      </>
    );
  } else if (metaschemaResult.exitCode === 2 && metaschemaErrors.length > 0) {
    return (
      <div>
        <div className="flex flex-col gap-3 mb-5">
          {metaschemaErrors.map((error, index) => (
            <div
              key={index}
              className="bg-(--vscode-selection) border-l-[3px] rounded p-3 cursor-pointer transition-colors hover:bg-(--vscode-hover)"
              style={{ 
                cursor: error.instancePosition ? 'pointer' : 'default',
                borderLeftColor: 'var(--error)'
              }}
              onClick={() => error.instancePosition && handleGoToPosition(error.instancePosition)}
            >
              <div className="mb-2">
                <div className="text-(--vscode-fg) text-[13px] font-semibold">
                  {error.error}
                </div>
              </div>
              <div className="flex flex-col gap-1 text-[11px]">
                {error.instancePosition && (
                  <div className="flex gap-1.5">
                    <span className="text-(--vscode-muted) font-semibold min-w-20">
                      Location:
                    </span>
                    <span className="text-(--vscode-fg) font-(--vscode-editor-font)">
                      Line {error.instancePosition[0]}, Col {error.instancePosition[1]}
                    </span>
                  </div>
                )}
                {error.instanceLocation && (
                  <div className="flex gap-1.5">
                    <span className="text-(--vscode-muted) font-semibold min-w-20">
                      Path:
                    </span>
                    <span className="text-(--vscode-fg) font-(--vscode-editor-font) break-all">
                      {error.instanceLocation || '(root)'}
                    </span>
                  </div>
                )}
                {error.keywordLocation && (
                  <div className="flex gap-1.5">
                    <span className="text-(--vscode-muted) font-semibold min-w-20">
                      Schema:
                    </span>
                    <span className="text-(--vscode-fg) font-(--vscode-editor-font) break-all">
                      {error.keywordLocation}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <RawOutput output={metaschemaResult.output} />
      </div>
    );
  } else if (metaschemaResult.exitCode === 2) {
    return (
      <>
        <div className="mb-5">
          <div className="bg-(--vscode-bg) border border-(--vscode-border) rounded p-3 overflow-x-auto">
            <pre className="m-0 font-(--vscode-editor-font) text-xs text-(--vscode-fg) whitespace-pre-wrap wrap-break-word">
              {metaschemaResult.output}
            </pre>
          </div>
        </div>
        <RawOutput output={metaschemaResult.output} />
      </>
    );
  } else if (metaschemaResult.exitCode === 1) {
    const error = errors.length > 0 ? errors[0] : null;

    const errorPosition: Position | null =
      error && 'instancePosition' in error && error.instancePosition
        ? error.instancePosition
        : null;
    
    return (
      <>
        <div 
          className="bg-(--vscode-selection) border-l-[3px] rounded p-4 mb-5 transition-colors"
          style={{ 
            borderLeftColor: 'var(--fatal)',
            cursor: errorPosition ? 'pointer' : 'default'
          }}
          onClick={() => errorPosition && handleGoToPosition(errorPosition)}
          onMouseEnter={(e) => errorPosition && (e.currentTarget.style.backgroundColor = 'var(--vscode-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--vscode-selection)')}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle size={24} style={{ color: 'var(--fatal)', flexShrink: 0 }} strokeWidth={1.5} />
            <div className="flex-1">
              <div className="text-lg font-semibold text-(--vscode-fg) mb-2">
                {error?.error || 'Fatal Error'}
              </div>
              {error && (
                <div className="flex flex-col gap-2 text-[13px]">
                  {errorPosition && (
                    <div className="flex gap-2">
                      <span className="text-(--vscode-muted) font-semibold min-w-20">Location:</span>
                      <span className="text-(--vscode-fg) font-(--vscode-editor-font)">
                        Line {errorPosition[0]}, Column {errorPosition[1]}
                      </span>
                    </div>
                  )}
                  {'instanceLocation' in error && error.instanceLocation && error.instanceLocation !== '/' && (
                    <div className="flex gap-2">
                      <span className="text-(--vscode-muted) font-semibold min-w-20">Path:</span>
                      <span className="text-(--vscode-fg) font-(--vscode-editor-font) break-all">
                        {error.instanceLocation}
                      </span>
                    </div>
                  )}
                  {'absoluteKeywordLocation' in error && error.absoluteKeywordLocation && (
                    <div className="flex gap-2">
                      <span className="text-(--vscode-muted) font-semibold min-w-20">Context:</span>
                      <span className="text-(--vscode-fg) font-(--vscode-editor-font) break-all">
                        {error.absoluteKeywordLocation}
                      </span>
                    </div>
                  )}
                </div>
              )}
              {!error && (
                <div className="text-[13px] text-(--vscode-muted)">
                  The metaschema command failed to execute. Check the raw output below for details.
                </div>
              )}
            </div>
          </div>
        </div>
        <RawOutput output={metaschemaResult.output} />
      </>
    );
  }

  return null;
}
