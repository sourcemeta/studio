import type { FileInfo as FileInfoType } from '../protocol/types';

export interface FileInfoProps {
  fileInfo: FileInfoType | null;
}

export function FileInfo({ fileInfo }: FileInfoProps) {
  if (!fileInfo) {
    return (
      <p className="text-(--vscode-muted) text-sm italic mb-5">
        No schema file selected
      </p>
    );
  }

  return (
    <div className="mb-5 p-3 bg-(--vscode-selection) rounded border-l-[3px] border-(--vscode-accent)">
      <p className="text-(--vscode-muted) text-[11px] uppercase tracking-wider mb-1.5 font-semibold">
        Schema File
      </p>
      <p className="text-(--vscode-fg) text-[13px] break-all m-0 font-(--vscode-editor-font)">
        {fileInfo.displayPath}
      </p>
      {fileInfo.lineCount && (
        <p className="text-(--vscode-muted) text-[11px] mt-1.5 m-0">
          {fileInfo.lineCount.toLocaleString()} lines
          {fileInfo.isYaml && ' • YAML'}
        </p>
      )}
    </div>
  );
}


