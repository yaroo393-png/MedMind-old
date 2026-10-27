/*
 * labelParser — ข้อความจากฉลากยา (ผล OCR) → ร่างข้อมูลยา (FR-02 ✓1, ✗3, ✗4, ✗10 · BR-04, BR-07)
 * ฟังก์ชันล้วน ไม่แตะ DOM จึง test ด้วย node ได้ · การอ่านรูปอยู่ใน readLabel.js
 *
 * หลักการ:
 *  - รับเฉพาะรูปแบบที่รู้จัก: ชื่อยา · ขนาดต่อครั้ง · เวลา/มื้อ · ยาเมื่อมีอาการ · คำเตือน/ข้อห้าม
 *    บรรทัดอื่นถูกทิ้งทั้งหมด → ชื่อผู้ป่วย / HN / แพทย์ ไม่หลุดเข้าไปในร่าง
 *  - อ่านไม่ได้หรือขัดกันเอง = ช่องว่าง ('') ให้ผู้ดูแลกรอก — ไม่เดา (BR-04)
 *  - รูปแบบร่างตรงกับ logic.js (validateDraft, saveMedication)
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LabelParser = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';

  // ชื่อยา: ขึ้นต้นด้วยอักษรละตินตัวใหญ่ ตามด้วย [จำนวนจ่าย] (รูปแบบฉลากโรงพยาบาล) · หน่วยหลัง ] ถ้ามี
  const DRUG_LINE = /([A-Z][A-Za-z0-9 .,\-\/%+()฀-๿]*?)\s*\[\s*\d+\s*\]\s*([฀-๿a-zA-Z.]+)?/;
  // ขนาด: "ครั้งละ <จำนวน> <หน่วย>" · จำนวนเป็นจำนวนเต็ม / ทศนิยม / เศษส่วน / ครึ่ง / ½
  const DOSE = /ครั้งละ\s*(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?|½|ครึ่ง)\s*([฀-๿a-zA-Z.]+)?/;
  const TABLET_UNIT = /^(เม็ด|แคปซูล|tab|tablet|cap|capsule)/i;
  const NOT_TABLET_UNIT = /^(ซอง|ช้อน|มล|ml|ซีซี|cc|หยด|ขวด|หลอด)/i;
  const AS_NEEDED = /เมื่อมีอาการ|เวลามีอาการ|เมื่อปวด|เมื่อมีไข้|เมื่อไข้|ทุก\s*\d+(\s*-\s*\d+)?\s*ชั่วโมง|บ่อย\s*ๆ|\bprn\b/i;
  const TIMING_LINE = /อาหาร|วันละ|ก่อนนอน/;   // "เย็น" ในบรรทัดอื่น (เช่น เก็บในที่เย็น) ไม่นับเป็นมื้อ
  const TIMINGS = [['before', /ก่อนอาหาร/], ['after', /หลังอาหาร/], ['bedtime', /ก่อนนอน/]];
  const MEALS = [['breakfast', /เช้า|เข้า/], ['lunch', /กลางวัน|เที่ยง/], ['dinner', /เย็น/]];   // OCR อ่าน "เช้า" เป็น "เข้า" บ่อย

  // ทำข้อความให้เป็นรูปเดียวกัน: NFC · นิคหิต + สระอา → สระอำ · เลขไทย → อารบิก
  function normalize(text) {
    return text.normalize('NFC')
      .replace(/ํา/g, 'ำ')
      .replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)));
  }

  const clean = (s) => s.replace(/\s+/g, ' ').trim();

  // ข้อความไทยช่วงเดียวที่เริ่มจากคำสำคัญ (ตัดขยะท้ายบรรทัดที่ห่างด้วยช่องว่างหลายช่อง)
  function thaiPhrase(line, start) {
    const m = /^[฀-๿0-9 .,\-]+/.exec(line.slice(start).split(/\s{2,}/)[0]);
    return m ? clean(m[0]).replace(/[ .,\-]+$/, '') : '';
  }

  // → { tablets: number|'', unsupported: null|'halfTablet'|'notTablet' } | null (บรรทัดนี้ไม่ใช่ขนาดยา)
  function parseDose(line) {
    const m = DOSE.exec(line);
    if (!m) return null;
    const amount = m[1], unit = m[2] || '';
    if (NOT_TABLET_UNIT.test(unit)) return { tablets: '', unsupported: 'notTablet' };
    if (!/^\d+$/.test(amount)) return { tablets: '', unsupported: 'halfTablet' };   // ครึ่ง / ½ / เศษส่วน / ทศนิยม
    if (!TABLET_UNIT.test(unit)) return { tablets: '', unsupported: null };           // หน่วยอ่านไม่ออก → ไม่เดา
    const n = Number(amount);
    return { tablets: n >= 1 ? n : '', unsupported: null };
  }

  /*
   * parseLabel(text) → {
   *   draft:       { name, tabletsPerDose, timing: { type, meal, minutes }, warnings, contraindications }  ช่องที่อ่านไม่ได้ = ''
   *   meals:       มื้อทั้งหมดที่ฉลากระบุ เช่น ['breakfast', 'dinner'] (ร่างใช้มื้อแรก — prototype ตั้งเตือนยา 1 รายการต่อ 1 มื้อ)
   *   unsupported: null | 'asNeeded' | 'notTablet' | 'halfTablet'   (BR-07 · FR-02 ✗4)
   * }
   */
  function parseLabel(text) {
    if (typeof text !== 'string') throw new TypeError('text must be a string');
    let name = '', drugUnit = '', tablets = '', doseUnsupported = null, minutes = '', warnings = '', contraindications = '';
    let asNeeded = false;
    const timings = new Set(), meals = new Set();

    normalize(text).split(/\r?\n/).forEach(function (line) {
      const drug = DRUG_LINE.exec(line);
      if (drug && !name && /[A-Z].*[A-Z].*[A-Z]/.test(drug[1])) { name = clean(drug[1]); drugUnit = drug[2] || ''; }

      const dose = parseDose(line);
      if (dose && tablets === '' && !doseUnsupported) { tablets = dose.tablets; doseUnsupported = dose.unsupported; }

      if (AS_NEEDED.test(line)) asNeeded = true;

      if (TIMING_LINE.test(line)) {
        TIMINGS.forEach(([type, re]) => { if (re.test(line)) timings.add(type); });
        MEALS.forEach(([meal, re]) => { if (re.test(line)) meals.add(meal); });
        const mm = /(\d+)\s*นาที/.exec(line);
        if (mm) minutes = Number(mm[1]);
        else if (/ครึ่งชั่วโมง/.test(line)) minutes = 30;
      }

      const warn = /ยาน[ีิ]/.exec(line) || /ระวัง/.exec(line);
      if (warn && !warnings) warnings = thaiPhrase(line, warn.index);
      const contra = /ห้าม/.exec(line);
      if (contra && !contraindications) contraindications = thaiPhrase(line, contra.index);
    });

    // เวลา: ต้องระบุแบบเดียวพอดี · ขัดกันเอง (ก่อน + หลังอาหาร) = ว่าง ไม่เดา
    const type = timings.size === 1 ? Array.from(timings)[0] : '';
    const mealList = type === 'bedtime' ? [] : MEALS.map((m) => m[0]).filter((m) => meals.has(m));
    const timing = {
      type: type,
      meal: mealList[0] || '',
      minutes: type === 'before' && minutes >= 1 ? minutes : '',
    };

    let unsupported = null;
    if (asNeeded) unsupported = 'asNeeded';
    else if (NOT_TABLET_UNIT.test(drugUnit) || doseUnsupported === 'notTablet') unsupported = 'notTablet';
    else if (doseUnsupported === 'halfTablet') unsupported = 'halfTablet';

    return {
      draft: { name: name, tabletsPerDose: tablets, timing: timing, warnings: warnings, contraindications: contraindications },
      meals: mealList,
      unsupported: unsupported,
    };
  }

  return { parseLabel: parseLabel };
});
