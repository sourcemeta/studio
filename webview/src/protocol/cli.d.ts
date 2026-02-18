/**
 * CLI-related types
 * Types that represent CLI command results and errors
 */

export type Position = [number, number, number, number];

export interface LintError {
  id: string;
  message: string;
  description?: string | null;
  path: string;
  schemaLocation: string;
  position: Position | null;
}

export interface LintResult {
  raw: string;
  health: number | null;
  valid?: boolean;
  errors?: LintError[];
  error?: boolean;
}

export interface CommandResult {
  output: string;
  exitCode: number | null;
}

export interface MetaschemaError {
  error: string;
  instanceLocation: string;
  keywordLocation: string;
  absoluteKeywordLocation?: string;
  instancePosition?: Position;
}

export interface CliError {
  error: string;
  line?: number;
  column?: number;
  filePath?: string;
  identifier?: string;
  location?: string;
  rule?: string;
  testNumber?: number;
  uri?: string;
  command?: string;
  option?: string;
}

export interface MetaschemaResult extends CommandResult {
  errors?: (MetaschemaError | CliError)[];
}

export type FormatResult = CommandResult;
