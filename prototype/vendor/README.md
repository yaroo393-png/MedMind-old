# vendor — ไลบรารีของระบบสแกน (ห้ามแก้ไฟล์ในโฟลเดอร์นี้)

เก็บในเครื่อง ไม่โหลดจาก CDN · ไม่ใช้ npm ตอนเปิดแอป · ทำงานได้ทั้งดับเบิลคลิก (`file://`) และลิงก์เว็บ

| ไฟล์ | ที่มา | License | ใช้ทำ |
|---|---|---|---|
| `jsqr/jsQR.js` | npm `jsqr@1.4.0` (`dist/`) | Apache-2.0 | อ่าน QR จากภาพ (FR-01 ✓3) |
| `qrcode/qrcode.js` | npm `qrcode-generator@1.4.4` | MIT | สร้าง QR รหัสเชิญบนหน้าผู้สูงอายุ (FR-01 ✓1) |
| `tesseract/tesseract.min.js` | npm `tesseract.js@5.1.1` (`dist/`) | Apache-2.0 | OCR ในเบราว์เซอร์ (FR-02 ✓1) |
| `tesseract-embed/*.js` | `tesseract.js@5.1.1` worker + `tesseract.js-core@5.1.1` (`tesseract-core-lstm.wasm.js`, ไม่ใช้ SIMD → รันได้ทุกเครื่อง) + ข้อมูลภาษา `tha`, `eng` จาก github.com/tesseract-ocr/tessdata_fast — ห่อเป็น base64 ใน `window.MM_OCR` | Apache-2.0 | ให้อ่านฉลากได้เมื่อเปิดด้วยดับเบิลคลิก |

ทำไมต้องห่อเป็น `.js`: เปิดแบบ `file://` เบราว์เซอร์บล็อกการโหลดไฟล์ภาษา/worker ด้วย `fetch` แต่ `<script src>` ยังใช้ได้
→ `src/readLabel.js` โหลดไฟล์เหล่านี้เฉพาะครั้งแรกที่อ่านฉลาก (~12 MB) แล้วสร้าง worker จาก blob

`src/readLabel.js` แก้บั๊กของ worker 5.1.1 ในหน่วยความจำ (ไม่แก้ไฟล์ที่นี่) — ถ้าเปลี่ยนรุ่น Tesseract.js ต้องสร้าง `tesseract-embed/` ใหม่และตรวจการแก้นั้น
