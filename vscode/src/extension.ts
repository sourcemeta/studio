import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PanelManager } from './panel/PanelManager';
import { CommandExecutor } from './commands/CommandExecutor';
import { DiagnosticManager } from './diagnostics/DiagnosticManager';
import { getFileInfo, parseLintResult, parseMetaschemaResult, errorPositionToRange, parseCliError, hasJsonParseErrors } from './utils/fileUtils';
import { PanelState, WebviewToExtensionMessage } from '../../protocol/types';
import { DiagnosticType } from './types';

let panelManager: PanelManager;
let commandExecutor: CommandExecutor;
let diagnosticManager: DiagnosticManager;
let lastActiveTextEditor: vscode.TextEditor | undefined;
let cachedCliVersion = 'Loading...';
let extensionVersion = 'Loading...';
let currentPanelState: PanelState | null = null;
let webviewReady = false;

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    try {
        const packageJsonPath = path.join(context.extensionPath, 'package.json');
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        extensionVersion = packageJson.version || 'Unknown';
    } catch {
        extensionVersion = 'Unknown';
    }

    // Disable VS Code's built-in JSON validation if configured
    const config = vscode.workspace.getConfiguration('sourcemeta-studio');
    if (config.get('disableBuiltInValidation', true)) {
        // Only disable validation if a workspace is open to avoid changing global user settings
        if (vscode.workspace.workspaceFolders) {
            await vscode.workspace.getConfiguration('json').update(
                'validate.enable', 
                false, 
                vscode.ConfigurationTarget.Workspace
            );
        }
    }

    panelManager = new PanelManager(context.extensionPath);
    commandExecutor = new CommandExecutor();
    diagnosticManager = new DiagnosticManager();

    diagnosticManager.getCollections().forEach(collection => {
        context.subscriptions.push(collection);
    });

    panelManager.setMessageHandler((message: WebviewToExtensionMessage) => {
        handleWebviewMessage(message);
    });

    panelManager.setDisposeHandler(() => {
        diagnosticManager.clearAll();
    });

    const openPanelCommand = vscode.commands.registerCommand('sourcemeta-studio.openPanel', () => {
        webviewReady = false;
        panelManager.createOrReveal(context);
        updatePanelContent();
    });

    const isWebviewReadyCommand = vscode.commands.registerCommand('sourcemeta-studio.isWebviewReady', () => {
        return webviewReady;
    });

    const activeEditorChangeListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
        handleActiveEditorChange(editor);
    });

    if (vscode.window.activeTextEditor) {
        lastActiveTextEditor = vscode.window.activeTextEditor;
    }

    const documentSaveListener = vscode.workspace.onDidSaveTextDocument((document) => {
        handleDocumentSave(document);
    });

    context.subscriptions.push(
        openPanelCommand,
        isWebviewReadyCommand,
        activeEditorChangeListener,
        documentSaveListener
    );
}

/**
 * Handle messages from the webview
 */
function handleWebviewMessage(message: WebviewToExtensionMessage): void {
    if (message.command === 'ready') {
        webviewReady = true;
        console.log('[Sourcemeta Studio] Webview ready');
        return;
    }

    if (message.command === 'goToPosition' && lastActiveTextEditor && message.position) {
        const range = errorPositionToRange(message.position);

        const showOptions: vscode.TextDocumentShowOptions = {
            preserveFocus: false
        };
        if (lastActiveTextEditor.viewColumn !== undefined) {
            showOptions.viewColumn = lastActiveTextEditor.viewColumn;
        }
        vscode.window.showTextDocument(lastActiveTextEditor.document, showOptions).then((editor) => {
            editor.selection = new vscode.Selection(range.start, range.end);
            
            editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
        });
    } else if (message.command === 'openExternal' && message.url) {
        vscode.env.openExternal(vscode.Uri.parse(message.url));
    } else if (message.command === 'formatSchema' && lastActiveTextEditor) {
        const filePath = lastActiveTextEditor.document.uri.fsPath;
        const fileInfo = getFileInfo(filePath);
        
        if (!fileInfo || !panelManager.exists() || !currentPanelState) {
            return;
        }

        if (currentPanelState.hasParseErrors) {
            vscode.window.showErrorMessage('Cannot format schema: The file has JSON parse errors. Please fix the syntax errors first.');
            return;
        }

        // Send format loading state only, preserve existing lint/metaschema state
        panelManager.updateContent({
            ...currentPanelState,
            formatLoading: true
        });

        commandExecutor.format(filePath).then(async () => {
            if (lastActiveTextEditor) {
                await vscode.window.showTextDocument(lastActiveTextEditor.document, lastActiveTextEditor.viewColumn);
            }
            
            // Wait for Huge schemas to reload after formatting
            await new Promise(resolve => setTimeout(resolve, 300));

            await updatePanelContent();
        }).catch((error) => {
            let errorMessage = error.message;
            
            // Try to parse JSON error from CLI
            const cliError = parseCliError(error.message);
            if (cliError) {
                errorMessage = cliError.error;
                if (cliError.line) {
                    errorMessage += ` at line ${cliError.line}`;
                    if (cliError.column) {
                        errorMessage += `, column ${cliError.column}`;
                    }
                }
            }
            
            vscode.window.showErrorMessage(`Format failed: ${errorMessage}`);
            if (currentPanelState) {
                const updatedState = {
                    ...currentPanelState,
                    formatResult: { output: `Error: ${errorMessage}`, exitCode: null },
                    formatLoading: false
                };
                currentPanelState = updatedState;
                panelManager.updateContent(updatedState);
            }
        });
    }
}

