import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { FileInfo, LintResult, MetaschemaResult, CliError, Position } from '../../../protocol/types';

/**
 * Parse generic CLI error response from JSON output
 */
export function parseCliError(output: string): CliError | null {
    try {
        const parsed = JSON.parse(output);
        if (parsed.error && typeof parsed.error === 'string') {
            return {
                error: parsed.error,
                line: parsed.line,
                column: parsed.column,
                filePath: parsed.filePath,
                identifier: parsed.identifier,
                location: parsed.location,
                rule: parsed.rule,
                testNumber: parsed.testNumber,
                uri: parsed.uri,
                command: parsed.command,
                option: parsed.option
            };
        }
    } catch {
        // Not JSON or doesn't have error field
    }
    return null;
}

/**
 * Check if there are JSON parse errors in lint or metaschema results
 */
export function hasJsonParseErrors(lintResult: LintResult, metaschemaResult: MetaschemaResult): boolean {
    if (lintResult.errors && lintResult.errors.length > 0) {
        const hasLintParseError = lintResult.errors.some(error => 
            error.id === 'json-parse-error' || 
            error.message.toLowerCase().includes('failed to parse')
        );
        if (hasLintParseError) {
            return true;
        }
    }

    if (metaschemaResult.errors && metaschemaResult.errors.length > 0) {
        const hasMetaschemaParseError = metaschemaResult.errors.some(error =>
            error.error.toLowerCase().includes('failed to parse')
        );
        if (hasMetaschemaParseError) {
            return true;
        }
    }

    return false;
}

/**
 * Get information about a file path
 */
export function getFileInfo(filePath: string | undefined): FileInfo | null {
    if (!filePath) {
        return null;
    }

    // Check if file is JSON or YAML
    const extension = path.extname(filePath).toLowerCase();
    const isValidFile = ['.json', '.yaml', '.yml'].includes(extension);

    if (!isValidFile) {
        return null;
    }

    // Get relative path if workspace folder exists
    const workspaceFolders = vscode.workspace.workspaceFolders;
    let displayPath = filePath;

    if (workspaceFolders && workspaceFolders.length > 0) {
        const firstFolder = workspaceFolders[0];
        if (firstFolder !== undefined) {
            const workspaceRoot = firstFolder.uri.fsPath;
            if (filePath.startsWith(workspaceRoot)) {
                displayPath = path.relative(workspaceRoot, filePath);
            }
        }
    }

    let lineCount = 0;
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        lineCount = content.split('\n').length;
    } catch (error) {
        console.error('Failed to read file for line count:', error);
    }

    const isYaml = extension === '.yaml' || extension === '.yml';

    return {
        absolutePath: filePath,
        displayPath: displayPath,
        fileName: path.basename(filePath),
        lineCount,
        isYaml
    };
}

/**
 * Parse lint command output
 */
export function parseLintResult(lintOutput: string): LintResult {
    try {
        const parsed = JSON.parse(lintOutput);
        
        if (parsed.error && typeof parsed.error === 'string' && 
            typeof parsed.line === 'number' && typeof parsed.column === 'number' &&
            parsed.filePath && !parsed.identifier) {
            
            const description = `Failed to parse JSON document at line ${parsed.line}, column ${parsed.column}`;
            
            return {
                raw: lintOutput,
                health: 0,
                valid: false,
                errors: [{
                    id: 'json-parse-error',
                    message: parsed.error,
                    description: description,
                    path: '/',
                    schemaLocation: '/',
                    position: [parsed.line, parsed.column, parsed.line, parsed.column]
                }]
            };
        }

        if (parsed.error && !parsed.health && !Array.isArray(parsed.errors)) {
            const hasPosition = typeof parsed.line === 'number' && typeof parsed.column === 'number';
            let description = parsed.error;
            
            if (parsed.filePath) {
                description = `Error in ${parsed.filePath}`;
                if (hasPosition) {
                    description += ` at line ${parsed.line}, column ${parsed.column}`;
                }
            }
            
            return {
                raw: lintOutput,
                health: 0,
                valid: false,
                errors: [{
                    id: parsed.identifier ? 'cli-error-with-id' : 'cli-error',
                    message: parsed.error,
                    description: description,
                    path: parsed.location || '/',
                    schemaLocation: parsed.identifier || '/',
                    position: hasPosition ? [parsed.line, parsed.column, parsed.line, parsed.column] : null
                }]
            };
        }
        
        // Normal lint response format
        return {
            raw: lintOutput,
            health: parsed.health,
            valid: parsed.valid,
            errors: parsed.errors || []
        };
    } catch (error) {
        console.error('Failed to parse lint result:', error instanceof Error ? error.message : String(error));
        return {
            raw: lintOutput,
            health: null,
            error: true
        };
    }
}

