import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export const VDB_FILE_NAME = 'vdb.xml';

export function isVdbXml(uri: vscode.Uri | string): boolean {
  const filePath = typeof uri === 'string' ? uri : uri.fsPath;
  return path.basename(filePath).toLowerCase() === VDB_FILE_NAME;
}

export async function findAllVdbFiles(): Promise<vscode.Uri[]> {
  return vscode.workspace.findFiles(`**/${VDB_FILE_NAME}`, '**/node_modules/**');
}

export function findVdbNearFile(filePath: string): vscode.Uri | undefined {
  let dir = path.dirname(filePath);
  const root = path.parse(dir).root;

  while (dir && dir !== root) {
    const candidate = path.join(dir, VDB_FILE_NAME);
    if (fs.existsSync(candidate)) {
      return vscode.Uri.file(candidate);
    }
    dir = path.dirname(dir);
  }

  return undefined;
}

export async function findVdbForObda(obdaUri: vscode.Uri): Promise<vscode.Uri | undefined> {
  const nearby = findVdbNearFile(obdaUri.fsPath);
  if (nearby) {
    return nearby;
  }

  const all = await findAllVdbFiles();
  return all[0];
}
