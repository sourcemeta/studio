import * as vscode from 'vscode';
import { DiagnosticType } from '../types';
import { LintError, CliError, MetaschemaError, Position } from '../../../protocol/types';
import { errorPositionToRange } from '../utils/fileUtils';

/**
 * Manages VS Code diagnostics for lint and metaschema errors
 */
export class DiagnosticManager {
    private lintDiagnostics: vscode.DiagnosticCollection;
    private metaschemaDiagnostics: vscode.DiagnosticCollection;

    constructor() {
        this.lintDiagnostics = vscode.languages.createDiagnosticCollection('sourcemeta-studio-lint');
        this.metaschemaDiagnostics = vscode.languages.createDiagnosticCollection('sourcemeta-studio-metaschema');
    }

    /**
     * Update diagnostics for a document
     */
    updateDiagnostics(
        documentUri: vscode.Uri,
        errors: LintError[],
        type: DiagnosticType
    ): void {
        const diagnostics = errors
            .filter((error): error is LintError & { position: Position } =>
                error.position !== null)
            .map(error => {
            const range = errorPositionToRange(error.position);

            const diagnostic = new vscode.Diagnostic(
                range,
                error.message,
                type === DiagnosticType.Lint 
                    ? vscode.DiagnosticSeverity.Warning 
                    : vscode.DiagnosticSeverity.Error
            );

            // Set the source
            diagnostic.source = type === DiagnosticType.Lint 
                ? 'Sourcemeta Studio (Lint)' 
                : 'Sourcemeta Studio (Metaschema)';

            if (error.id) {
                diagnostic.code = {
                    value: error.id,
                    // TODO: link to JSON Schema linting rules markdown repo
                    target: vscode.Uri.parse(`https://github.com/Karan-Palan/json-schema-lint-rules/tree/main/docs/${error.id}.md`)
                };
            }

            const relatedInfo: vscode.DiagnosticRelatedInformation[] = [];
            
            if (error.description) {
                relatedInfo.push(
                    new vscode.DiagnosticRelatedInformation(
                        new vscode.Location(documentUri, range),
                        ` ${error.description}`
                    )
                );
            }

            if (error.path) {
                relatedInfo.push(
                    new vscode.DiagnosticRelatedInformation(
                        new vscode.Location(documentUri, range),
                        ` Path: ${error.path}`
                    )
                );
            }

            if (error.schemaLocation) {
                relatedInfo.push(
                    new vscode.DiagnosticRelatedInformation(
                        new vscode.Location(documentUri, range),
                        ` Schema Location: ${error.schemaLocation}`
                    )
                );
            }

            if (relatedInfo.length > 0) {
                diagnostic.relatedInformation = relatedInfo;
            }

            return diagnostic;
        });

        const collection = type === DiagnosticType.Lint 
            ? this.lintDiagnostics 
            : this.metaschemaDiagnostics;
        
        collection.set(documentUri, diagnostics);
    }

    updateMetaschemaDiagnostics(
        documentUri: vscode.Uri,
        errors: (MetaschemaError | CliError)[] | undefined
    ): void {
        if (!errors) {
            this.metaschemaDiagnostics.set(documentUri, []);
            return;
        }

        const diagnostics = errors
            .filter((error): error is MetaschemaError & { instancePosition: Position } => {
                return 'instancePosition' in error && error.instancePosition !== undefined;
            })
            .map(error => {
                const range = errorPositionToRange(error.instancePosition);

                const diagnostic = new vscode.Diagnostic(
                    range,
                    error.error,
                    vscode.DiagnosticSeverity.Error
                );

                diagnostic.source = 'Sourcemeta Studio (Metaschema)';

                if (error.instanceLocation !== undefined) {
                    diagnostic.code = error.instanceLocation;
                }

                const relatedInfo: vscode.DiagnosticRelatedInformation[] = [];
                
                if (error.instanceLocation) {
                    relatedInfo.push(
                        new vscode.DiagnosticRelatedInformation(
                            new vscode.Location(documentUri, range),
                            ` Instance Location: ${error.instanceLocation}`
                        )
                    );
                }

                if (error.keywordLocation) {
                    relatedInfo.push(
                        new vscode.DiagnosticRelatedInformation(
                            new vscode.Location(documentUri, range),
                            ` Keyword Location: ${error.keywordLocation}`
                        )
                    );
                }

                if (error.absoluteKeywordLocation) {
                    relatedInfo.push(
                        new vscode.DiagnosticRelatedInformation(
                            new vscode.Location(documentUri, range),
                            ` Absolute Keyword Location: ${error.absoluteKeywordLocation}`
                        )
                    );
                }

                if (relatedInfo.length > 0) {
                    diagnostic.relatedInformation = relatedInfo;
                }

                return diagnostic;
            });

        this.metaschemaDiagnostics.set(documentUri, diagnostics);
    }

    /**
     * Clear diagnostics for a document
     */
    clearDiagnostics(documentUri: vscode.Uri, type?: DiagnosticType): void {
        if (!type || type === DiagnosticType.Lint) {
            this.lintDiagnostics.delete(documentUri);
        }
        if (!type || type === DiagnosticType.Metaschema) {
            this.metaschemaDiagnostics.delete(documentUri);
        }
    }

    /**
     * Clear all diagnostics
     */
    clearAll(): void {
        this.lintDiagnostics.clear();
        this.metaschemaDiagnostics.clear();
    }

    /**
     * Dispose of the diagnostic collections
     */
    dispose(): void {
        this.lintDiagnostics.dispose();
        this.metaschemaDiagnostics.dispose();
    }

    /**
     * Get the diagnostic collections for registration
     */
    getCollections(): vscode.DiagnosticCollection[] {
        return [this.lintDiagnostics, this.metaschemaDiagnostics];
    }
}
