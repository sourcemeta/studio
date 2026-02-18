import type { CommandResult, FileInfo } from '../protocol/types';
import { formatSchema } from '../message';
import { RawOutput } from './RawOutput';
import { Info, CheckCircle, AlertCircle, FileQuestion } from 'lucide-react';

export interface FormatTabProps {
  formatResult: CommandResult;
  fileInfo: FileInfo | null;
  hasParseErrors?: boolean | undefined;
  noFileSelected?: boolean | undefined;
}

export function FormatTab({ formatResult, fileInfo, hasParseErrors, noFileSelected }: FormatTabProps) {
  const handleFormatSchema = () => {
    formatSchema();
  };

  const isYaml = fileInfo?.isYaml || false;

  if (noFileSelected) {
    return (
      <div className="text-center py-10 px-5">
        <div className="flex justify-center mb-4">
          <FileQuestion size={48} className="text-(--vscode-muted)" strokeWidth={1.5} />
        </div>
        <div className="text-lg font-semibold text-(--vscode-fg) mb-2">No Schema File Selected</div>
        <div className="text-[13px] text-(--vscode-muted) max-w-md mx-auto">
          Open a JSON schema file to check formatting.
        </div>
      </div>
    );
  }

  if (hasParseErrors) {
    return (
      <div className="text-center py-10 px-5">
        <div className="flex justify-center mb-4">
          <AlertCircle size={48} className="text-(--error)" strokeWidth={1.5} />
        </div>
        <div className="text-lg font-semibold text-(--vscode-fg) mb-2">
          Cannot Format Schema
        </div>
        <div className="text-[13px] text-(--vscode-muted) max-w-md mx-auto">
          The schema file has JSON parse errors. Please fix the syntax errors first before attempting to format.
          Check the Lint and Metaschema tabs for detailed error information.
        </div>
      </div>
    );
  }

  if (isYaml) {
    return (
      <div className="text-center py-10 px-5">
        <div className="flex justify-center mb-4">
          <Info size={48} className="text-(--vscode-muted)" strokeWidth={1.5} />
        </div>
        <div className="text-lg font-semibold text-(--vscode-fg) mb-2">
          YAML Format Not Supported
        </div>
        <div className="text-[13px] text-(--vscode-muted)">
          The JSON Schema CLI format command does not support YAML schemas yet. Only JSON files can be formatted.
        </div>
      </div>
    );
  }

  if (formatResult.exitCode === 0) {
    return (
      <>
        <div className="text-center py-10 px-5">
          <div className="flex justify-center mb-4">
            <CheckCircle size={48} style={{ color: 'var(--success)' }} strokeWidth={1.5} />
          </div>
          <div className="text-lg font-semibold text-(--vscode-fg) mb-2">
            Schema is properly formatted!
          </div>
          <div className="text-[13px] text-(--vscode-muted)">
            No formatting changes needed.
          </div>
        </div>
        <RawOutput output={formatResult.output} />
      </>
    );
  } else if (formatResult.exitCode !== null && formatResult.exitCode !== undefined) {
    return (
      <>
        <div className="text-center py-10 px-5">
          <p className="text-(--vscode-fg) text-sm mb-5">
            This schema needs formatting.
          </p>
          <button
            className="
              px-6 py-2.5 cursor-pointer rounded
              border border-(--vscode-button-border)
              bg-(--vscode-button-bg)
              text-(--vscode-button-fg)
              text-sm font-semibold
              hover:bg-(--vscode-button-hover)
              transition-colors
            "
            onClick={handleFormatSchema}
          >
            Format Schema
          </button>
        </div>
        <RawOutput output={formatResult.output} />
      </>
    );
  }

  return null;
}
