import * as vscode from 'vscode';
import { DiagnosticsProvider } from './providers/diagnosticsProvider';
import { CodeActionProvider } from './providers/codeActionProvider';
import { isVdbXml } from './utils/vdbPaths';

async function bootstrap(diagnosticsProvider: DiagnosticsProvider): Promise<void> {
  if (!vscode.workspace.workspaceFolders?.length) {
    console.log('OBDF Lens: no workspace folder open — open a folder containing vdb.xml');
    return;
  }

  await diagnosticsProvider.validateAll();
  await diagnosticsProvider.validateOpenDocuments();
}

export function activate(context: vscode.ExtensionContext) {
  console.log('OBDF Lens is now active!');

  const diagnosticsProvider = new DiagnosticsProvider(context);

  const codeActionDisposable = vscode.languages.registerCodeActionsProvider(
    [
      { language: 'obda' },
      { language: 'xml' },
    ],
    new CodeActionProvider(),
    { providedCodeActionKinds: CodeActionProvider.providedCodeActionKinds }
  );
  context.subscriptions.push(codeActionDisposable);

  const obdaWatcher = vscode.workspace.createFileSystemWatcher('**/*.obda');
  obdaWatcher.onDidChange(uri => { void diagnosticsProvider.validateObda(uri); });
  obdaWatcher.onDidCreate(uri => { void diagnosticsProvider.validateObda(uri); });
  obdaWatcher.onDidDelete(() => { void diagnosticsProvider.validateAll(); });
  context.subscriptions.push(obdaWatcher);

  const vdbWatcher = vscode.workspace.createFileSystemWatcher('**/vdb.xml');
  vdbWatcher.onDidChange(uri => { void diagnosticsProvider.validateVdb(uri); });
  vdbWatcher.onDidCreate(uri => { void diagnosticsProvider.validateVdb(uri); });
  vdbWatcher.onDidDelete(() => { void diagnosticsProvider.validateAll(); });
  context.subscriptions.push(vdbWatcher);

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(doc => {
      if (doc.fileName.endsWith('.obda')) {
        void diagnosticsProvider.validateObda(doc.uri);
      } else if (isVdbXml(doc.uri)) {
        void diagnosticsProvider.validateVdb(doc.uri);
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(doc => {
      if (doc.fileName.endsWith('.obda')) {
        void diagnosticsProvider.validateObda(doc.uri);
      } else if (isVdbXml(doc.uri)) {
        void diagnosticsProvider.validateVdb(doc.uri);
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('obdf-lens.connections')) {
        void diagnosticsProvider.validateAll();
      }
    })
  );

  const validateCmd = vscode.commands.registerCommand('obdf-lens.validate', async () => {
    await diagnosticsProvider.validateAll();
    await diagnosticsProvider.validateOpenDocuments();
    vscode.window.showInformationMessage('OBDF Lens: Validasi selesai.');
  });
  context.subscriptions.push(validateCmd);

  void bootstrap(diagnosticsProvider);
}

export function deactivate() {}
