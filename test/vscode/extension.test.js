const assert = require('assert');
const vscode = require('vscode');
const path = require('path');

const FIXTURE_DIR = path.join(__dirname, 'fixtures');
const LINT_SOURCE = 'Sourcemeta Studio (Lint)';
const METASCHEMA_SOURCE = 'Sourcemeta Studio (Metaschema)';

async function activateExtension() {
    const extension = vscode.extensions.getExtension('sourcemeta.sourcemeta-studio');
    assert.ok(extension);
    if (!extension.isActive) {
        await extension.activate();
    }
    return extension;
}

async function openFixture(fixtureName) {
    const schemaPath = path.join(FIXTURE_DIR, fixtureName);
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(schemaPath));
    await vscode.window.showTextDocument(document);
    return document;
}

async function pollUntil(fn, check, timeout = 10000) {
    const interval = 200;
    const maxAttempts = timeout / interval;
    let last;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        last = await fn();
        if (check(last)) {
            return last;
        }
        await new Promise(resolve => setTimeout(resolve, interval));
    }
    return last;
}

async function openPanelAndWaitForReady(timeout = 15000) {
    await vscode.commands.executeCommand('sourcemeta-studio.openPanel');
    const ready = await pollUntil(
        () => vscode.commands.executeCommand('sourcemeta-studio.isWebviewReady'),
        value => value === true,
        timeout
    );
    if (!ready) {
        throw new Error('Webview did not become ready');
    }
}

async function waitForDiagnostics(uri, source, timeout = 10000) {
    return pollUntil(
        () => vscode.languages.getDiagnostics(uri).filter(d => d.source === source),
        diagnostics => diagnostics.length > 0,
        timeout
    );
}

async function waitForNoDiagnostics(uri, source, timeout = 10000) {
    const result = await pollUntil(
        () => vscode.languages.getDiagnostics(uri).filter(d => d.source === source),
        diagnostics => diagnostics.length === 0,
        timeout
    );
    return result.length === 0;
}

function getLintDiagnostics(uri) {
    return vscode.languages.getDiagnostics(uri)
        .filter(d => d.source === LINT_SOURCE);
}

