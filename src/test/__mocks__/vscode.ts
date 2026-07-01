class Range {
  constructor(
    public readonly start: { line: number; character: number },
    public readonly end: { line: number; character: number }
  ) {}

  static fromArgs(startLine: number, startChar: number, endLine: number, endChar: number): Range {
    return new Range({ line: startLine, character: startChar }, { line: endLine, character: endChar });
  }
}

// vscode.Range is called as new Range(startLine, startChar, endLine, endChar)
function RangeConstructor(startLine: number, startChar: number, endLine: number, endChar: number): Range {
  return new Range({ line: startLine, character: startChar }, { line: endLine, character: endChar });
}
(RangeConstructor as any).prototype = Range.prototype;

class Diagnostic {
  public code: string | number | undefined;
  public source: string | undefined;
  public data: unknown;

  constructor(
    public readonly range: Range,
    public readonly message: string,
    public readonly severity: number
  ) {}
}

const DiagnosticSeverity = {
  Error:       0,
  Warning:     1,
  Information: 2,
  Hint:        3,
};

const workspace = {
  getConfiguration: (_section?: string) => ({
    get: <T>(_key: string): T | undefined => undefined,
  }),
};

module.exports = {
  Range: RangeConstructor,
  Diagnostic,
  DiagnosticSeverity,
  workspace,
};
