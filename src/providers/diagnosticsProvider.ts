import * as vscode from 'vscode';
import * as fs from 'fs';
import { parseVdb } from '../parsers/vdbParser';
import { parseObda } from '../parsers/obdaParser';
import { validateCategoryA } from '../validators/categoryA';
import { validateCategoryB } from '../validators/categoryB';
import { validateCategoryC } from '../validators/categoryC';
import { VdbData } from '../types';

export class DiagnosticsProvider {
  private obdaCollection: vscode.DiagnosticCollection;
  private vdbCollection: vscode.DiagnosticCollection;

  constructor(private context: vscode.ExtensionContext) {
    this.obdaCollection = vscode.languages.createDiagnosticCollection('obdf-lens-obda');
    this.vdbCollection = vscode.languages.createDiagnosticCollection('obdf-lens-vdb');
    context.subscriptions.push(this.obdaCollection, this.vdbCollection);
  }

  private async findVdb(): Promise<vscode.Uri | undefined> {
    const files = await vscode.workspace.findFiles('**/vdb.xml', '**/node_modules/**', 5);
    return files[0];
  }

  private async findObdaFiles(): Promise<vscode.Uri[]> {
    return vscode.workspace.findFiles('**/*.obda', '**/node_modules/**');
  }

  private parseVdbFile(uri: vscode.Uri): VdbData | null {
    try {
      const text = fs.readFileSync(uri.fsPath, 'utf8');
      return parseVdb(text);
    } catch {
      return null;
    }
  }

  async validateObda(obdaUri: vscode.Uri): Promise<void> {
    const vdbUri = await this.findVdb();
    if (!vdbUri) {
      this.obdaCollection.set(obdaUri, []);
      return;
    }

    const vdbData = this.parseVdbFile(vdbUri);
    if (!vdbData) {
      this.obdaCollection.set(obdaUri, []);
      return;
    }

    const obdaText = fs.readFileSync(obdaUri.fsPath, 'utf8');
    const mappings = parseObda(obdaText);

    const diagsA = validateCategoryA(
      mappings, vdbData,
      obdaUri.fsPath, vdbUri.fsPath
    );
    const diagsB = validateCategoryB(mappings, vdbData, obdaUri.fsPath, vdbUri.fsPath);

    this.obdaCollection.set(obdaUri, [...diagsA, ...diagsB]);
  }

  async validateVdb(vdbUri: vscode.Uri): Promise<void> {
    const vdbData = this.parseVdbFile(vdbUri);
    if (!vdbData) {
      this.vdbCollection.set(vdbUri, []);
      return;
    }

    const diagsC = await validateCategoryC(vdbData, vdbUri.fsPath);
    this.vdbCollection.set(vdbUri, diagsC);

    const obdaFiles = await this.findObdaFiles();
    for (const obdaUri of obdaFiles) {
      await this.validateObda(obdaUri);
    }
  }

  async validateAll(): Promise<void> {
    const vdbUri = await this.findVdb();
    if (vdbUri) {
      await this.validateVdb(vdbUri);
    }

    const obdaFiles = await this.findObdaFiles();
    for (const obdaUri of obdaFiles) {
      await this.validateObda(obdaUri);
    }
  }

  clearAll(): void {
    this.obdaCollection.clear();
    this.vdbCollection.clear();
  }
}
