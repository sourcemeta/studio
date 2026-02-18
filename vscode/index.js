const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { spawn } = require('@sourcemeta/jsonschema');

let panel;
let lintDiagnostics;
let metaschemaDiagnostics;
let lastActiveTextEditor;
let cachedCliVersion = 'Loading...';
let extensionVersion = 'Loading...';
let currentPanelState = null;
let webviewReady = false;

async function executeCommand(args) {
    const result = await spawn(args, { json: true });
    const output = typeof result.stdout === 'string'
        ? result.stdout
        : JSON.stringify(result.stdout);
    return { output: output.trim(), exitCode: result.code };
}

async function getVersion() {
    try {
        const result = await spawn(['version'], { json: false });
        const output = ((result.stdout) || '').trim();
        return result.code === 0 ? output : `Error: ${output}`;
    } catch (error) {
        return `Error: ${error.message}`;
    }
}

function parseCliError(output) {
    try {
        const parsed = JSON.parse(output);
        if (parsed.error && typeof parsed.error === 'string') {
            return parsed;
        }
    } catch {
    }
    return null;
}

function hasJsonParseErrors(lintResult, metaschemaResult) {
    const lintHasParseError = lintResult.errors?.some(error =>
        error.id === 'json-parse-error' ||
        error.message.toLowerCase().includes('failed to parse')
    );
    const metaschemaHasParseError = metaschemaResult.errors?.some(error =>
        error.error.toLowerCase().includes('failed to parse')
    );
    return !!(lintHasParseError || metaschemaHasParseError);
}

function getFileInfo(filePath) {
    if (!filePath) {
        return null;
    }

    const extension = path.extname(filePath).toLowerCase();
    if (!['.json', '.yaml', '.yml'].includes(extension)) {
        return null;
    }

    let displayPath = filePath;
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot && filePath.startsWith(workspaceRoot)) {
        displayPath = path.relative(workspaceRoot, filePath);
    }

    let lineCount = 0;
    try {
        lineCount = fs.readFileSync(filePath, 'utf-8').split('\n').length;
    } catch {
    }

    return {
        absolutePath: filePath,
        displayPath,
        fileName: path.basename(filePath),
        lineCount,
        isYaml: extension === '.yaml' || extension === '.yml'
    };
}

