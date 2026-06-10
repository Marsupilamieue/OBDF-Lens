import * as vscode from 'vscode';
import * as fs from 'fs';
import { parseVdb } from '../parsers/vdbParser';
import { parseObda } from '../parsers/obdaParser';
import { validateCategoryA } from '../validators/categoryA';
import { validateCategoryB } from '../validators/categoryB';
import { validateCategoryC } from '../validators/categoryC';
import { VdbData } from '../types';
import { findAllVdbFiles, findVdbForObda, isVdbXml } from '../utils/vdbPaths';

function normalizeUri(uri: vscode.Uri): vscode.Uri {
  return vscode.Uri.file(uri.fsPath);
}

export class DiagnosticsProvider {
  private obdaCollection: vscode.DiagnosticCollection;
  private vdbCollection: vscode.DiagnosticCollection;

  constructor(private context: vscode.ExtensionContext) {
    this.obdaCollection = vscode.languages.createDiagnosticCollection('obdf-lens-obda');
    this.vdbCollection = vscode.languages.createDiagnosticCollection('obdf-lens-vdb');
    context.subscriptions.push(this.obdaCollection, this.vdbCollection);
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
    const uri = normalizeUri(obdaUri);
    const vdbUri = await findVdbForObda(uri);
    if (!vdbUri) {
      this.obdaCollection.set(uri, []);
      return;
    }

    const vdbData = this.parseVdbFile(vdbUri);
    if (!vdbData) {
      this.obdaCollection.set(uri, []);
      return;
    }

    const obdaText = fs.readFileSync(uri.fsPath, 'utf8');
    const mappings = parseObda(obdaText);

    const diagsA = validateCategoryA(
      mappings, vdbData,
      uri.fsPath, vdbUri.fsPath
    );
    const diagsB = validateCategoryB(mappings, vdbData, uri.fsPath, vdbUri.fsPath, obdaText);

    this.obdaCollection.set(uri, [...diagsA, ...diagsB]);
  }

  async validateVdb(vdbUri: vscode.Uri): Promise<void> {
    const uri = normalizeUri(vdbUri);
    if (!isVdbXml(uri)) {
      return;
    }

    const vdbData = this.parseVdbFile(uri);
    if (!vdbData) {
      this.vdbCollection.set(uri, []);
      return;
    }

    const diagsC = await validateCategoryC(vdbData, uri.fsPath);
    this.vdbCollection.set(uri, diagsC);

    const obdaFiles = await this.findObdaFiles();
    for (const obdaUri of obdaFiles) {
      const pairedVdb = await findVdbForObda(obdaUri);
      if (pairedVdb?.fsPath === uri.fsPath) {
        await this.validateObda(obdaUri);
      }
    }
  }

  async validateAll(): Promise<void> {
    const vdbFiles = await findAllVdbFiles();
    console.log(`OBDF Lens: found ${vdbFiles.length} vdb.xml file(s)`);

    for (const vdbUri of vdbFiles) {
      await this.validateVdb(vdbUri);
    }

    const obdaFiles = await this.findObdaFiles();
    console.log(`OBDF Lens: found ${obdaFiles.length} .obda file(s)`);

    for (const obdaUri of obdaFiles) {
      await this.validateObda(obdaUri);
    }
  }

  async validateOpenDocuments(): Promise<void> {
    for (const doc of vscode.workspace.textDocuments) {
      if (doc.fileName.endsWith('.obda')) {
        await this.validateObda(doc.uri);
      } else if (isVdbXml(doc.uri)) {
        await this.validateVdb(doc.uri);
      }
    }
  }

  clearAll(): void {
    this.obdaCollection.clear();
    this.vdbCollection.clear();
  }
}
