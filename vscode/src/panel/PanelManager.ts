import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PanelState, WebviewToExtensionMessage, ExtensionToWebviewMessage } from '../../../protocol/types';

/**
 * Manages the webview panel lifecycle and content
 */
export class PanelManager {
    private panel: vscode.WebviewPanel | undefined;
    private readonly iconPath: vscode.Uri;
    private readonly extensionPath: string;
    private messageHandler?: (message: WebviewToExtensionMessage) => void;
    private disposeHandler?: () => void;

    constructor(extensionPath: string) {
        this.extensionPath = extensionPath;
        this.iconPath = vscode.Uri.file(path.join(extensionPath, 'logo.png'));
    }

    /**
     * Set the message handler for webview messages
     */
    setMessageHandler(handler: (message: WebviewToExtensionMessage) => void): void {
        this.messageHandler = handler;
    }

    setDisposeHandler(handler: () => void): void {
        this.disposeHandler = handler;
    }

    /**
     * Create or reveal the panel
     */
    createOrReveal(context: vscode.ExtensionContext): vscode.WebviewPanel {
        const columnToShowIn = vscode.window.activeTextEditor
            ? vscode.ViewColumn.Beside
            : vscode.ViewColumn.One;

        if (this.panel) {
            this.panel.reveal(columnToShowIn, true);
            return this.panel;
        }

        this.panel = vscode.window.createWebviewPanel(
            'sourcemetaStudio',
            'Sourcemeta Studio',
            {
                viewColumn: columnToShowIn,
                preserveFocus: false
            },
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(this.extensionPath),
                    vscode.Uri.file(path.join(this.extensionPath, '..', 'build', 'webview'))
                ]
            }
        );

        this.panel.iconPath = this.iconPath;

        // Set initial HTML content
        this.panel.webview.html = this.getHtmlContent(this.panel.webview);

        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage(
            message => {
                if (this.messageHandler) {
                    this.messageHandler(message);
                }
            },
            undefined,
            context.subscriptions
        );

        this.panel.onDidDispose(
            () => {
                this.panel = undefined;
                if (this.disposeHandler) {
                    this.disposeHandler();
                }
            },
            null,
            context.subscriptions
        );

        return this.panel;
    }

    /**
     * Update the panel content (send state to React)
     */
    updateContent(state: PanelState): void {
        if (!this.panel) {
            return;
        }

        const message: ExtensionToWebviewMessage = {
            type: 'update',
            state: state
        };
        this.panel.webview.postMessage(message);
    }

    /**
     * Get HTML content for the webview (load React build)
     */
    private getHtmlContent(_webview: vscode.Webview): string {
        // Try production path first (inside extension directory)
        const productionPath = path.join(this.extensionPath, 'index.html');

        if (fs.existsSync(productionPath)) {
            return fs.readFileSync(productionPath, 'utf-8');
        }

        // Fall back to development path (outside extension directory)
        const devPath = path.join(this.extensionPath, '..', 'build', 'webview', 'index.html');
        return fs.readFileSync(devPath, 'utf-8');
    }

    /**
     * Check if panel exists
     */
    exists(): boolean {
        return this.panel !== undefined;
    }

    /**
     * Get the panel (if it exists)
     */
    getPanel(): vscode.WebviewPanel | undefined {
        return this.panel;
    }

    /**
     * Dispose the panel
     */
    dispose(): void {
        if (this.panel) {
            this.panel.dispose();
            this.panel = undefined;
        }
    }
}
