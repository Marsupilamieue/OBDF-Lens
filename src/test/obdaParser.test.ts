import * as assert from 'assert';
import { parseObda } from '../parsers/obdaParser';

suite('obdaParser', () => {

  test('parse single mapping with model.view FROM', () => {
    const obda = `
[MappingDeclaration] @collection [[
mappingId   penduduk-mapping
target      ex:penduduk/{nik} a ex:Penduduk ;
              ex:nama {nama}^^xsd:string .
source      SELECT nik, nama
            FROM vm_penduduk.v_penduduk
]]`;
    const result = parseObda(obda);
    assert.strictEqual(result.length, 1);
    const m = result[0];
    assert.strictEqual(m.id, 'penduduk-mapping');
    assert.strictEqual(m.fromModel, 'vm_penduduk');
    assert.strictEqual(m.fromView, 'v_penduduk');
    assert.strictEqual(m.fromRaw, 'vm_penduduk.v_penduduk');
    assert.ok(m.sourceColumns.includes('nik'));
    assert.ok(m.sourceColumns.includes('nama'));
    assert.ok(m.targetPlaceholders.includes('nik'));
    assert.ok(m.targetPlaceholders.includes('nama'));
  });

  test('parse FROM without model prefix (A4 case)', () => {
    const obda = `
[MappingDeclaration] @collection [[
mappingId   penduduk-mapping
target      ex:penduduk/{nik} a ex:Penduduk .
source      SELECT nik FROM v_penduduk
]]`;
    const result = parseObda(obda);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].fromModel, '');
    assert.strictEqual(result[0].fromView, 'v_penduduk');
  });

  test('parse placeholder in target not in SELECT (B5 case)', () => {
    const obda = `
[MappingDeclaration] @collection [[
mappingId   penduduk-mapping
target      ex:penduduk/{nik} a ex:Penduduk ;
              ex:noKK {no_kk}^^xsd:string .
source      SELECT nik, nama
            FROM vm_penduduk.v_penduduk
]]`;
    const result = parseObda(obda);
    assert.strictEqual(result.length, 1);
    assert.ok(result[0].targetPlaceholders.includes('no_kk'));
    assert.ok(!result[0].sourceColumns.includes('no_kk'));
  });

  test('parse multiple mappings', () => {
    const obda = `
[MappingDeclaration] @collection [[
mappingId   penduduk-mapping
target      ex:penduduk/{nik} a ex:Penduduk .
source      SELECT nik FROM vm_penduduk.v_penduduk

mappingId   wilayah-mapping
target      ex:wilayah/{wilayah_id} a ex:Wilayah .
source      SELECT wilayah_id FROM vm_wilayah.v_wilayah
]]`;
    const result = parseObda(obda);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].id, 'penduduk-mapping');
    assert.strictEqual(result[1].id, 'wilayah-mapping');
  });
});