function parseLintResult(lintOutput) {
    try {
        const parsed = JSON.parse(lintOutput);

        if (parsed.error && typeof parsed.error === 'string' &&
            typeof parsed.line === 'number' && typeof parsed.column === 'number' &&
            parsed.filePath && !parsed.identifier) {
            return {
                raw: lintOutput,
                health: 0,
                valid: false,
                errors: [{
                    id: 'json-parse-error',
                    message: parsed.error,
                    description: `Failed to parse JSON document at line ${parsed.line}, column ${parsed.column}`,
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

        return {
            raw: lintOutput,
            health: parsed.health,
            valid: parsed.valid,
            errors: parsed.errors || []
        };
    } catch {
        return { raw: lintOutput, health: null, error: true };
    }
}

function parseMetaschemaResult(output, exitCode) {
    const result = { output, exitCode };

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
            const parsed = JSON.parse(output);
            if (parsed.errors && Array.isArray(parsed.errors)) {
                result.errors = parsed.errors.map((entry) => ({
                    error: entry.error || 'Validation error',
                    instanceLocation: entry.instanceLocation || '',
                    keywordLocation: entry.keywordLocation || '',
                    absoluteKeywordLocation: entry.absoluteKeywordLocation,
                    instancePosition: entry.instancePosition
                }));
            }
        } catch {
        }
    }

    return result;
}

function errorPositionToRange(position) {
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

function buildPanelState(fileInfo, overrides) {
    return {
        fileInfo,
        cliVersion: cachedCliVersion,
        extensionVersion,
        lintResult: { raw: '', health: null },
        formatResult: { output: '', exitCode: null },
        metaschemaResult: { output: '', exitCode: null },
        isLoading: false,
        hasParseErrors: false,
        ...overrides
    };
}

function updatePanel(state) {
    panel?.webview.postMessage({ type: 'update', state });
}

function buildRelatedInfo(location, messages) {
    const entries = messages
        .filter((message) => !!message)
        .map(message => new vscode.DiagnosticRelatedInformation(location, message));
    return entries.length > 0 ? entries : undefined;
}

function updateLintDiagnostics(documentUri, errors) {
    const diagnostics = errors
        .filter((error) => error.position !== null)
        .map(error => {
            const range = errorPositionToRange(error.position);
            const diagnostic = new vscode.Diagnostic(
                range, error.message, vscode.DiagnosticSeverity.Warning
            );

            diagnostic.source = 'Sourcemeta Studio (Lint)';

            if (error.id) {
                diagnostic.code = {
                    value: error.id,
                    target: vscode.Uri.parse(`https://github.com/Karan-Palan/json-schema-lint-rules/tree/main/docs/${error.id}.md`)
                };
            }

            diagnostic.relatedInformation = buildRelatedInfo(
                new vscode.Location(documentUri, range), [
                    error.description && ` ${error.description}`,
                    error.path && ` Path: ${error.path}`,
                    error.schemaLocation && ` Schema Location: ${error.schemaLocation}`
                ]
            );

            return diagnostic;
        });

    lintDiagnostics.set(documentUri, diagnostics);
}

function updateMetaschemaDiagnostics(documentUri, errors) {
    const diagnostics = errors
        .filter((error) => 'instancePosition' in error && error.instancePosition !== undefined)
        .map(error => {
            const range = errorPositionToRange(error.instancePosition);
            const diagnostic = new vscode.Diagnostic(
                range, error.error, vscode.DiagnosticSeverity.Error
            );

            diagnostic.source = 'Sourcemeta Studio (Metaschema)';

            if (error.instanceLocation !== undefined) {
                diagnostic.code = error.instanceLocation;
            }

            diagnostic.relatedInformation = buildRelatedInfo(
                new vscode.Location(documentUri, range), [
                    error.instanceLocation && ` Instance Location: ${error.instanceLocation}`,
                    error.keywordLocation && ` Keyword Location: ${error.keywordLocation}`,
                    error.absoluteKeywordLocation && ` Absolute Keyword Location: ${error.absoluteKeywordLocation}`
                ]
            );

            return diagnostic;
        });

    metaschemaDiagnostics.set(documentUri, diagnostics);
}

function handleWebviewMessage(message) {
    if (message.command === 'ready') {
        webviewReady = true;
        console.log('[Sourcemeta Studio] Webview ready');
        return;
    }

    if (message.command === 'goToPosition' && lastActiveTextEditor && message.position) {
        const range = errorPositionToRange(message.position);
        vscode.window.showTextDocument(lastActiveTextEditor.document, {
            preserveFocus: false,
            viewColumn: lastActiveTextEditor.viewColumn
        }).then((editor) => {
            editor.selection = new vscode.Selection(range.start, range.end);
            editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
        });
    } else if (message.command === 'openExternal' && message.url) {
        vscode.env.openExternal(vscode.Uri.parse(message.url));
    } else if (message.command === 'formatSchema' && lastActiveTextEditor) {
        const filePath = lastActiveTextEditor.document.uri.fsPath;

        if (!getFileInfo(filePath) || !panel || !currentPanelState) {
            return;
        }

        if (currentPanelState.hasParseErrors) {
            vscode.window.showErrorMessage('Cannot format schema: The file has JSON parse errors. Please fix the syntax errors first.');
            return;
        }

        updatePanel({ ...currentPanelState, formatLoading: true });

        executeCommand(['fmt', '--http', filePath]).then(async (result) => {
            if (result.exitCode !== 0) {
                throw new Error(result.output || `Process exited with code ${result.exitCode}`);
            }

            if (lastActiveTextEditor) {
                await vscode.window.showTextDocument(lastActiveTextEditor.document, lastActiveTextEditor.viewColumn);
            }

            await new Promise(resolve => setTimeout(resolve, 300));
            await updatePanelContent();
        }).catch((error) => {
            const cliError = parseCliError(error.message);
            let errorMessage = cliError?.error ?? error.message;
            if (cliError?.line) {
                errorMessage += ` at line ${cliError.line}`;
                if (cliError.column) {
                    errorMessage += `, column ${cliError.column}`;
                }
            }

            vscode.window.showErrorMessage(`Format failed: ${errorMessage}`);
            if (currentPanelState) {
                currentPanelState = {
                    ...currentPanelState,
                    formatResult: { output: `Error: ${errorMessage}`, exitCode: null },
                    formatLoading: false
                };
                updatePanel(currentPanelState);
            }
        });
    }
}

function handleActiveEditorChange(editor) {
    if (!editor || editor.document.uri.scheme !== 'file') {
        return;
    }

    const editorColumn = vscode.window.activeTextEditor?.viewColumn;
    if (panel && panel.viewColumn === editorColumn) {
        const targetColumn = panel.viewColumn === vscode.ViewColumn.One
            ? vscode.ViewColumn.Two
            : vscode.ViewColumn.One;

        vscode.commands.executeCommand('workbench.action.closeActiveEditor').then(() => {
            vscode.window.showTextDocument(editor.document, {
                viewColumn: targetColumn,
                preview: false
            }).then(() => {
                lastActiveTextEditor = vscode.window.activeTextEditor;
                updatePanelContent();
            });
        });
        return;
    }

    const previousFile = lastActiveTextEditor?.document.uri.fsPath;
    lastActiveTextEditor = editor;
    if (panel && previousFile !== editor.document.uri.fsPath) {
        updatePanelContent();
    }
}

function handleDocumentSave(document) {
    if (panel && lastActiveTextEditor &&
        document.uri.fsPath === lastActiveTextEditor.document.uri.fsPath &&
        getFileInfo(document.uri.fsPath)) {
        updatePanelContent();
    }
}

function createOrRevealPanel(context) {
    const columnToShowIn = vscode.window.activeTextEditor
        ? vscode.ViewColumn.Beside
        : vscode.ViewColumn.One;

    if (panel) {
        panel.reveal(columnToShowIn, true);
        return;
    }

    panel = vscode.window.createWebviewPanel(
        'sourcemetaStudio',
        'Sourcemeta Studio',
        { viewColumn: columnToShowIn, preserveFocus: false },
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                vscode.Uri.file(context.extensionPath),
                vscode.Uri.file(path.join(context.extensionPath, '..', 'build', 'webview'))
            ]
        }
    );

    panel.iconPath = vscode.Uri.file(path.join(context.extensionPath, 'logo.png'));

    const productionPath = path.join(context.extensionPath, 'index.html');
    if (fs.existsSync(productionPath)) {
        panel.webview.html = fs.readFileSync(productionPath, 'utf-8');
    } else {
        const devPath = path.join(context.extensionPath, '..', 'build', 'webview', 'index.html');
        panel.webview.html = fs.readFileSync(devPath, 'utf-8');
    }

    panel.webview.onDidReceiveMessage(
        handleWebviewMessage, undefined, context.subscriptions
    );

    panel.onDidDispose(() => {
        panel = undefined;
        lintDiagnostics.clear();
        metaschemaDiagnostics.clear();
    }, null, context.subscriptions);
}

async function updatePanelContent() {
    if (!panel) {
        return;
    }

    const filePath = lastActiveTextEditor?.document.uri.fsPath;
    const fileInfo = getFileInfo(filePath);

    if (!fileInfo) {
        currentPanelState = buildPanelState(null, { noFileSelected: true });
        updatePanel(currentPanelState);
        return;
    }

    updatePanel(buildPanelState(fileInfo, { isLoading: true }));

    if (lastActiveTextEditor) {
        lintDiagnostics.delete(lastActiveTextEditor.document.uri);
        metaschemaDiagnostics.delete(lastActiveTextEditor.document.uri);
    }

    try {
        cachedCliVersion = await getVersion();

        const [metaschemaRawResult, lintRawResult, formatResult] = await Promise.all([
            executeCommand(['metaschema', '--http', fileInfo.absolutePath]),
            executeCommand(['lint', '--http', fileInfo.absolutePath]),
            executeCommand(['fmt', '--check', '--http', fileInfo.absolutePath])
        ]);

        const metaschemaResult = parseMetaschemaResult(metaschemaRawResult.output, metaschemaRawResult.exitCode);
        const lintResult = parseLintResult(lintRawResult.output);

        currentPanelState = buildPanelState(fileInfo, {
            lintResult, formatResult, metaschemaResult,
            hasParseErrors: hasJsonParseErrors(lintResult, metaschemaResult)
        });
        updatePanel(currentPanelState);

        if (lastActiveTextEditor && lintResult.errors && lintResult.errors.length > 0) {
            updateLintDiagnostics(lastActiveTextEditor.document.uri, lintResult.errors);
        }

        if (lastActiveTextEditor && metaschemaResult.errors && metaschemaResult.errors.length > 0) {
            updateMetaschemaDiagnostics(lastActiveTextEditor.document.uri, metaschemaResult.errors);
        }
    } catch (error) {
        const errorMessage = error.message;
        cachedCliVersion = `Error: ${errorMessage}`;
        currentPanelState = buildPanelState(fileInfo, {
            lintResult: { raw: `Error: ${errorMessage}`, health: null, error: true },
            formatResult: { output: `Error: ${errorMessage}`, exitCode: null },
            metaschemaResult: { output: `Error: ${errorMessage}`, exitCode: null },
            hasParseErrors: true
        });
        updatePanel(currentPanelState);
    }
}

async function activate(context) {
    try {
        const packageJsonPath = path.join(context.extensionPath, 'package.json');
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        extensionVersion = packageJson.version || 'Unknown';
    } catch {
        extensionVersion = 'Unknown';
    }

    const config = vscode.workspace.getConfiguration('sourcemeta-studio');
    if (config.get('disableBuiltInValidation', true)) {
        if (vscode.workspace.workspaceFolders) {
            await vscode.workspace.getConfiguration('json').update(
                'validate.enable',
                false,
                vscode.ConfigurationTarget.Workspace
            );
        }
    }

    lintDiagnostics = vscode.languages.createDiagnosticCollection('sourcemeta-studio-lint');
    metaschemaDiagnostics = vscode.languages.createDiagnosticCollection('sourcemeta-studio-metaschema');
    context.subscriptions.push(lintDiagnostics, metaschemaDiagnostics);

    if (vscode.window.activeTextEditor) {
        lastActiveTextEditor = vscode.window.activeTextEditor;
    }

    context.subscriptions.push(
        vscode.commands.registerCommand('sourcemeta-studio.openPanel', () => {
            webviewReady = false;
            createOrRevealPanel(context);
            updatePanelContent();
        }),
        vscode.commands.registerCommand('sourcemeta-studio.isWebviewReady', () => webviewReady),
        vscode.window.onDidChangeActiveTextEditor(handleActiveEditorChange),
        vscode.workspace.onDidSaveTextDocument(handleDocumentSave)
    );
}

function deactivate() {
    panel?.dispose();
    lintDiagnostics?.dispose();
    metaschemaDiagnostics?.dispose();
}

module.exports = { activate, deactivate };
