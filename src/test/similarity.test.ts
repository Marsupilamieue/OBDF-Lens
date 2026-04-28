import * as assert from 'assert';
import { similarity, findClosest } from '../utils/similarity';

suite('similarity', () => {

  test('identical strings → 1.0', () => {
    assert.strictEqual(similarity('v_penduduk', 'v_penduduk'), 1.0);
  });

  test('completely different → low score', () => {
    assert.ok(similarity('abc', 'xyz') < 0.4);
  });

  test('typo double-k → high similarity', () => {
    const score = similarity('v_pendudukk', 'v_penduduk');
    assert.ok(score >= 0.9, `expected >= 0.9, got ${score}`);
  });

  test('findClosest returns best match above threshold', () => {
    const result = findClosest('v_pendudukk', ['v_penduduk', 'v_wilayah', 'v_keluarga']);
    assert.ok(result);
    assert.strictEqual(result!.match, 'v_penduduk');
  });

  test('findClosest returns undefined when nothing close enough', () => {
    const result = findClosest('zzz_totally_different', ['v_penduduk', 'v_wilayah'], 0.8);
    assert.strictEqual(result, undefined);
  });

  test('status_eligble → status_eligible', () => {
    const result = findClosest('status_eligble', ['eligibility_id', 'status_eligible', 'validated_at']);
    assert.ok(result);
    assert.strictEqual(result!.match, 'status_eligible');
  });
});
