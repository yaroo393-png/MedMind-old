/*
 * qrCode — แปลงรหัสเชิญ ↔ QR (FR-01 ✓1, ✓3 · BR-01) · ไม่แตะ DOM จึง test ด้วย node ได้
 * QR บรรจุแค่ "MEDMIND:<รหัส 6 หลัก>" — ไม่มีข้อมูลส่วนตัว · QR อื่นที่ไม่ใช่รูปแบบนี้ = ไม่ใช่ของเรา (คืน null ไม่เดา)
 * ใช้ jsQR (อ่าน) และ qrcode-generator (สร้าง) จาก prototype/vendor/
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.QrCode = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const PREFIX = 'MEDMIND:';
  const PATTERN = /^MEDMIND:(\d{6})$/;

  // เบราว์เซอร์: ไลบรารีโหลดด้วย <script> ใน index.html · node: require จาก vendor
  function lib(globalName, path) {
    if (typeof window !== 'undefined' && typeof window[globalName] === 'function') return window[globalName];
    if (typeof require === 'function') return require(path);
    throw new Error(globalName + ' not loaded — check index.html');
  }
  const decoder = () => lib('jsQR', '../vendor/jsqr/jsQR.js');
  const encoder = () => lib('qrcode', '../vendor/qrcode/qrcode.js');

  function qrText(code) {
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw new TypeError('code must be a string of exactly 6 digits');
    return PREFIX + code;
  }

  // ข้อความที่อ่านได้จาก QR → รหัส 6 หลัก · ไม่ใช่ QR ของ MedMind → null
  function codeFromText(text) {
    const m = typeof text === 'string' ? PATTERN.exec(text.trim()) : null;
    return m ? m[1] : null;
  }

  // ตาราง QR (true = ช่องดำ) ให้หน้าจอวาดลง canvas เอง · ระดับแก้ผิด M (ทนรอยนิ้ว/แสงสะท้อนบนจอ)
  function qrMatrix(code) {
    const qr = encoder()(0, 'M');   // 0 = เลือกขนาดเล็กสุดที่พอ
    qr.addData(qrText(code));
    qr.make();
    const n = qr.getModuleCount(), rows = [];
    for (let r = 0; r < n; r++) {
      const row = [];
      for (let c = 0; c < n; c++) row.push(qr.isDark(r, c));
      rows.push(row);
    }
    return rows;
  }

  // imageData = { data: RGBA, width, height } (จาก canvas) → รหัส 6 หลัก | null
  function readQr(imageData) {
    if (!imageData || !imageData.data || !(imageData.width > 0) || !(imageData.height > 0)) {
      throw new TypeError('imageData must have data, width and height');
    }
    const found = decoder()(imageData.data, imageData.width, imageData.height);
    return found ? codeFromText(found.data) : null;
  }

  return { PREFIX: PREFIX, qrText: qrText, codeFromText: codeFromText, qrMatrix: qrMatrix, readQr: readQr };
});