/**
 * Parse metaschema command output
 */
export function parseMetaschemaResult(output: string, exitCode: number | null): MetaschemaResult {
    const result: MetaschemaResult = { output, exitCode };

    if (exitCode === 1) {
        const cliError = parseCliError(output);
        if (cliError) {
            result.errors = [{
                error: cliError.error,
                instanceLocation: cliError.location || '/',
                keywordLocation: '/',
                absoluteKeywordLocation: cliError.identifier,
                instancePosition: cliError.line && cliError.column 
                    ? [cliError.line, cliError.column, cliError.line, cliError.column] 
                    : undefined
            }];
            return result;
        }
    }

    if (exitCode === 2) {
        try {
            let jsonStr = output.trim();

            const jsonStart = jsonStr.indexOf('[');
            const jsonEnd = jsonStr.lastIndexOf(']');
            
            if (jsonStart !== -1 && jsonEnd !== -1 && jsonStart < jsonEnd) {
                jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1);
            }
            
            const parsed = JSON.parse(jsonStr);
            if (Array.isArray(parsed)) {
                result.errors = parsed.map((error: {
                    error?: string;
                    instanceLocation?: string;
                    keywordLocation?: string;
                    absoluteKeywordLocation?: string;
                    instancePosition?: Position;
                }) => ({
                    error: error.error || 'Validation error',
                    instanceLocation: error.instanceLocation || '',
                    keywordLocation: error.keywordLocation || '',
                    absoluteKeywordLocation: error.absoluteKeywordLocation,
                    instancePosition: error.instancePosition
                }));
                console.log('[Metaschema] Mapped errors count:', result.errors.length);
            } else {
                console.error('[Metaschema] Expected array but got:', typeof parsed);
            }
        } catch (error) {
            console.error('Failed to parse metaschema result:', error instanceof Error ? error.message : String(error));
            console.error('[Metaschema] Raw output:', output);
            console.error('[Metaschema] Output length:', output.length);
        }
    }
    
    return result;
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(text: string): string {
    return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Convert VS Code position to 1-based array format
 */
export function positionToArray(position: vscode.Position): [number, number] {
    return [position.line + 1, position.character + 1];
}

/**
 * Convert 1-based array format to VS Code position
 */
export function arrayToPosition(arr: [number, number]): vscode.Position {
    return new vscode.Position(arr[0] - 1, arr[1] - 1);
}

/**
 * Convert error position array to VS Code range
 * Position array is 1-based and inclusive, VS Code is 0-based and end-exclusive
 *
 * When a diagnostic applies to the root of the document (position spanning
 * from line 1, column 1 across multiple lines, or across a single line in
 * minified files), we collapse the range to
 * a zero-width range at (0,0). VS Code renders this by expanding the
 * squiggle to the first word, matching what ESLint and Pylint do. VS Code
 * does not support file-level diagnostics without a range:
 * https://github.com/microsoft/vscode/issues/238608
 */
export function errorPositionToRange(position: Position): vscode.Range {
    const [lineStart, columnStart, lineEnd, columnEnd] = position;

    if (lineStart === 1 && columnStart === 1 && (lineEnd > lineStart || columnEnd > columnStart)) {
        return new vscode.Range(
            new vscode.Position(0, 0),
            new vscode.Position(0, 0)
        );
    }

    return new vscode.Range(
        new vscode.Position(lineStart - 1, columnStart - 1),
        new vscode.Position(lineEnd - 1, columnEnd)
    );
}