/**
 * Handle active editor changes
 */
function handleActiveEditorChange(editor: vscode.TextEditor | undefined): void {
    if (panelManager.exists() && editor && editor.document.uri.scheme === 'file') {
        const panelColumn = panelManager.getPanel()?.viewColumn;
        const editorColumn = vscode.window.activeTextEditor?.viewColumn;

        if (panelColumn === editorColumn) {
            const targetColumn = panelColumn === vscode.ViewColumn.One
                ? vscode.ViewColumn.Two
                : vscode.ViewColumn.One;

            vscode.commands.executeCommand('workbench.action.closeActiveEditor').then(() => {
                vscode.window.showTextDocument(editor.document, {
                    viewColumn: targetColumn,
                    preview: false
                }).then(() => {
                    lastActiveTextEditor = vscode.window.activeTextEditor;
                    // Only update if the file actually changed
                    updatePanelContent();
                });
            });
        } else {
            const previousFile = lastActiveTextEditor?.document.uri.fsPath;
            lastActiveTextEditor = editor;

            if (previousFile !== editor.document.uri.fsPath) {
                updatePanelContent();
            }
        }
    } else if (editor && editor.document.uri.scheme === 'file') {
        const previousFile = lastActiveTextEditor?.document.uri.fsPath;
        lastActiveTextEditor = editor;

        if (panelManager.exists() && previousFile !== editor.document.uri.fsPath) {
            updatePanelContent();
        }
    }
}

/**
 * Handle document save events
 */
function handleDocumentSave(document: vscode.TextDocument): void {
    if (panelManager.exists() && lastActiveTextEditor && 
        document.uri.fsPath === lastActiveTextEditor.document.uri.fsPath) {
        const fileInfo = getFileInfo(document.uri.fsPath);
        // Only refresh if it's a JSON/YAML file
        if (fileInfo) {
            updatePanelContent();
        }
    }
}

/**
 * Update the panel content with current file analysis
 */
async function updatePanelContent(): Promise<void> {
    if (!panelManager.exists()) {
        return;
    }

    const filePath = lastActiveTextEditor?.document.uri.fsPath;
    const fileInfo = getFileInfo(filePath);

    // If no file is selected, show a "no file" state without running commands
    if (!fileInfo) {
        const noFileState: PanelState = {
            fileInfo: null,
            cliVersion: cachedCliVersion || 'Unknown',
            extensionVersion,
            lintResult: { raw: '', health: null },
            formatResult: { output: '', exitCode: null },
            metaschemaResult: { output: '', exitCode: null },
            isLoading: false,
            hasParseErrors: false,
            noFileSelected: true
        };
        currentPanelState = noFileState;
        panelManager.updateContent(noFileState);
        return;
    }

    // Send initial loading state
    const loadingState: PanelState = {
        fileInfo,
        cliVersion: cachedCliVersion,
        extensionVersion,
        lintResult: { raw: '', health: null },
        formatResult: { output: '', exitCode: null },
        metaschemaResult: { output: '', exitCode: null },
        isLoading: true,
        hasParseErrors: false
    };
    panelManager.updateContent(loadingState);

    if (lastActiveTextEditor) {
        diagnosticManager.clearDiagnostics(lastActiveTextEditor.document.uri);
    }

    try {
        const version = await commandExecutor.getVersion();
        cachedCliVersion = version;

        const [metaschemaRawResult, lintOutput, formatResult] = await Promise.all([
            commandExecutor.metaschema(fileInfo.absolutePath),
            commandExecutor.lint(fileInfo.absolutePath),
            commandExecutor.formatCheck(fileInfo.absolutePath)
        ]);

        const metaschemaResult = parseMetaschemaResult(metaschemaRawResult.output, metaschemaRawResult.exitCode);
        const lintResult = parseLintResult(lintOutput);

        const parseErrors = hasJsonParseErrors(lintResult, metaschemaResult);

        const finalState: PanelState = {
            fileInfo,
            cliVersion: cachedCliVersion,
            extensionVersion,
            lintResult,
            formatResult,
            metaschemaResult,
            isLoading: false,
            hasParseErrors: parseErrors
        };
        currentPanelState = finalState;
        panelManager.updateContent(finalState);

        // Update lint diagnostics
        if (lastActiveTextEditor && lintResult.errors && lintResult.errors.length > 0) {
            diagnosticManager.updateDiagnostics(
                lastActiveTextEditor.document.uri,
                lintResult.errors,
                DiagnosticType.Lint
            );
        }

        // Update metaschema diagnostics
        if (lastActiveTextEditor && metaschemaResult.errors && metaschemaResult.errors.length > 0) {
            diagnosticManager.updateMetaschemaDiagnostics(
                lastActiveTextEditor.document.uri,
                metaschemaResult.errors
            );
        }
    } catch (error) {
        cachedCliVersion = `Error: ${(error as Error).message}`;
        const errorState: PanelState = {
            fileInfo,
            cliVersion: cachedCliVersion,
            extensionVersion,
            lintResult: { raw: `Error: ${(error as Error).message}`, health: null, error: true },
            formatResult: { output: `Error: ${(error as Error).message}`, exitCode: null },
            metaschemaResult: { output: `Error: ${(error as Error).message}`, exitCode: null },
            isLoading: false,
            hasParseErrors: true
        };
        currentPanelState = errorState;
        panelManager.updateContent(errorState);
    }
}

/**
 * Extension deactivation
 */
export function deactivate(): void {
    if (panelManager) {
        panelManager.dispose();
    }
    if (diagnosticManager) {
        diagnosticManager.dispose();
    }
}
