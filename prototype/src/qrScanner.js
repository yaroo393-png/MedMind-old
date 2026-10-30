/*
 * qrScanner — สแกน QR ด้วยกล้องสด หรือจากรูปในเครื่อง (FR-01 ✓3) · ใช้ในเบราว์เซอร์เท่านั้น
 * การถอดรหัสอยู่ใน qrCode.js · ไฟล์นี้จัดการกล้อง วิดีโอ และรูปเท่านั้น
 *
 * หน้าจอของ prototype วาดใหม่ทั้งก้อน (innerHTML) บ่อย → กล่องวิดีโอเป็น element ถาวรของโมดูลนี้
 * หน้าจอเว้นช่อง <div id="qr-slot"> ไว้ แล้วเรียก mount(slot) หลังวาดทุกครั้ง (ย้าย element เดิม ไม่สร้างกล้องใหม่)
 */
(function (root) {
  'use strict';

  const SCAN_INTERVAL_MS = 200;   // อ่าน 5 ครั้ง/วินาที พอสำหรับถือกล้องเล็ง ไม่กินเครื่อง
  const MAX_FRAME_SIDE = 800;     // ย่อเฟรม/รูปก่อนถอดรหัส ให้เร็วพอบนมือถือ

  let session = null;   // { stream, box, video, timer } ระหว่างเปิดกล้อง

  // กล้องสดใช้ได้เฉพาะหน้า https หรือ localhost (มือถือต้องเปิดผ่านลิงก์เว็บ)
  function canUseCamera() {
    return !!(root.isSecureContext && root.navigator.mediaDevices && root.navigator.mediaDevices.getUserMedia);
  }

  // วาดรูป/เฟรมลง canvas ขนาดพอดี แล้วถอดรหัส → รหัส 6 หลัก | null
  function decode(source, width, height) {
    const scale = Math.min(1, MAX_FRAME_SIDE / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    g.drawImage(source, 0, 0, w, h);
    return root.QrCode.readQr(g.getImageData(0, 0, w, h));
  }

  /*
   * start(onCode, onError) → เปิดกล้องหลัง · เจอ QR ของ MedMind → ปิดกล้องแล้วเรียก onCode(code) ครั้งเดียว
   * เปิดกล้องไม่ได้ (ไม่อนุญาต / ไม่มีกล้อง) → onError(err)
   */
  function start(onCode, onError) {
    stop();
    const video = document.createElement('video');
    video.setAttribute('playsinline', '');   // iOS: เล่นในหน้า ไม่เปิดเต็มจอ
    video.muted = true;
    const box = document.createElement('div');
    box.className = 'scanner';
    box.appendChild(video);
    session = { stream: null, box: box, video: video, timer: null };
    const mine = session;

    root.navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(function (stream) {
        if (session !== mine) { stream.getTracks().forEach((t) => t.stop()); return; }   // ผู้ใช้กดหยุดก่อนกล้องเปิด
        mine.stream = stream;
        video.srcObject = stream;
        video.play().catch(function () {});
        mine.timer = setInterval(function () {
          if (video.readyState < 2 || !video.videoWidth) return;   // ยังไม่มีภาพ
          const code = decode(video, video.videoWidth, video.videoHeight);
          if (code) { stop(); onCode(code); }
        }, SCAN_INTERVAL_MS);
      })
      .catch(function (err) { if (session === mine) { stop(); onError(err); } });
  }

  function stop() {
    if (!session) return;
    clearInterval(session.timer);
    if (session.stream) session.stream.getTracks().forEach((t) => t.stop());
    session.box.remove();
    session = null;
  }

  const isScanning = () => session !== null;

  // ใส่กล่องวิดีโอลงช่องในหน้าจอที่เพิ่งวาดใหม่ (ไม่มีช่อง = หน้าจอเปลี่ยนไปแล้ว → ปิดกล้อง)
  function mount(slot) {
    if (!session) return;
    if (!slot) { stop(); return; }
    slot.appendChild(session.box);
    if (session.video.paused && session.stream) session.video.play().catch(function () {});
  }

  // รูปในเครื่อง (ทางสำรองเมื่อไม่มีกล้องสด) → Promise<รหัส 6 หลัก | null>
  function readFile(file) {
    return new Promise(function (resolve) {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        try { resolve(decode(img, img.naturalWidth, img.naturalHeight)); } catch (e) { resolve(null); } finally { URL.revokeObjectURL(url); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  root.QrScanner = { canUseCamera: canUseCamera, start: start, stop: stop, isScanning: isScanning, mount: mount, readFile: readFile };
})(this);
