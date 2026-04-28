import * as vscode from 'vscode';
import { DiagnosticsProvider } from './providers/diagnosticsProvider';
import { CodeActionProvider } from './providers/codeActionProvider';

export function activate(context: vscode.ExtensionContext) {
  console.log('OBDF Lens is now active!');

  const diagnosticsProvider = new DiagnosticsProvider(context);

  // Register code action provider for .obda and vdb.xml
  const codeActionDisposable = vscode.languages.registerCodeActionsProvider(
    [
      { language: 'obda' },
      { language: 'xml', pattern: '**/vdb.xml' },
    ],
    new CodeActionProvider(),
    { providedCodeActionKinds: CodeActionProvider.providedCodeActionKinds }
  );
  context.subscriptions.push(codeActionDisposable);

  // Watch .obda files
  const obdaWatcher = vscode.workspace.createFileSystemWatcher('**/*.obda');
  obdaWatcher.onDidChange(uri => diagnosticsProvider.validateObda(uri));
  obdaWatcher.onDidCreate(uri => diagnosticsProvider.validateObda(uri));
  obdaWatcher.onDidDelete(uri => diagnosticsProvider.clearAll());
  context.subscriptions.push(obdaWatcher);

  // Watch vdb.xml
  const vdbWatcher = vscode.workspace.createFileSystemWatcher('**/vdb.xml');
  vdbWatcher.onDidChange(uri => diagnosticsProvider.validateVdb(uri));
  vdbWatcher.onDidCreate(uri => diagnosticsProvider.validateVdb(uri));
  context.subscriptions.push(vdbWatcher);

  // Re-validate on open
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(doc => {
      if (doc.fileName.endsWith('.obda')) {
        diagnosticsProvider.validateObda(doc.uri);
      } else if (doc.fileName.endsWith('vdb.xml')) {
        diagnosticsProvider.validateVdb(doc.uri);
      }
    })
  );

  // Re-validate on save
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(doc => {
      if (doc.fileName.endsWith('.obda')) {
        diagnosticsProvider.validateObda(doc.uri);
      } else if (doc.fileName.endsWith('vdb.xml')) {
        diagnosticsProvider.validateVdb(doc.uri);
      }
    })
  );

  // Manual re-validate command
  const validateCmd = vscode.commands.registerCommand('obdf-lens.validate', async () => {
    await diagnosticsProvider.validateAll();
    vscode.window.showInformationMessage('OBDF Lens: Validasi selesai.');
  });
  context.subscriptions.push(validateCmd);

  // Run on startup
  diagnosticsProvider.validateAll();
}

export function deactivate() {}
