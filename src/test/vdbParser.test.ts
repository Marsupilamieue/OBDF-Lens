import * as assert from 'assert';
import { parseVdb } from '../parsers/vdbParser';

suite('vdbParser', () => {

  test('parse single virtual model with one view', () => {
    const xml = `
<vdb name="bansos" version="1">
  <model name="vm_penduduk" type="VIRTUAL">
    <metadata type="DDL"><![CDATA[
      CREATE VIEW v_penduduk AS
        SELECT nik, nama, tanggal_lahir, pekerjaan, penghasilan
        FROM bansos_db.master_penduduk;
    ]]></metadata>
  </model>
</vdb>`;
    const result = parseVdb(xml);
    assert.strictEqual(result.models.length, 1);
    const model = result.models[0];
    assert.strictEqual(model.name, 'vm_penduduk');
    assert.strictEqual(model.views.length, 1);
    const view = model.views[0];
    assert.strictEqual(view.name, 'v_penduduk');
    assert.ok(view.exposedColumns.includes('nik'));
    assert.ok(view.exposedColumns.includes('nama'));
    assert.ok(view.exposedColumns.includes('penghasilan'));
    assert.strictEqual(view.sourceName, 'bansos_db');
    assert.strictEqual(view.tableName, 'master_penduduk');
  });

  test('parse aliased column - aliasMap populated', () => {
    const xml = `
<vdb name="bansos" version="1">
  <model name="vm_program" type="VIRTUAL">
    <metadata type="DDL"><![CDATA[
      CREATE VIEW v_program_bansos AS
        SELECT program_id, nama_program AS program_name, CAST(nominal AS BIGINT) AS nominal
        FROM bansos_db.master_program_bansos;
    ]]></metadata>
  </model>
</vdb>`;
    const result = parseVdb(xml);
    const view = result.models[0].views[0];
    assert.ok(view.exposedColumns.includes('program_name'), 'alias should be exposed');
    assert.ok(!view.exposedColumns.includes('nama_program'), 'raw name should NOT be exposed');
    assert.strictEqual(view.aliasMap['nama_program'], 'program_name');
  });

  test('parse physical source', () => {
    const xml = `
<vdb name="bansos" version="1">
  <model name="bansos_db" type="PHYSICAL">
    <source name="bansos_db" translator-name="postgresql" connection-jndi-name="java:/bansos-ds"/>
  </model>
</vdb>`;
    const result = parseVdb(xml);
    assert.strictEqual(result.sources.length, 1);
    assert.strictEqual(result.sources[0].name, 'bansos_db');
    assert.strictEqual(result.sources[0].translatorName, 'postgresql');
  });

  test('parse multiple models', () => {
    const xml = `
<vdb name="bansos" version="1">
  <model name="vm_penduduk" type="VIRTUAL">
    <metadata type="DDL"><![CDATA[
      CREATE VIEW v_penduduk AS SELECT nik, nama FROM bansos_db.master_penduduk;
    ]]></metadata>
  </model>
  <model name="vm_wilayah" type="VIRTUAL">
    <metadata type="DDL"><![CDATA[
      CREATE VIEW v_wilayah AS SELECT wilayah_id, provinsi FROM bansos_db.master_wilayah;
    ]]></metadata>
  </model>
</vdb>`;
    const result = parseVdb(xml);
    assert.strictEqual(result.models.length, 2);
    assert.ok(result.models.some((m: any) => m.name === 'vm_penduduk'));
    assert.ok(result.models.some((m: any) => m.name === 'vm_wilayah'));
  });
});
