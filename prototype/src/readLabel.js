/*
 * readLabel — อ่านข้อความจากรูปฉลากด้วย OCR ในเครื่อง (FR-02 ✓1, ✗5 · ADR-03) · ใช้ในเบราว์เซอร์เท่านั้น
 * คืนได้แค่ "ข้อความดิบ" หรือ "สาเหตุที่อ่านไม่ได้" — การแยกเป็นร่างอยู่ใน labelParser.js (test ได้)
 * ไม่ส่งรูป/ข้อความออกนอกเครื่อง · ไม่เก็บรูป/ข้อความ
 *
 * ทำไมต้องใช้ไฟล์ฝัง (vendor/tesseract-embed/):
 *   เปิดแบบดับเบิลคลิก (file://) เบราว์เซอร์บล็อกการโหลดไฟล์ภาษา/worker ด้วย fetch แต่ <script src> ยังใช้ได้
 *   → ไฟล์ภาษา + core + worker ถูกห่อเป็น .js (base64) และโหลดเฉพาะครั้งแรกที่อ่านฉลาก (~12 MB)
 *   แล้วสร้าง worker จาก blob · ใช้ได้ทั้งดับเบิลคลิกและลิงก์เว็บ
 */
(function (root) {
  'use strict';

  const EMBED_DIR = 'vendor/tesseract-embed/';
  const EMBEDS = ['lang-tha', 'lang-eng', 'core', 'worker'];
  const MAX_SIDE = 2000;   // ย่อรูปมือถือให้อ่านเร็วขึ้น แต่ยังเห็นตัวอักษรเล็กบนฉลาก
  // Tesseract.js 5.1.1: worker อ่านข้อมูลภาษาที่ส่งเป็น bytes ผิดช่อง (t.data แทน t.code) → แก้ในหน่วยความจำ ไม่แก้ไฟล์ vendor
  const WORKER_BUG = 'return"string"==typeof t?t:t.data';
  const WORKER_FIX = 'return"string"==typeof t?t:t.code';

  // ข้อความบนหน้าจอเมื่ออ่านไม่ได้ (FR-02 ✗5)
  const REASON_TEXT = {
    UNSUPPORTED_PAGE: 'เปิดตัวอ่านฉลากในเบราว์เซอร์นี้ไม่ได้ — กรอกข้อมูลยาเองในฟอร์มด้านล่าง',
    UNREADABLE: 'อ่านฉลากไม่ได้ — ลองถ่ายให้ชัดและตรงขึ้น หรือกรอกข้อมูลยาเองในฟอร์มด้านล่าง',
  };

  let embedsLoading = null;   // Promise: โหลดไฟล์ฝังครบ
  let workerReady = null;     // Promise: worker ตัวเดียว ใช้ซ้ำทุกครั้ง (สร้างครั้งแรกใช้เวลาหลายวินาที)
  let progressListener = null;

  const embedded = (name) => root.MM_OCR && typeof root.MM_OCR[name] === 'string';

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('cannot load ' + src));
      document.head.appendChild(s);
    });
  }

  // โหลดซ้ำได้ถ้าครั้งก่อนล้มเหลว (เช่น เน็ตหลุดระหว่างโหลดจากลิงก์เว็บ)
  function retryable(promise, reset) { promise.catch(reset); return promise; }

  function loadEmbeds() {
    if (!embedsLoading) {
      embedsLoading = retryable(
        Promise.all(EMBEDS.map((name) => embedded(name) ? null : loadScript(EMBED_DIR + name + '.js')))
          .then(function () { EMBEDS.forEach(function (name) { if (!embedded(name)) throw new Error('missing embedded ' + name); }); }),
        function () { embedsLoading = null; });
    }
    return embedsLoading;
  }

  function bytes(b64) {
    const s = root.atob(b64), out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  // core + worker (แก้บั๊กแล้ว) รวมเป็นไฟล์เดียวใน blob
  function workerUrl() {
    const src = new TextDecoder().decode(bytes(root.MM_OCR.worker));
    const fixed = src.replace(WORKER_BUG, WORKER_FIX);
    if (fixed === src) throw new Error('Tesseract worker patch not applied — version changed?');
    return URL.createObjectURL(new Blob([bytes(root.MM_OCR.core), '\n', fixed], { type: 'text/javascript' }));
  }

  function getWorker() {
    if (!workerReady) {
      workerReady = retryable(loadEmbeds().then(function () {
        if (!root.Tesseract) throw new Error('Tesseract not loaded — check index.html');
        return root.Tesseract.createWorker([
          { code: 'tha', data: bytes(root.MM_OCR['lang-tha']) },
          { code: 'eng', data: bytes(root.MM_OCR['lang-eng']) },
        ], 1, {
          workerPath: workerUrl(), workerBlobURL: false, cacheMethod: 'none', gzip: false,
          logger: function (m) { if (progressListener) progressListener(m); },
        });
      }), function () { workerReady = null; });
    }
    return workerReady;
  }

  // รูป → canvas (ย่อด้านยาวสุด ≤ MAX_SIDE) · คืน URL ของรูปทุกครั้ง · รูปไม่ถูกเก็บ
  function imageToCanvas(file) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        try {
          const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas);
        } catch (err) { reject(err); } finally { URL.revokeObjectURL(url); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('not an image')); };
      img.src = url;
    });
  }

  /*
   * readLabel(file, onProgress?) → Promise<{ ok: true, text } | { ok: false, reason: 'UNSUPPORTED_PAGE' | 'UNREADABLE' }>
   * ไม่ reject · onProgress(0–100) เรียกระหว่างอ่าน
   */
  function readLabel(file, onProgress) {
    if (!file || typeof file.size !== 'number') return Promise.resolve({ ok: false, reason: 'UNREADABLE' });
    let stage = 'engine';
    progressListener = function (m) {
      if (typeof onProgress === 'function' && m && m.status === 'recognizing text') onProgress(Math.round(m.progress * 100));
    };
    return getWorker()
      .then(function (worker) { stage = 'image'; return imageToCanvas(file).then((canvas) => { stage = 'recognize'; return worker.recognize(canvas); }); })
      .then(function (result) {
        const text = result && result.data && result.data.text;
        return typeof text === 'string' && text.trim() ? { ok: true, text: text } : { ok: false, reason: 'UNREADABLE' };
      }, function (err) {
        console.warn('[readLabel] ' + stage + ' failed', err && err.message);
        return { ok: false, reason: stage === 'engine' ? 'UNSUPPORTED_PAGE' : 'UNREADABLE' };
      })
      .then(function (r) { progressListener = null; return r; });
  }

  root.ReadLabel = { readLabel: readLabel, REASON_TEXT: REASON_TEXT };
})(this);
