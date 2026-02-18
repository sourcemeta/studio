/**
 * Protocol types for communication between VSCode extension and webview
 * This file defines the message passing contract
 */

import type {
  Position,
  LintResult,
  FormatResult,
  MetaschemaResult
} from './cli';

export type TabType = 'lint' | 'format' | 'metaschema';

export interface WebviewState {
  activeTab?: TabType;
}

export interface FileInfo {
  absolutePath: string;
  displayPath: string;
  fileName: string;
  lineCount?: number;
  isYaml?: boolean;
}

export type {
  Position,
  LintError,
  LintResult,
  CommandResult,
  MetaschemaError,
  CliError,
  MetaschemaResult,
  FormatResult
} from './cli';

export interface PanelState {
  fileInfo: FileInfo | null;
  cliVersion: string;
  extensionVersion: string;
  lintResult: LintResult;
  formatResult: FormatResult;
  metaschemaResult: MetaschemaResult;
  isLoading?: boolean;
  formatLoading?: boolean;
  hasParseErrors?: boolean;
  noFileSelected?: boolean;
}

export type WebviewCommand = 'goToPosition' | 'formatSchema' | 'openExternal' | 'ready';

export interface WebviewToExtensionMessage {
  command: WebviewCommand;
  position?: Position;
  url?: string;
}

export interface ExtensionToWebviewMessage {
  type: 'update';
  state: PanelState;
}
