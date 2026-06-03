export interface VdbView {
  name: string;
  exposedColumns: string[];
  aliasMap: Record<string, string>;
  sourceName: string;  // seperti bansos_db
  tableName: string;   // seperti master_penduduk
  ddl: string;
  viewLine: number;
  viewDdlStartChar: number;
}

export interface VdbModel {
  name: string;
  views: VdbView[];
  modelLine: number; 
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
  targetPlaceholders: string[];  // {nik}, {nama}
  sourceQuery: string;
  sourceLine: number;
  sourceFirstLineOffset: number;
  sourceLineOffsets: number[];
  sourceColumns: string[];      
  fromModel: string;             // vm_penduduk
  fromView: string;              // v_penduduk
  fromRaw: string;               // vm_penduduk.v_penduduk / v_penduduk
  fromLine: number;
  fromStartChar: number;
  fromEndChar: number;
}

export interface FixEdit {
  uri: string;  // path
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
