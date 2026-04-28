import * as vscode from 'vscode';
import { ObdfDiagnosticData, QuickFix } from '../types';

export class CodeActionProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source !== 'OBDF Lens') { continue; }

      const data = (diagnostic as any).data as ObdfDiagnosticData | undefined;
      if (!data?.fixes?.length) { continue; }

      for (const fix of data.fixes) {
        const action = this.createAction(fix, diagnostic);
        if (action) { actions.push(action); }
      }
    }

    return actions;
  }

  private createAction(fix: QuickFix, diagnostic: vscode.Diagnostic): vscode.CodeAction | undefined {
    if (!fix.edits.length) { return undefined; }

    const action = new vscode.CodeAction(fix.title, vscode.CodeActionKind.QuickFix);
    action.diagnostics = [diagnostic];
    action.isPreferred = true;

    const edit = new vscode.WorkspaceEdit();
    for (const e of fix.edits) {
      const uri = vscode.Uri.file(e.uri);
      const editRange = new vscode.Range(e.startLine, e.startChar, e.endLine, e.endChar);
      edit.replace(uri, editRange, e.newText);
    }
    action.edit = edit;

    return action;
  }
}
