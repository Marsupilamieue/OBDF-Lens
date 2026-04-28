export interface VdbView {
  name: string;
  /** Columns exposed by the view (alias name if aliased, raw name otherwise) */
  exposedColumns: string[];
  /** raw column name → alias name (only entries that are aliased) */
  aliasMap: Record<string, string>;
  sourceName: string;  // e.g., bansos_db
  tableName: string;   // e.g., master_penduduk
  ddl: string;
  viewLine: number;    // 0-indexed line of CREATE VIEW in vdb.xml
  viewDdlStartChar: number; // char offset of CREATE on viewLine
}

export interface VdbModel {
  name: string;
  views: VdbView[];
  modelLine: number;  // 0-indexed
}

export interface VdbSource {
  name: string;
  translatorName: string;
  line: number;
}

export interface VdbData {
  models: VdbModel[];
  sources: VdbSource[];
}

export interface ObdaMapping {
  id: string;
  idLine: number;
  targetTemplate: string;
  targetLine: number;
  targetPlaceholders: string[];  // {nik}, {nama}, ...
  sourceQuery: string;
  sourceLine: number;
  sourceFirstLineOffset: number; // chars stripped from 'source   SELECT...' prefix on first line
  sourceColumns: string[];       // columns listed in SELECT
  fromModel: string;             // vm_penduduk  (empty if not provided)
  fromView: string;              // v_penduduk
  fromRaw: string;               // vm_penduduk.v_penduduk or v_penduduk
  fromLine: number;
  fromStartChar: number;
  fromEndChar: number;
}

export interface FixEdit {
  uri: string;  // absolute file path
  startLine: number;
  startChar: number;
  endLine: number;
  endChar: number;
  newText: string;
}

export interface QuickFix {
  title: string;
  edits: FixEdit[];
}

export interface ObdfDiagnosticData {
  code: string;
  fixes: QuickFix[];
}
