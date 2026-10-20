# MedMind Constitution

ระบบเตือนกินยาและแจ้งสถานะการกินยาให้ผู้ดูแลผู้สูงอายุ · วิชา Intro to Software Engineering (MFU 2569)

## Core Principles

### I. Golden Thread Traceability (NON-NEGOTIABLE)

- ทุกชิ้นงาน (screen, ปุ่ม, entity, field, operation, diagram, test, commit) ต้องสาวกลับได้ตามเส้น
  Problem → FR/NFR → Design → Feature → Test
- `docs/02-requirements/spec.md` เป็นต้นฉบับของ FR, BR, NFR และ AC · ไฟล์อื่น (รวม `specs/` ของ Spec Kit)
  ต้องอ้างรหัสเดิม (FR-xx, BR-xx, NFR-xx, ✓/✗n) ห้ามตั้งรหัสใหม่ซ้อนหรือเขียน requirement ขัดกัน
- ทุกหน้าจอใน prototype ต้องมีป้าย `Covers: FR-x` · ทุก diagram ต้องติดป้าย FR
- ตาราง traceability (`architecture.md` §7, §7.1) และ Golden Thread (`spec.md` §7, README, Final Report §9)
  ต้องอัปเดตในการเปลี่ยนแปลงเดียวกับงานที่ทำให้ตารางเปลี่ยน

เหตุผล: อาจารย์ cap คะแนนส่วนหลังที่ 50% ถ้าเส้นด้ายขาด และ rubric M3 ให้ 6 คะแนนกับการชี้ได้ว่า
feature = FR-x = diagram = test

### II. No Gold-Plating, Smallest Working Solution

- สิ่งที่ไม่มี FR หรือ NFR รองรับ ต้องไม่ถูกสร้าง · ถ้าพบของที่มีอยู่แล้วโดยไม่มี FR ต้องแจ้งทีมให้เลือก
  "เพิ่ม FR" หรือ "ตัดออก" และบันทึกการตัดสินใจ
- MVP = FR-01 ถึง FR-05 (Must) · FR-06–08 (Should/Could) ทำได้เฉพาะเมื่อทีมย้ายเข้า increment และเขียน AC แล้ว
- เลือกสถาปัตยกรรมและ interface ที่เล็กที่สุดที่แก้ปัญหาได้ (3 ชั้น monolith) · ห้ามเพิ่ม layer, config
  หรือ dependency ที่ไม่มี FR/NFR บังคับ
- ห้ามทำสิ่งใน Out of scope (`spec.md` §6): OCR ลายมือแพทย์, บันทึกผลอ่านฉลากโดยไม่ตรวจ,
  AI วินิจฉัย/แนะนำยา, ระบบเปลี่ยนวิธีใช้ยาเอง, แนะนำวิธีชดเชยเมื่อลืมยา

เหตุผล: gold-plating เป็น smell ที่คู่มือ M3 หักคะแนน และส่วนเกินทุกชิ้นต้องอธิบายได้ตอนสอบปากเปล่า

### III. Acceptance-Criteria Tests on Separated Logic

- กฎทั้งหมดต้องอยู่ในโมดูลตรรกะ (`prototype/src/logic.js`) แยกจากหน้าจอ และรับเวลาจาก clock ภายนอก (ADR-02)
- ทุก acceptance criterion (✓ และ ✗) ของ Must FR ต้องมี automated unit test อย่างน้อย 1 ตัว
  ก่อนงานที่แก้กฎนั้นจะ merge
- test ต้องครอบกรณีว่าง (empty), กรณีถูกตัดออก (excluded เช่น มื้อที่ยืนยันแล้วต้องไม่ถูกเตือน)
  และค่าขอบ (boundary เช่น T+15 พอดี, รหัสหมดอายุนาทีที่ 10) ตาม equivalence partitioning
  และ boundary value analysis
- ชื่อ test เป็นประโยคบอกสิ่งที่ควรเกิด และอ้างรหัส AC/BR · test รันด้วย `node --test`
  ไม่ใช้ package ภายนอก
- ผลทดสอบที่รายงานในเอกสารต้องมาจากการรันจริงเท่านั้น

