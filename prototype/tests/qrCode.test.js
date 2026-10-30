// qrCode: รหัสเชิญ ↔ QR (FR-01 ✓1, ✓3) · รัน: node --test (ที่ root ของ repo)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const QR = require('../src/qrCode.js');
const qrcode = require('../vendor/qrcode/qrcode.js');

// ตาราง QR → ภาพ RGBA (ช่องละ 4 px + ขอบขาว 4 ช่อง) แบบที่ canvas ให้มา
function toImage(matrix, scale = 4, quiet = 4) {
  const n = (matrix.length + quiet * 2) * scale, data = new Uint8ClampedArray(n * n * 4).fill(255);
  matrix.forEach((row, y) => row.forEach((dark, x) => {
    if (!dark) return;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const i = (((y + quiet) * scale + dy) * n + (x + quiet) * scale + dx) * 4;
      data[i] = data[i + 1] = data[i + 2] = 0;
    }
  }));
  return { data: data, width: n, height: n };
}

function matrixOf(text) {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  return Array.from({ length: q.getModuleCount() }, (_, r) => Array.from({ length: q.getModuleCount() }, (_, c) => q.isDark(r, c)));
}

test('QR บรรจุแค่ "MEDMIND:<รหัส>" · รหัสต้องเป็นเลข 6 หลัก', () => {
  assert.equal(QR.qrText('012345'), 'MEDMIND:012345');
  ['12345', '1234567', 'abcdef', 123456].forEach((bad) => assert.throws(() => QR.qrText(bad), TypeError));
});

test('อ่านข้อความจาก QR: เฉพาะรูปแบบของ MedMind', () => {
  assert.equal(QR.codeFromText('MEDMIND:654321'), '654321');
  assert.equal(QR.codeFromText(' MEDMIND:654321\n'), '654321');
  assert.equal(QR.codeFromText('MEDMIND:65432'), null);
  assert.equal(QR.codeFromText('https://example.com/?code=654321'), null);
  assert.equal(QR.codeFromText(null), null);
});

test('QR ที่สร้างบนหน้าผู้สูงอายุ อ่านกลับได้รหัสเดิม (FR-01 ✓1 → ✓3)', () => {
  ['000000', '123456', '987654'].forEach((code) => assert.equal(QR.readQr(toImage(QR.qrMatrix(code))), code));
});

test('QR ของที่อื่น หรือรูปที่ไม่มี QR → null (ไม่จับคู่)', () => {
  assert.equal(QR.readQr(toImage(matrixOf('https://example.com'))), null);
  assert.equal(QR.readQr({ data: new Uint8ClampedArray(64 * 64 * 4).fill(255), width: 64, height: 64 }), null);
});

test('ข้อมูลรูปไม่ครบ → TypeError', () => {
  assert.throws(() => QR.readQr(null), TypeError);
  assert.throws(() => QR.readQr({ data: new Uint8ClampedArray(4), width: 0, height: 1 }), TypeError);
});