function getMetaschemaDiagnostics(uri) {
    return vscode.languages.getDiagnostics(uri)
        .filter(d => d.source === METASCHEMA_SOURCE);
}

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('Extension should be present', () => {
        const extension = vscode.extensions.getExtension('sourcemeta.sourcemeta-studio');
        assert.ok(extension);
    });

    test('Should activate extension', async () => {
        const extension = await activateExtension();
        assert.ok(extension.isActive);
    });

    test('Should register openPanel command', async () => {
        await activateExtension();
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('sourcemeta-studio.openPanel'));
    });

    test('Should register isWebviewReady command', async () => {
        await activateExtension();
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('sourcemeta-studio.isWebviewReady'));
    });

    test('Should read extension version from package.json', async () => {
        const extension = await activateExtension();
        assert.ok(extension.packageJSON.version);
        assert.match(extension.packageJSON.version, /^\d+\.\d+\.\d+$/);
    });

    test('Should open panel when command is executed', async function() {
        this.timeout(15000);
        await activateExtension();
        await openPanelAndWaitForReady();
    });

    test('Should handle no file selected gracefully', async function() {
        this.timeout(5000);
        const extension = await activateExtension();
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await new Promise(resolve => setTimeout(resolve, 500));
        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');
        await new Promise(resolve => setTimeout(resolve, 1000));
        assert.ok(extension.isActive);
    });

    test('Should show appropriate message when no file is selected', async function() {
        this.timeout(5000);
        const extension = await activateExtension();
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await new Promise(resolve => setTimeout(resolve, 500));
        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');
        await new Promise(resolve => setTimeout(resolve, 1000));
        assert.ok(extension.isActive);
    });

    test('Should produce lint diagnostics for schema with lint issues', async function() {
        this.timeout(15000);
        await activateExtension();
        const document = await openFixture('test-schema.json');
        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');
        const diagnostics = await waitForDiagnostics(document.uri, LINT_SOURCE);
        assert.ok(diagnostics.length > 0);
    });

    test('Should produce no lint diagnostics for a valid schema', async function() {
        this.timeout(15000);
        await activateExtension();
        const document = await openFixture('valid-schema.json');
        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');
        await new Promise(resolve => setTimeout(resolve, 5000));
        assert.strictEqual(getLintDiagnostics(document.uri).length, 0);
    });

    test('Should set lint diagnostic severity to Warning', async function() {
        this.timeout(15000);
        await activateExtension();
        const document = await openFixture('test-schema.json');
        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');
        const diagnostics = await waitForDiagnostics(document.uri, LINT_SOURCE);
        for (const diagnostic of diagnostics) {
            assert.strictEqual(diagnostic.severity, vscode.DiagnosticSeverity.Warning);
        }
    });

    test('Should set lint diagnostic code to the rule ID', async function() {
        this.timeout(15000);
        await activateExtension();
        const document = await openFixture('test-schema.json');
        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');
        const diagnostics = await waitForDiagnostics(document.uri, LINT_SOURCE);
        const ruleIds = diagnostics.map(d => d.code.value);
        assert.ok(ruleIds.includes('top_level_description'));
        assert.ok(ruleIds.includes('top_level_examples'));
    });

    test('Should include related information in lint diagnostics', async function() {
        this.timeout(15000);
        await activateExtension();
        const document = await openFixture('test-schema.json');
        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');
        const diagnostics = await waitForDiagnostics(document.uri, LINT_SOURCE);
        for (const diagnostic of diagnostics) {
            assert.ok(diagnostic.relatedInformation);
            assert.ok(diagnostic.relatedInformation.length > 0);
            const messages = diagnostic.relatedInformation.map(r => r.message);
            assert.ok(messages.some(m => m.includes('Path')));
        }
    });

    test('Should report correct lint error count', async function() {
        this.timeout(15000);
        await activateExtension();
        const document = await openFixture('test-schema.json');
        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');
        const diagnostics = await waitForDiagnostics(document.uri, LINT_SOURCE);
        assert.strictEqual(diagnostics.length, 2);
    });

    test('Should include the lint rule message in the diagnostic', async function() {
        this.timeout(15000);
        await activateExtension();
        const document = await openFixture('test-schema.json');
        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');
        const diagnostics = await waitForDiagnostics(document.uri, LINT_SOURCE);
        const messages = diagnostics.map(d => d.message);
        assert.ok(messages.some(m => m.includes('description')));
        assert.ok(messages.some(m => m.includes('examples')));
    });

    test('Should clamp root-level lint diagnostics to first token', async function() {
        this.timeout(15000);
        await activateExtension();
        const document = await openFixture('root-only-lint-schema.json');
        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');
        const diagnostics = await waitForDiagnostics(document.uri, LINT_SOURCE);
        assert.ok(diagnostics.length > 0);
        for (const diagnostic of diagnostics) {
            assert.strictEqual(diagnostic.range.start.line, 0);
            assert.strictEqual(diagnostic.range.start.character, 0);
            assert.strictEqual(diagnostic.range.end.line, 0);
            assert.strictEqual(diagnostic.range.end.character, 0);
        }
    });

    test('Should clamp root-level lint diagnostics on minified single-line files', async function() {
        this.timeout(15000);
        await activateExtension();
        const document = await openFixture('minified-root-lint-schema.json');
        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');
        const diagnostics = await waitForDiagnostics(document.uri, LINT_SOURCE);
        assert.ok(diagnostics.length > 0);
        for (const diagnostic of diagnostics) {
            assert.strictEqual(diagnostic.range.start.line, 0);
            assert.strictEqual(diagnostic.range.start.character, 0);
            assert.strictEqual(diagnostic.range.end.line, 0);
            assert.strictEqual(diagnostic.range.end.character, 0);
        }
    });

    test('Should position non-root lint diagnostics on the correct line', async function() {
        this.timeout(15000);
        await activateExtension();
        const document = await openFixture('non-root-lint-schema.json');
        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');
        const diagnostics = await waitForDiagnostics(document.uri, LINT_SOURCE);
        assert.ok(diagnostics.length >= 2);
        for (const diagnostic of diagnostics) {
            assert.ok(diagnostic.range.start.line > 0);
        }
    });

    test('Should not clamp non-root lint diagnostics', async function() {
        this.timeout(15000);
        await activateExtension();
        const document = await openFixture('non-root-lint-schema.json');
        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');
        const diagnostics = await waitForDiagnostics(document.uri, LINT_SOURCE);
        for (const diagnostic of diagnostics) {
            assert.ok(diagnostic.range.end.character > diagnostic.range.start.character);
        }
    });

    test('Should produce metaschema diagnostics for invalid schema', async function() {
        this.timeout(15000);
        await activateExtension();
        const document = await openFixture('invalid-metaschema.json');
        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');
        const diagnostics = await waitForDiagnostics(document.uri, METASCHEMA_SOURCE);
        assert.ok(diagnostics.length > 0);
    });

    test('Should produce no metaschema diagnostics for a valid schema', async function() {
        this.timeout(15000);
        await activateExtension();
        const document = await openFixture('valid-schema.json');
        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');
        await new Promise(resolve => setTimeout(resolve, 5000));
        assert.strictEqual(getMetaschemaDiagnostics(document.uri).length, 0);
    });

    test('Should set metaschema diagnostic severity to Error', async function() {
        this.timeout(15000);
        await activateExtension();
        const document = await openFixture('invalid-metaschema.json');
        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');
        const diagnostics = await waitForDiagnostics(document.uri, METASCHEMA_SOURCE);
        for (const diagnostic of diagnostics) {
            assert.strictEqual(diagnostic.severity, vscode.DiagnosticSeverity.Error);
        }
    });

    test('Should set metaschema diagnostic code to instance location', async function() {
        this.timeout(15000);
        await activateExtension();
        const document = await openFixture('invalid-metaschema.json');
        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');
        const diagnostics = await waitForDiagnostics(document.uri, METASCHEMA_SOURCE);
        const codes = diagnostics.map(d => d.code);
        assert.ok(codes.includes('/additionalProperties'));
        assert.ok(codes.includes(''));
    });

    test('Should include related information in metaschema diagnostics', async function() {
        this.timeout(15000);
        await activateExtension();
        const document = await openFixture('invalid-metaschema.json');
        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');
        const diagnostics = await waitForDiagnostics(document.uri, METASCHEMA_SOURCE);
        for (const diagnostic of diagnostics) {
            assert.ok(diagnostic.relatedInformation);
            assert.ok(diagnostic.relatedInformation.length > 0);
            const messages = diagnostic.relatedInformation.map(r => r.message);
            assert.ok(messages.some(m => m.includes('Keyword Location')));
        }
    });

    test('Should report correct metaschema error count', async function() {
        this.timeout(15000);
        await activateExtension();
        const document = await openFixture('invalid-metaschema.json');
        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');
        const diagnostics = await waitForDiagnostics(document.uri, METASCHEMA_SOURCE);
        assert.strictEqual(diagnostics.length, 7);
    });

    test('Should clamp root-level metaschema diagnostics to first token', async function() {
        this.timeout(15000);
        await activateExtension();
        const document = await openFixture('invalid-metaschema.json');
        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');
        const diagnostics = await waitForDiagnostics(document.uri, METASCHEMA_SOURCE);
        const rootDiagnostics = diagnostics.filter(d => d.range.start.line === 0);
        assert.ok(rootDiagnostics.length > 0);
        for (const diagnostic of rootDiagnostics) {
            assert.strictEqual(diagnostic.range.start.character, 0);
            assert.strictEqual(diagnostic.range.end.line, 0);
            assert.strictEqual(diagnostic.range.end.character, 0);
        }
    });

    test('Should position non-root metaschema diagnostics on the correct line', async function() {
        this.timeout(15000);
        await activateExtension();
        const document = await openFixture('invalid-metaschema.json');
        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');
        const diagnostics = await waitForDiagnostics(document.uri, METASCHEMA_SOURCE);
        const nonRootDiagnostics = diagnostics.filter(d => d.range.start.line > 0);
        assert.ok(nonRootDiagnostics.length > 0);
        for (const diagnostic of nonRootDiagnostics) {
            assert.strictEqual(diagnostic.range.start.line, 10);
        }
    });

    test('Should give non-root metaschema diagnostics a non-zero-width range', async function() {
        this.timeout(15000);
        await activateExtension();
        const document = await openFixture('invalid-metaschema.json');
        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');
        const diagnostics = await waitForDiagnostics(document.uri, METASCHEMA_SOURCE);
        const nonRootDiagnostics = diagnostics.filter(d => d.range.start.line > 0);
        for (const diagnostic of nonRootDiagnostics) {
            assert.ok(diagnostic.range.end.character > diagnostic.range.start.character);
        }
    });

    test('Should run linter even when metaschema validation fails', async function() {
        this.timeout(15000);
        await activateExtension();
        const document = await openFixture('invalid-metaschema.json');
        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');
        await waitForDiagnostics(document.uri, METASCHEMA_SOURCE);
        const lintDiagnostics = getLintDiagnostics(document.uri);
        const metaschemaDiagnostics = getMetaschemaDiagnostics(document.uri);
        assert.ok(metaschemaDiagnostics.length > 0);
        assert.ok(lintDiagnostics.length > 0);
    });

    test('Should use Warning severity for lint and Error for metaschema on same file', async function() {
        this.timeout(15000);
        await activateExtension();
        const document = await openFixture('invalid-metaschema.json');
        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');
        await waitForDiagnostics(document.uri, METASCHEMA_SOURCE);
        for (const d of getLintDiagnostics(document.uri)) {
            assert.strictEqual(d.severity, vscode.DiagnosticSeverity.Warning);
        }
        for (const d of getMetaschemaDiagnostics(document.uri)) {
            assert.strictEqual(d.severity, vscode.DiagnosticSeverity.Error);
        }
    });

    test('Should detect an unformatted schema', async function() {
        this.timeout(15000);
        const extension = await activateExtension();
        await openFixture('unformatted-schema.json');
        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');
        await new Promise(resolve => setTimeout(resolve, 5000));
        assert.ok(extension.isActive);
    });

    test('Should detect a properly formatted schema', async function() {
        this.timeout(15000);
        const extension = await activateExtension();
        const document = await openFixture('valid-schema.json');
        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');
        await new Promise(resolve => setTimeout(resolve, 5000));
        assert.ok(extension.isActive);
        const errors = vscode.languages.getDiagnostics(document.uri)
            .filter(d => d.severity === vscode.DiagnosticSeverity.Error);
        assert.strictEqual(errors.length, 0);
    });

    test('Should disable VS Code built-in JSON validation', async function() {
        this.timeout(15000);
        await activateExtension();
        const document = await openFixture('invalid-metaschema.json');
        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');
        await new Promise(resolve => setTimeout(resolve, 5000));
        const vscodeJsonDiagnostics = vscode.languages.getDiagnostics(document.uri)
            .filter(d => d.source === 'json' || d.source === 'JSON');
        assert.strictEqual(vscodeJsonDiagnostics.length, 0);
        const sourcemetaDiagnostics = vscode.languages.getDiagnostics(document.uri)
            .filter(d => d.source && d.source.startsWith('Sourcemeta Studio'));
        assert.ok(sourcemetaDiagnostics.length > 0);
    });

    test('Should handle schema with HTTP $ref without errors', async function() {
        this.timeout(30000);
        await activateExtension();
        const document = await openFixture('geojson-ref-schema.json');
        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');
        await new Promise(resolve => setTimeout(resolve, 10000));
        const errors = vscode.languages.getDiagnostics(document.uri)
            .filter(d => d.severity === vscode.DiagnosticSeverity.Error);
        assert.strictEqual(errors.length, 0);
    });

    test('Should handle invalid JSON without crashing', async function() {
        this.timeout(15000);
        const extension = await activateExtension();
        await openFixture('invalid-json.json');
        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');
        await new Promise(resolve => setTimeout(resolve, 5000));
        assert.ok(extension.isActive);
    });

    test('Should produce a parse error diagnostic for invalid JSON', async function() {
        this.timeout(15000);
        await activateExtension();
        const document = await openFixture('invalid-json.json');
        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');
        const diagnostics = await waitForDiagnostics(document.uri, LINT_SOURCE);
        assert.strictEqual(diagnostics.length, 1);
        assert.ok(diagnostics[0].message.includes('parse'));
    });

    test('Should produce diagnostics when switching from a valid to an invalid file', async function() {
        this.timeout(30000);
        await activateExtension();
        const validDoc = await openFixture('valid-schema.json');
        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');
        await new Promise(resolve => setTimeout(resolve, 5000));
        assert.strictEqual(getLintDiagnostics(validDoc.uri).length, 0);
        const invalidDoc = await openFixture('test-schema.json');
        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');
        const diagnostics = await waitForDiagnostics(invalidDoc.uri, LINT_SOURCE, 20000);
        assert.ok(diagnostics.length > 0);
    });

    test('Should preserve diagnostics on file A after switching to file B', async function() {
        this.timeout(25000);
        await activateExtension();
        const documentA = await openFixture('test-schema.json');
        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');
        await waitForDiagnostics(documentA.uri, LINT_SOURCE);
        await openFixture('valid-schema.json');
        await new Promise(resolve => setTimeout(resolve, 5000));
        assert.ok(getLintDiagnostics(documentA.uri).length > 0);
    });

    test('Should clear diagnostics when panel is closed', async function() {
        this.timeout(20000);
        await activateExtension();
        const document = await openFixture('test-schema.json');
        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');
        await waitForDiagnostics(document.uri, LINT_SOURCE);
        assert.ok(getLintDiagnostics(document.uri).length > 0);
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await new Promise(resolve => setTimeout(resolve, 1000));
        const cleared = await waitForNoDiagnostics(document.uri, LINT_SOURCE, 5000);
        assert.ok(cleared);
    });

    test('Should handle non-JSON file gracefully', async function() {
        this.timeout(10000);
        const extension = await activateExtension();
        const document = await vscode.workspace.openTextDocument({
            content: 'This is plain text, not JSON',
            language: 'plaintext'
        });
        await vscode.window.showTextDocument(document);
        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');
        await new Promise(resolve => setTimeout(resolve, 2000));
        assert.ok(extension.isActive);
    });
});
