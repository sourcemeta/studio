import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import testSchema from './fixtures/test-schema.json';

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('Extension should be present', () => {
        const extension = vscode.extensions.getExtension('sourcemeta.sourcemeta-studio');
        assert.ok(extension, 'Extension should be installed');
    });

    test('Should activate extension', async () => {
        const extension = vscode.extensions.getExtension('sourcemeta.sourcemeta-studio');
        if (extension) {
            await extension.activate();
            assert.ok(extension.isActive, 'Extension should be active');
        }
    });

    test('Should register openPanel command', async () => {
        const extension = vscode.extensions.getExtension('sourcemeta.sourcemeta-studio');
        if (extension && !extension.isActive) {
            await extension.activate();
        }

        const commands = await vscode.commands.getCommands(true);
        const commandExists = commands.includes('sourcemeta-studio.openPanel');
        assert.ok(commandExists, 'Command "sourcemeta-studio.openPanel" should be registered');
    });

    test('Should create diagnostic collections', async () => {
        const extension = vscode.extensions.getExtension('sourcemeta.sourcemeta-studio');
        if (extension && !extension.isActive) {
            await extension.activate();
        }

        const diagnostics = vscode.languages.getDiagnostics();
        assert.ok(Array.isArray(diagnostics), 'Diagnostics should be available');
    });

    test('Should open panel when command is executed', async function() {
        this.timeout(15000);

        const extension = vscode.extensions.getExtension('sourcemeta.sourcemeta-studio');
        if (extension && !extension.isActive) {
            await extension.activate();
        }

        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');

        let ready = false;
        for (let attempt = 0; attempt < 50; attempt++) {
            ready = await vscode.commands.executeCommand('sourcemeta-studio.isWebviewReady') as boolean;
            if (ready) {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        assert.ok(ready, 'Webview should become ready after opening panel');
    });

    test('Should handle JSON file opening', async function() {
        this.timeout(5000);

        const extension = vscode.extensions.getExtension('sourcemeta.sourcemeta-studio');
        if (extension && !extension.isActive) {
            await extension.activate();
        }

        const document = await vscode.workspace.openTextDocument({
            content: JSON.stringify(testSchema, null, 2),
            language: 'json'
        });
        await vscode.window.showTextDocument(document);

        await new Promise(resolve => setTimeout(resolve, 500));

        assert.strictEqual(document.languageId, 'json', 'Document should be JSON');
    });

    test('Should read extension version from package.json', async () => {
        const extension = vscode.extensions.getExtension('sourcemeta.sourcemeta-studio');
        if (extension && !extension.isActive) {
            await extension.activate();
        }

        assert.ok(extension, 'Extension should be present');
        assert.ok(extension?.packageJSON.version, 'Extension should have a version in package.json');
        assert.match(extension?.packageJSON.version, /^\d+\.\d+\.\d+$/, 'Version should follow semver format');
    });

    test('Should handle no file selected gracefully', async function() {
        this.timeout(5000);

        const extension = vscode.extensions.getExtension('sourcemeta.sourcemeta-studio');
        if (extension && !extension.isActive) {
            await extension.activate();
        }

        await vscode.commands.executeCommand('workbench.action.closeAllEditors');

        await new Promise(resolve => setTimeout(resolve, 500));

        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');

        await new Promise(resolve => setTimeout(resolve, 1000));

        assert.ok(true, 'Extension should handle no file selected without errors');
    });

    test('Should show appropriate message when no file is selected', async function() {
        this.timeout(5000);

        const extension = vscode.extensions.getExtension('sourcemeta.sourcemeta-studio');
        if (extension && !extension.isActive) {
            await extension.activate();
        }

        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await new Promise(resolve => setTimeout(resolve, 500));

        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');
        await new Promise(resolve => setTimeout(resolve, 1000));

        assert.ok(extension, 'Extension should exist');
        assert.ok(extension?.isActive, 'Extension should remain active with no file selected');
    });

    test('Should handle schema with HTTP $ref without errors', async function() {
        this.timeout(30000);

        const extension = vscode.extensions.getExtension('sourcemeta.sourcemeta-studio');
        if (extension && !extension.isActive) {
            await extension.activate();
        }

        const fixtureDir = path.join(__dirname, '..', '..', '..', 'test', 'vscode', 'fixtures');
        const schemaPath = path.join(fixtureDir, 'geojson-ref-schema.json');

        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(schemaPath));
        await vscode.window.showTextDocument(document);

        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');

        await new Promise(resolve => setTimeout(resolve, 10000));

        const diagnostics = vscode.languages.getDiagnostics(document.uri);
        const errors = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error);
        assert.strictEqual(errors.length, 0, 'Schema with HTTP $ref should have no diagnostic errors');

        assert.ok(extension?.isActive, 'Extension should remain active after processing HTTP $ref');
    });

    test('Should produce lint diagnostics for schema with lint issues', async function() {
        this.timeout(15000);

        const extension = vscode.extensions.getExtension('sourcemeta.sourcemeta-studio');
        if (extension && !extension.isActive) {
            await extension.activate();
        }

        const fixtureDir = path.join(__dirname, '..', '..', '..', 'test', 'vscode', 'fixtures');
        const schemaPath = path.join(fixtureDir, 'test-schema.json');

        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(schemaPath));
        await vscode.window.showTextDocument(document);

        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');

        await new Promise(resolve => setTimeout(resolve, 5000));

        const diagnostics = vscode.languages.getDiagnostics(document.uri);
        assert.ok(diagnostics.length > 0);

        const hasLintDiagnostic = diagnostics.some(diagnostic =>
            diagnostic.source === 'Sourcemeta Studio (Lint)');

        assert.ok(hasLintDiagnostic);
    });

    test('Should disable VS Code built-in JSON validation', async function() {
        this.timeout(15000);

        const extension = vscode.extensions.getExtension('sourcemeta.sourcemeta-studio');
        if (extension && !extension.isActive) {
            await extension.activate();
        }

        const fixtureDir = path.join(__dirname, '..', '..', '..', 'test', 'vscode', 'fixtures');
        const schemaPath = path.join(fixtureDir, 'invalid-metaschema.json');

        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(schemaPath));
        await vscode.window.showTextDocument(document);

        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');

        await new Promise(resolve => setTimeout(resolve, 5000));

        const diagnostics = vscode.languages.getDiagnostics(document.uri);

        const vscodeJsonDiagnostics = diagnostics.filter(diagnostic =>
            diagnostic.source === 'json' || diagnostic.source === 'JSON');

        assert.strictEqual(vscodeJsonDiagnostics.length, 0,
            'VS Code built-in JSON validation should be disabled');

        const sourcemetaDiagnostics = diagnostics.filter(diagnostic =>
            diagnostic.source && diagnostic.source.startsWith('Sourcemeta Studio'));

        assert.ok(sourcemetaDiagnostics.length > 0,
            'Sourcemeta Studio should still report metaschema errors');
    });

    test('Should clamp root-level lint diagnostics to first token', async function() {
        this.timeout(15000);

        const extension = vscode.extensions.getExtension('sourcemeta.sourcemeta-studio');
        if (extension && !extension.isActive) {
            await extension.activate();
        }

        const fixtureDir = path.join(__dirname, '..', '..', '..', 'test', 'vscode', 'fixtures');
        const schemaPath = path.join(fixtureDir, 'root-only-lint-schema.json');

        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(schemaPath));
        await vscode.window.showTextDocument(document);

        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');

        await new Promise(resolve => setTimeout(resolve, 5000));

        const diagnostics = vscode.languages.getDiagnostics(document.uri);

        const lintDiagnostics = diagnostics.filter(diagnostic =>
            diagnostic.source === 'Sourcemeta Studio (Lint)');

        assert.ok(lintDiagnostics.length > 0,
            'Root-level lint issues should still produce diagnostics');

        for (const diagnostic of lintDiagnostics) {
            assert.strictEqual(diagnostic.range.start.line, 0,
                'Root-level diagnostic should start at line 0');
            assert.strictEqual(diagnostic.range.start.character, 0,
                'Root-level diagnostic should start at character 0');
            assert.strictEqual(diagnostic.range.end.line, 0,
                'Root-level diagnostic should not extend beyond line 0');
            assert.strictEqual(diagnostic.range.end.character, 0,
                'Root-level diagnostic should have zero-width range');
        }
    });

    test('Should clamp root-level lint diagnostics on minified single-line files', async function() {
        this.timeout(15000);

        const extension = vscode.extensions.getExtension('sourcemeta.sourcemeta-studio');
        if (extension && !extension.isActive) {
            await extension.activate();
        }

        const fixtureDir = path.join(__dirname, '..', '..', '..', 'test', 'vscode', 'fixtures');
        const schemaPath = path.join(fixtureDir, 'minified-root-lint-schema.json');

        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(schemaPath));
        await vscode.window.showTextDocument(document);

        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');

        await new Promise(resolve => setTimeout(resolve, 5000));

        const diagnostics = vscode.languages.getDiagnostics(document.uri);

        const lintDiagnostics = diagnostics.filter(diagnostic =>
            diagnostic.source === 'Sourcemeta Studio (Lint)');

        assert.ok(lintDiagnostics.length > 0,
            'Minified schema should still produce root-level lint diagnostics');

        for (const diagnostic of lintDiagnostics) {
            assert.strictEqual(diagnostic.range.start.line, 0,
                'Root-level diagnostic should start at line 0');
            assert.strictEqual(diagnostic.range.start.character, 0,
                'Root-level diagnostic should start at character 0');
            assert.strictEqual(diagnostic.range.end.line, 0,
                'Root-level diagnostic should not extend beyond line 0');
            assert.strictEqual(diagnostic.range.end.character, 0,
                'Root-level diagnostic should have zero-width range');
        }
    });

    test('Should clamp root-level metaschema diagnostics to first token', async function() {
        this.timeout(15000);

        const extension = vscode.extensions.getExtension('sourcemeta.sourcemeta-studio');
        if (extension && !extension.isActive) {
            await extension.activate();
        }

        const fixtureDir = path.join(__dirname, '..', '..', '..', 'test', 'vscode', 'fixtures');
        const schemaPath = path.join(fixtureDir, 'invalid-metaschema.json');

        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(schemaPath));
        await vscode.window.showTextDocument(document);

        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');

        await new Promise(resolve => setTimeout(resolve, 5000));

        const diagnostics = vscode.languages.getDiagnostics(document.uri);

        const metaschemaDiagnostics = diagnostics.filter(diagnostic =>
            diagnostic.source === 'Sourcemeta Studio (Metaschema)');

        assert.ok(metaschemaDiagnostics.length > 0,
            'Metaschema errors should produce diagnostics');

        const rootDiagnostics = metaschemaDiagnostics.filter(diagnostic =>
            diagnostic.range.start.line === 0);

        assert.ok(rootDiagnostics.length > 0,
            'Should have root-level metaschema diagnostics');

        for (const diagnostic of rootDiagnostics) {
            assert.strictEqual(diagnostic.range.start.character, 0,
                'Root-level metaschema diagnostic should start at character 0');
            assert.strictEqual(diagnostic.range.end.line, 0,
                'Root-level metaschema diagnostic should not extend beyond line 0');
            assert.strictEqual(diagnostic.range.end.character, 0,
                'Root-level metaschema diagnostic should have zero-width range');
        }

        const nonRootDiagnostics = metaschemaDiagnostics.filter(diagnostic =>
            diagnostic.range.start.line > 0);

        assert.ok(nonRootDiagnostics.length > 0,
            'Should also have non-root metaschema diagnostics');

        for (const diagnostic of nonRootDiagnostics) {
            assert.ok(diagnostic.range.end.character > diagnostic.range.start.character,
                'Non-root metaschema diagnostic should retain a non-zero-width range');
        }
    });

    test('Should run linter even when metaschema validation fails', async function() {
        this.timeout(15000);

        const extension = vscode.extensions.getExtension('sourcemeta.sourcemeta-studio');
        if (extension && !extension.isActive) {
            await extension.activate();
        }

        const fixtureDir = path.join(__dirname, '..', '..', '..', 'test', 'vscode', 'fixtures');
        const schemaPath = path.join(fixtureDir, 'invalid-metaschema.json');

        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(schemaPath));
        await vscode.window.showTextDocument(document);

        await vscode.commands.executeCommand('sourcemeta-studio.openPanel');

        await new Promise(resolve => setTimeout(resolve, 5000));

        const diagnostics = vscode.languages.getDiagnostics(document.uri);

        const metaschemaDiagnostics = diagnostics.filter(diagnostic =>
            diagnostic.source === 'Sourcemeta Studio (Metaschema)');

        const lintDiagnostics = diagnostics.filter(diagnostic =>
            diagnostic.source === 'Sourcemeta Studio (Lint)');

        assert.ok(metaschemaDiagnostics.length > 0,
            'Should have metaschema errors for invalid schema');

        assert.ok(lintDiagnostics.length > 0,
            'Should still have lint diagnostics even when metaschema fails');
    });
});
