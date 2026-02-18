import type { TabType, WebviewState, WebviewToExtensionMessage, Position } from './protocol/types';

interface VSCodeAPI {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare global {
  interface Window {
    acquireVsCodeApi: () => VSCodeAPI;
  }
}

const vsCodeApi = window.acquireVsCodeApi();

function postMessage(message: WebviewToExtensionMessage): void {
  vsCodeApi.postMessage(message);
}

export function openExternal(url: string): void {
  postMessage({ command: 'openExternal', url });
}

export function formatSchema(): void {
  postMessage({ command: 'formatSchema' });
}

export function goToPosition(position: Position): void {
  postMessage({ command: 'goToPosition', position });
}

export function getActiveTab(): TabType | undefined {
  const state = vsCodeApi.getState() as WebviewState | undefined;
  return state?.activeTab;
}

export function setActiveTab(tab: TabType): void {
  vsCodeApi.setState({ activeTab: tab } satisfies WebviewState);
}

export function notifyReady(): void {
  postMessage({ command: 'ready' });
}
