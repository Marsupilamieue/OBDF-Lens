import * as assert from 'assert';
import * as vscode from 'vscode';
import { validateCategoryA } from '../validators/categoryA';
import { validateCategoryB } from '../validators/categoryB';
import { parseVdb } from '../parsers/vdbParser';
import { parseObda } from '../parsers/obdaParser';

const VDB_XML = `
<vdb name="bansos" version="1">
  <model name="vm_penduduk" type="VIRTUAL">
    <metadata type="DDL"><![CDATA[
      CREATE VIEW v_penduduk AS
        SELECT nik, nama, tanggal_lahir, pekerjaan, penghasilan
        FROM bansos_db.master_penduduk;
    ]]></metadata>
  </model>
  <model name="vm_eligibility" type="VIRTUAL">
    <metadata type="DDL"><![CDATA[
      CREATE VIEW v_eligibility AS
        SELECT eligibility_id, program_id, nik, status_eligible, validated_at, validated_by
        FROM bansos_db.eligibility;
    ]]></metadata>
  </model>
  <model name="vm_program_bansos" type="VIRTUAL">
    <metadata type="DDL"><![CDATA[
      CREATE VIEW v_program_bansos AS
        SELECT program_id, nama_program AS program_name, CAST(nominal AS BIGINT) AS nominal
        FROM bansos_db.master_program_bansos;
    ]]></metadata>
  </model>
</vdb>`;

suite('Category A Validators', () => {
  const vdbData = parseVdb(VDB_XML);

  test('A1: typo view name → Error diagnostic', () => {
    const obda = `
[MappingDeclaration] @collection [[
mappingId   penduduk-mapping
target      ex:penduduk/{nik} a ex:Penduduk .
source      SELECT nik FROM vm_penduduk.v_pendudukk
]]`;
    const mappings = parseObda(obda);
    const diags = validateCategoryA(mappings, vdbData, '/test.obda', '/vdb.xml');
    assert.ok(diags.length > 0, 'should have diagnostics');
    assert.ok(diags.some((d: vscode.Diagnostic) => String(d.code) === 'A1'), 'should be A1');
    assert.ok(diags[0].message.includes('v_penduduk'), 'should suggest correct view');
  });

  test('A2: wrong model name → Error diagnostic', () => {
    const obda = `
[MappingDeclaration] @collection [[
mappingId   penduduk-mapping
target      ex:penduduk/{nik} a ex:Penduduk .
source      SELECT nik FROM penduduk.v_penduduk
]]`;
    const mappings = parseObda(obda);
    const diags = validateCategoryA(mappings, vdbData, '/test.obda', '/vdb.xml');
    assert.ok(diags.some((d: vscode.Diagnostic) => String(d.code) === 'A2'), 'should be A2');
  });

  test('A4: missing model prefix → Warning', () => {
    const obda = `
[MappingDeclaration] @collection [[
mappingId   penduduk-mapping
target      ex:penduduk/{nik} a ex:Penduduk .
source      SELECT nik FROM v_penduduk
]]`;
    const mappings = parseObda(obda);
    const diags = validateCategoryA(mappings, vdbData, '/test.obda', '/vdb.xml');
    assert.ok(diags.some((d: vscode.Diagnostic) => String(d.code) === 'A4'), 'should be A4');
    assert.ok(
      diags.find((d: vscode.Diagnostic) => String(d.code) === 'A4')!.severity === vscode.DiagnosticSeverity.Warning,
      'should be Warning severity'
    );
  });

  test('no error when model.view is correct', () => {
    const obda = `
[MappingDeclaration] @collection [[
mappingId   penduduk-mapping
target      ex:penduduk/{nik} a ex:Penduduk .
source      SELECT nik FROM vm_penduduk.v_penduduk
]]`;
    const mappings = parseObda(obda);
    const diags = validateCategoryA(mappings, vdbData, '/test.obda', '/vdb.xml');
    assert.strictEqual(diags.length, 0, 'should have no errors');
  });
});

suite('Category B Validators', () => {
  const vdbData = parseVdb(VDB_XML);

  test('B2: typo column name → Error with suggestion', () => {
    const obda = `
[MappingDeclaration] @collection [[
mappingId   eligibility-mapping
target      ex:e/{eligibility_id} a ex:Eligibility .
source      SELECT eligibility_id, status_eligble
            FROM vm_eligibility.v_eligibility
]]`;
    const mappings = parseObda(obda);
    const diags = validateCategoryB(mappings, vdbData, '/test.obda', '/vdb.xml');
    assert.ok(diags.some((d: vscode.Diagnostic) => String(d.code) === 'B2'), 'should be B2');
    assert.ok(diags[0].message.includes('status_eligible'), 'should suggest status_eligible');
  });

  test('B4: raw column name instead of alias → Error', () => {
    const obda = `
[MappingDeclaration] @collection [[
mappingId   program-mapping
target      ex:program/{program_id} a ex:Program .
source      SELECT program_id, nama_program
            FROM vm_program_bansos.v_program_bansos
]]`;
    const mappings = parseObda(obda);
    const diags = validateCategoryB(mappings, vdbData, '/test.obda', '/vdb.xml');
    assert.ok(diags.some((d: vscode.Diagnostic) => String(d.code) === 'B4'), 'should be B4');
    assert.ok(diags[0].message.includes('program_name'), 'should show alias');
  });

  test('B5: placeholder not in SELECT → Error', () => {
    const obda = `
[MappingDeclaration] @collection [[
mappingId   penduduk-mapping
target      ex:penduduk/{nik} a ex:Penduduk ;
              ex:noKK {no_kk}^^xsd:string .
source      SELECT nik, nama
            FROM vm_penduduk.v_penduduk
]]`;
    const mappings = parseObda(obda);
    const diags = validateCategoryB(mappings, vdbData, '/test.obda', '/vdb.xml');
    assert.ok(diags.some((d: vscode.Diagnostic) => String(d.code) === 'B5'), 'should be B5');
  });

  test('no error when all columns are correct', () => {
    const obda = `
[MappingDeclaration] @collection [[
mappingId   penduduk-mapping
target      ex:penduduk/{nik} a ex:Penduduk ;
              ex:nama {nama}^^xsd:string .
source      SELECT nik, nama
            FROM vm_penduduk.v_penduduk
]]`;
    const mappings = parseObda(obda);
    const diags = validateCategoryB(mappings, vdbData, '/test.obda', '/vdb.xml');
    assert.strictEqual(diags.length, 0, 'should have no errors');
  });
});