เหตุผล: NFR-01, 04, 05, 06, 07, 10 สัญญาว่าตรวจด้วย automated test · คู่มือวิชากำหนด
"ทุก acceptance criterion → test อย่างน้อย 1 ตัว"

### IV. Evidence Over Opinion — AI Drafts, Humans Decide

- ห้ามแต่งผลสัมภาษณ์ ผลทดสอบ คำพูดผู้ใช้ ตัวเลขวัดผล หรือแหล่งอ้างอิง · ข้อมูลที่ยังไม่มีให้เว้น `[ทีมกรอก]`
- AI ห้ามเขียนส่วน reflection หรือ contribution แทนทีม
- ขอบเขต ตัวเลข และกฎ ทีมเป็นผู้ตัดสิน · AI เสนอทางเลือกพร้อมเหตุผล เมื่อไม่แน่ใจต้องถามก่อนแก้
- ทุกการใช้ AI ต้องบันทึกตามจริงใน `spec.md` §8 (วันที่, เครื่องมือ, ขออะไร, ได้อะไร, ทีมแก้/ตรวจอะไร,
  บทเรียน) และสรุปใน `docs/05-report/ai-use-statement.md`
- โค้ดที่ AI สร้างต้องถูกอ่านทุกบรรทัด รันจริง และตรวจ 5 ความผิดพลาดของ AI: hallucinated API,
  missing edge cases, over-engineering, untrusted dependency, silent wrong logic

เหตุผล: rubric ให้คะแนนการอ่าน การทดสอบ และการตัดสินใจของคน · AI log ที่ว่างแต่เนื้อหาดูเหมือน AI เขียน
ถูก cap 50%

### V. Senior Safety & Privacy by Design

- ข้อมูลยาที่ร่างจากฉลากต้องผ่านการตรวจและกดบันทึกของ Caregiver ทุกครั้ง · ช่องที่อ่านไม่ได้เป็นค่าว่าง +
  "กรุณาตรวจสอบ" ระบบห้ามเดา (BR-04, NFR-06) · เวลาเตือนอ้างคำสั่งบนฉลากเท่านั้น (BR-06)
- บริการภายนอก (อ่านฉลาก) ต้องอยู่หลัง adapter และมีทางสำรองให้กรอกเอง (ADR-03, FR-02 ✗5)
- ไม่มีการเชื่อมต่อก่อน Senior ยินยอม (NFR-05) · Caregiver เห็นเฉพาะ Senior ที่จับคู่ (NFR-04) ·
  ยกเลิกการจับคู่ = ลบข้อมูลของคู่นั้น (BR-17, NFR-10)
- เก็บเฉพาะข้อมูลที่ FR-01–05 ใช้ · ห้ามเก็บเลขบัตรประชาชน ที่อยู่ วันเกิด เบอร์โทร หรือ HN (NFR-09) ·
  ไม่ส่งข้อมูลที่ไม่จำเป็นให้ AI
- ข้อความถึง Caregiver ใช้ "ยังไม่ยืนยันการกินยา" ห้ามใช้ "ไม่ได้กิน" (BR-13) เพราะระบบรู้แค่การกดยืนยัน

เหตุผล: ข้อมูลยาผิดทำให้ผู้สูงอายุกินยาผิด และข้อมูลสุขภาพเป็นข้อมูลอ่อนไหวตาม PDPA

## Platform, Design & Prototype Constraints

- ระบบเป็นเว็บแอป · MVP เตือนและแจ้ง Caregiver เฉพาะขณะเปิดหน้าเว็บค้างไว้ (ADR-01, `spec.md` §2.2)
- Prototype เป็น HTML/CSS/JS เปิดด้วยดับเบิลคลิก ไม่มี server, DB หรือ npm · ใช้ข้อมูลจำลองและนาฬิกาจำลอง ·
  ต้องคลิก happy path ครบทุก Must FR และมี error/empty state อย่างน้อย 1 ต่อ Must FR · README บอกวิธีเปิด
- Design doc เป็น tech-agnostic: entity, field, ความสัมพันธ์, operation · ห้ามมีโค้ด DB/SDK
- การตัดสินใจสำคัญเขียนเป็น ADR (Context จาก FR/NFR · Decision · Consequence) พร้อมทางเลือกที่ปฏิเสธและเหตุผล
- หน้าจอใช้ค่าจาก `prototype/src/tokens.css` เท่านั้น ตาม `docs/03-design/design-system.md` ·
  ยกเว้นแถบเครื่องมือ demo และสีภาพประกอบตัวละคร
