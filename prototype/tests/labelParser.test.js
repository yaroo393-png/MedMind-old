// labelParser: ข้อความจากฉลาก → ร่างข้อมูลยา (FR-02 ✓1, ✗3, ✗4, ✗10 · BR-04, BR-07) · รัน: node --test (ที่ root ของ repo)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLabel } = require('../src/labelParser.js');
const { validateDraft } = require('../src/logic.js');
const OCR = require('./fixtures/ocr-samples.js');

test('ฉลากหลังอาหาร: ได้ร่างครบ และเก็บทุกมื้อที่ฉลากระบุ (FR-02 ✓1)', () => {
  const r = parseLabel(OCR.afterMeal);
  assert.equal(r.unsupported, null);
  assert.deepEqual(r.draft, {
    name: 'VIT. B1-6-12 TAB.', tabletsPerDose: 2,
    timing: { type: 'after', meal: 'breakfast', minutes: '' },
    warnings: '', contraindications: '',
  });
  assert.deepEqual(r.meals, ['breakfast', 'dinner']);
  assert.deepEqual(validateDraft(r.draft), []);
});

test('ฉลากก่อนนอน: ไม่มีมื้อ + คำเตือน (สระอำที่ OCR แยกเป็น ํ + า ถูกรวมกลับ)', () => {
  const r = parseLabel(OCR.bedtime);
  assert.equal(r.draft.name, 'CETIRIZINE 10 MG.');
  assert.equal(r.draft.tabletsPerDose, 1);
  assert.deepEqual(r.draft.timing, { type: 'bedtime', meal: '', minutes: '' });
  assert.deepEqual(r.meals, []);
  assert.equal(r.draft.warnings, 'ยานี้อาจทำให้ง่วงนอน');
  assert.deepEqual(validateDraft(r.draft), []);
});

test('ฉลากก่อนอาหารไม่ระบุนาที: ช่องนาทีว่าง ไม่เดา (FR-02 ✗10)', () => {
  const r = parseLabel(OCR.beforeMeal);
  assert.equal(r.draft.name, 'DOMPERIDONE 10 MG');
  assert.deepEqual(r.draft.timing, { type: 'before', meal: 'breakfast', minutes: '' });
  assert.deepEqual(r.meals, ['breakfast', 'lunch', 'dinner']);
  assert.deepEqual(validateDraft(r.draft), ['minutes']);
});

test('ฉลากยาเมื่อมีอาการ: ไม่รองรับ (FR-02 ✗4)', () => {
  assert.equal(parseLabel(OCR.asNeeded).unsupported, 'asNeeded');
});

test('ชื่อผู้ป่วย / HN / แพทย์ / โรงพยาบาล ไม่หลุดเข้าไปในร่าง', () => {
  Object.values(OCR).forEach((text) => {
    const draft = JSON.stringify(parseLabel(text).draft);
    ['ผู้ป่วย', '123456789', 'หมอ', 'โรงพยาบาล', '000-111-222'].forEach((secret) => assert.ok(!draft.includes(secret), secret));
  });
});

test('ระบุนาทีก่อนอาหาร: ตัวเลข / ครึ่งชั่วโมง / เลขไทย', () => {
  assert.equal(parseLabel('ก่อนอาหารเช้า 30 นาที').draft.timing.minutes, 30);
  assert.equal(parseLabel('ก่อนอาหารเย็น ครึ่งชั่วโมง').draft.timing.minutes, 30);
  assert.equal(parseLabel('ก่อนอาหารกลางวัน ๑๕ นาที').draft.timing.minutes, 15);
  assert.equal(parseLabel('หลังอาหารเช้า 30 นาที').draft.timing.minutes, '');   // นาทีใช้กับก่อนอาหารเท่านั้น
});

test('เวลาขัดกันเอง (ก่อน + หลังอาหาร) → ว่าง ไม่เดา (BR-04)', () => {
  const r = parseLabel('ก่อนอาหาร\nหลังอาหาร เช้า');
  assert.equal(r.draft.timing.type, '');
  assert.ok(validateDraft(r.draft).includes('timing'));
});

test('ขนาดยา: เลขไทย · หน่วยอ่านไม่ออก = ว่าง (FR-02 ✗3)', () => {
  assert.equal(parseLabel('รับประทานครั้งละ ๒ เม็ด').draft.tabletsPerDose, 2);
  assert.equal(parseLabel('รับประทานครั้งละ 2 แคปซูล').draft.tabletsPerDose, 2);
  assert.equal(parseLabel('รับประทานครั้งละ 2').draft.tabletsPerDose, '');
});

test('ยาครึ่งเม็ด และยาที่ไม่ใช่ยาเม็ด: ไม่รองรับ (BR-07)', () => {
  assert.equal(parseLabel('ครั้งละ ครึ่ง เม็ด').unsupported, 'halfTablet');
  assert.equal(parseLabel('ครั้งละ 1/2 เม็ด').unsupported, 'halfTablet');
  assert.equal(parseLabel('ครั้งละ 1 ช้อนชา').unsupported, 'notTablet');
  assert.equal(parseLabel('AMOXICILLIN SYRUP[1] ขวด').unsupported, 'notTablet');
});

test('"เย็น" นอกบรรทัดเวลา (เช่น เก็บในที่เย็น) ไม่นับเป็นมื้อ', () => {
  assert.deepEqual(parseLabel('หลังอาหาร เช้า\nเก็บในที่เย็น').meals, ['breakfast']);
});

test('ข้อความว่าง → ร่างว่างทุกช่อง · ไม่ใช่ข้อความ → TypeError', () => {
  const r = parseLabel('');
  assert.deepEqual(r.draft, { name: '', tabletsPerDose: '', timing: { type: '', meal: '', minutes: '' }, warnings: '', contraindications: '' });
  assert.deepEqual(validateDraft(r.draft), ['name', 'tabletsPerDose', 'timing']);
  assert.throws(() => parseLabel(null), TypeError);
});