- UI ต้องผ่าน NFR-03: ปุ่ม "กินแล้ว"/"ยังไม่กิน" สูง ≥ 64 px กว้างเต็มจอ · ชื่อยา ≥ 24 px · ข้อความทั่วไป ≥ 18 px ·
  contrast ≥ 4.5:1 (ห้ามตัวอักษรขาวบน `#2EC4C4`)
- Craft: ระยะบนสเกล 4 px (4·8·16·24·32) · ฟอนต์ ≤ 2 (Mitr + Sarabun) · 1 หน้าจอ 1 ปุ่มหลัก ·
  การกระทำที่ย้อนไม่ได้ต้องยืนยัน · ทุกการกระทำมี feedback · หลบ AI-look (gradient ม่วง→ฟ้า, emoji แทน icon,
  ข้อความ generic)

## Development Workflow & Quality Gates

- Git: ห้าม commit หรือ push ตรงเข้า `main` · 1 งาน = 1 branch → Pull Request → review → merge ·
  ห้าม `push --force` บน branch ร่วม · AI push ได้เฉพาะ branch งานเมื่อทีมสั่ง และทีมเป็นผู้ merge
- Commit เล็ก ข้อความบอก "ทำอะไร เพราะอะไร" และอ้างรหัส FR/NFR · สมาชิกแต่ละคน commit งานตามบทบาทของตัวเอง
  (คะแนนรายคนคูณ factor จาก GitHub)
- Spec Kit ใช้กับงานใหม่หรืองานแก้ที่มีขอบเขตชัด: `speckit-specify` → `speckit-clarify` → `speckit-plan` →
  `speckit-tasks` → `speckit-analyze` → `speckit-implement` · ทุก spec ต้องอ้าง FR ใน `spec.md`
  ถ้าต้องมี requirement ใหม่ ให้แก้ `spec.md` ก่อน (ทีมอนุมัติ)
- Definition of Ready: ผู้ใช้และคุณค่าชัด · มี AC (Given–When–Then ทั้ง happy และ edge) · เห็นความเสี่ยง · ชิ้นเล็กพอ
- Definition of Done: ผ่าน AC และ test ที่เกี่ยวข้อง · ผ่านเช็ก privacy (หลักการ V) · เอกสารและตาราง
  traceability อัปเดต · AI log อัปเดต · review แล้ว · ไม่มี error ใน console ของ prototype
- จบงานแต่ละครั้ง: สรุปไฟล์ที่เปลี่ยน + FR ที่ครอบ + สิ่งที่ยังขาด

## Governance

- ลำดับความสำคัญเมื่อขัดกัน: เอกสารอาจารย์ (M1–M4, week02–07, UX/UI-HCI primer) >
  `SE-COURSE-PRINCIPLES.md` > constitution นี้ > เอกสารอื่นใน repo · พบความขัดกันต้องแจ้งทีม
- การแก้ constitution ทำผ่าน Pull Request ที่ทีมอนุมัติ พร้อม Sync Impact Report และแถวใน AI log
- Versioning ตาม semantic versioning: MAJOR = ตัดหรือนิยามหลักการใหม่แบบไม่เข้ากันเดิม ·
  MINOR = เพิ่มหลักการ/หมวด หรือขยายแนวทางอย่างมีนัย · PATCH = แก้ถ้อยคำ
- ทุก PR ต้องตรวจตามหลักการ I–V (ใช้ `speckit-analyze` กับงานที่ทำผ่าน Spec Kit) · ความซับซ้อนที่เพิ่มขึ้นต้องมี
  FR/NFR อ้างและเหตุผล
- แนวทางรันไทม์สำหรับ AI: `SE-COURSE-PRINCIPLES.md` (กติกาวิชา) และ `CLAUDE.md` (ข้อมูลเฉพาะโปรเจกต์)

**Version**: 1.0.0 | **Ratified**: 2026-10-20 | **Last Amended**: 2026-10-20
