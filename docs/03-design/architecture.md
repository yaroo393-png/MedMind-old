# Architecture & Design — MedMind

> diagram ทุกอันเขียนด้วย Mermaid (GitHub แสดงเป็นภาพให้อัตโนมัติ) · ทุก diagram และตารางติดป้าย FR · กฎและตัวเลขทั้งหมดอ้างจาก SRS [`docs/02-requirements/spec.md`](../02-requirements/spec.md) (BR-01..17, FR-01..05, NFR-01..10) — เอกสารนี้ไม่เพิ่มกฎใหม่
>
> การตัดสินใจที่ SRS เดิมยังไม่ได้ระบุ บันทึกไว้ใน §8

---

## 1. Architecture (มาจาก FR)

ระบบเป็น **เว็บแอปที่ใช้ผ่านเบราว์เซอร์** (SRS §2.2) แบ่งเป็น 3 ชั้น — หน้าจอไม่ตัดสินกฎเอง กฎเวลาเตือนและการแจ้งผู้ดูแลทั้งหมดอยู่ในชั้นตรรกะ เพื่อให้ทดสอบด้วยนาฬิกาจำลองได้ (NFR-01)

```mermaid
graph TD
    subgraph P["1. Presentation — หน้าจอ"]
        R0["ทั้งสองฝ่าย: เลือกบทบาท ผู้สูงอายุ / ผู้ดูแล (ก่อน FR-01)"]
        S1["Senior: หน้าเริ่มต้น / QR + ยินยอม (FR-01)"]
        S2["Senior: หน้าเตือน (FR-03, FR-04)"]
        S3["Senior: หน้าแรก — มื้อของวัน + ยืนยันช้า (FR-04)"]
        C1["Caregiver: จับคู่ — สแกน QR / ใส่รหัส (FR-01)"]
        C2["Caregiver: สแกนฉลาก → ร่าง → ตรวจ → บันทึก + ตั้งเวลามื้อ + ความถี่ / วันเริ่ม–สิ้นสุด (FR-02)"]
        C3["Caregiver: หน้าสถานะรายวัน + การแจ้งเตือน (FR-05)"]
    end

    subgraph L["2. Logic — โมดูลกฎ (ไม่รู้จักหน้าจอ)"]
        M1["pairing (FR-01)"]
        M2["medication + readLabel adapter (FR-02)"]
        M3["doseSession (FR-03, FR-04)"]
        M4["escalation (FR-05)"]
        M5["notification (ใช้ร่วม)"]
        CLK["clock — เวลาปัจจุบัน (จริง / จำลอง)"]
    end

    subgraph D["3. Data — ที่เก็บข้อมูล"]
        DB[("Store: Pairing, InviteCode, Medication, MealTimes, DoseSession, NotificationLog")]
    end

    EXT["ผู้ให้บริการอ่านฉลาก (ภายนอก)"]

    R0 -.-> S1
    R0 -.-> C1
    S1 --> M1
    C1 --> M1
    C2 --> M2
    S2 --> M3
    S3 --> M3
    C3 --> M3
    M2 -->|"ส่งรูป ได้ร่างกลับ"| EXT
    M2 -->|"event MedicationSaved"| M3
    M3 -->|"อ่านเวลา"| CLK
    M3 -->|"event DoseUnconfirmed / DoseConfirmedLate"| M4
    M4 --> M5
    M5 -->|"แจ้ง Caregiver"| C3
    L ---|"แต่ละโมดูลเก็บเฉพาะข้อมูลของตัวเอง (§5, §6)"| DB
```

| ชั้น | ทำอะไร | ไม่ทำอะไร |
|---|---|---|
| Presentation | แสดงข้อมูลและรับการกดของผู้ใช้ เช่น ปุ่ม "กินแล้ว" / "ยังไม่กิน" | ไม่คำนวณเวลาเตือน ไม่ตัดสินว่าต้องแจ้งผู้ดูแลหรือไม่ |
| Logic | กฎทั้งหมด: รหัสเชิญและการจับคู่ (BR-01, 02, 17), ร่างจากฉลากและเวลาเตือน (BR-03..07), รอบเตือน ยืนยัน แจ้งผู้ดูแล (BR-08..16) | ไม่อ่านเวลาเครื่องเอง — รับเวลาจาก `clock` |
| Data | เก็บเฉพาะข้อมูลที่ FR-01..05 ใช้ (NFR-09) และให้อ่านได้เฉพาะคู่ที่จับคู่กัน (NFR-04) | ไม่เก็บร่างจากฉลากจนกว่า Caregiver จะกดบันทึก (BR-04) |

### 1.1 การตัดสินใจหลัก (ADR)

**ADR-01 — เตือนเฉพาะขณะเปิด MedMind ไว้**
- *Context:* ระบบเป็นเว็บแอป เบราว์เซอร์แจ้งเตือนไม่ได้เมื่อปิดหน้าหรือล็อกจอ และไม่เล่นเสียงจนกว่าผู้ใช้แตะหน้าครั้งแรก (SRS §2.2)
- *Decision:* MVP เตือน Senior และแจ้ง Caregiver เฉพาะขณะหน้าเว็บเปิดค้างไว้ · เสียงเตือนเริ่มเล่นได้หลังผู้ใช้แตะหน้าครั้งแรก
- *Consequence:* ไม่ต้องมีระบบ push · ถ้าผู้ใช้ปิดหน้า จะไม่ได้รับการเตือน (อยู่นอก MVP ตาม §2.2)

**ADR-02 — กฎเวลาอยู่ในโมดูลตรรกะ และรับเวลาจาก `clock`**
- *Context:* NFR-01 ต้องพิสูจน์ว่าแจ้งซ้ำที่ T+5, T+10 และแจ้ง Caregiver ไม่เกิน T+15 ทุกครั้ง
- *Decision:* `doseSession` และ `escalation` เป็นโค้ดที่ไม่ผูกกับหน้าจอ และถามเวลาจาก `clock` · ใช้งานจริงใช้เวลาเครื่อง · ตอนทดสอบและใน prototype ใช้นาฬิกาจำลองที่เลื่อนเวลาได้
- *Consequence:* automated test ไม่ต้องรอเวลาจริง 15 นาที · prototype สาธิตการเตือนครบ 3 รอบได้ในไม่กี่วินาที

**ADR-03 — การอ่านฉลากอยู่หลัง adapter `readLabel` และได้แค่ "ร่าง"**
- *Context:* ผลอ่านฉลากอาจผิด (SRS §6) และผู้ให้บริการภายนอกอาจล่ม (SRS §1.2)
- *Decision:* `readLabel` คืนค่าเป็นร่างเท่านั้น ช่องที่อ่านไม่ได้เป็นค่าว่าง + "กรุณาตรวจสอบ" (BR-04) · ข้อมูลยาถูกบันทึกเมื่อ Caregiver กดบันทึกเท่านั้น · อ่านไม่ได้ → เปิดฟอร์มว่างให้กรอกเอง (FR-02 ✗5)
- *Consequence:* เปลี่ยนผู้ให้บริการได้โดยไม่แตะโมดูลอื่น · prototype อ่านฉลากจริงในเครื่องด้วย Tesseract.js (`readLabel.js` อ่านรูป → `labelParser.js` แยกเป็นร่าง) ไม่ส่งรูปออกนอกเครื่อง · NFR-08 ยังต้องวัดกับฉลากจริง

**ADR-04 — ทุกการอ่านข้อมูลผ่าน Pairing**
- *Context:* Caregiver ต้องเห็นเฉพาะ Senior ที่จับคู่ไว้ (NFR-04) และหลังยกเลิกการจับคู่ต้องดูไม่ได้และข้อมูลถูกลบ (NFR-10, BR-17)
- *Decision:* ข้อมูลยา มื้อ และสถานะทั้งหมดผูกกับ `pairingId` · ทุกคำขอตรวจว่า Caregiver เป็นเจ้าของ pairing นั้น · ยกเลิกการจับคู่ = ลบ Pairing พร้อมข้อมูลที่ผูกอยู่
- *Consequence:* ทดสอบ NFR-04 และ NFR-10 ได้ที่จุดเดียว

**ADR-05 — Caregiver ผูกกับเครื่อง ไม่มีบัญชี**
- *Context:* SRS กำหนดว่า Senior ไม่มีบัญชีหรือรหัสผ่าน (BR-02) แต่ไม่ได้กำหนดวิธีระบุตัว Caregiver
- *Decision:* Caregiver ระบุตัวด้วยรหัสเครื่องแบบเดียวกับ Senior — ไม่มีชื่อผู้ใช้ รหัสผ่าน หรืออีเมล (ทางที่ง่ายที่สุด)
- *Consequence:* ไม่ต้องเก็บข้อมูลบัญชี (สอดคล้อง NFR-09) และ prototype ไม่ต้องมีหน้าเข้าสู่ระบบ · ถ้าเปลี่ยนเครื่องหรือล้างข้อมูลเบราว์เซอร์ ต้องจับคู่ใหม่ (FR-01)

---

## 2. Use Case Diagram

```mermaid
flowchart LR
    Senior["ผู้สูงอายุ (Senior)"]
    Caregiver["ลูกหลาน / ผู้ดูแล (Caregiver)"]
    Clock["เวลา (นาฬิกาของระบบ)"]
    Reader["ผู้ให้บริการอ่านฉลาก (ภายนอก)"]

    subgraph SYS["ระบบ MedMind (MVP)"]
        UC1(["UC-1 จับคู่อุปกรณ์ — FR-01"])
        UC2(["UC-2 เพิ่มยาจากฉลาก — FR-02"])
        UC3(["UC-3 รับการแจ้งเตือนมื้อยา — FR-03"])
        UC4(["UC-4 ยืนยันการกินยา — FR-04"])
        UC5(["UC-5 แจ้ง Caregiver เมื่อยังไม่ยืนยัน — FR-05"])
        UC6(["UC-6 ดูสถานะรายวัน — FR-05"])
    end

    Senior --- UC1
    Caregiver --- UC1
    Caregiver --- UC2
    UC2 --- Reader
    Clock --- UC3
    UC3 --- Senior
    Senior --- UC4
    Clock --- UC5
    UC5 --- Caregiver
    Caregiver --- UC6
```

ตรงกับตาราง use case ใน SRS §5.1 (UC-1..6) · FR-05 มี 2 use case (UC-5, UC-6) เพราะรวมการแจ้งเตือนกับหน้าสถานะรายวัน

---

## 3. Sequence Diagrams

### 3.1 เตือน → ยืนยัน → แจ้งผู้ดูแล (FR-03 → FR-04 → FR-05)

ตัวอย่างมื้อ 08:00 (T = 08:00) · เวลาในตัวอย่างตรงกับ AC ใน SRS

```mermaid
sequenceDiagram
    autonumber
    participant CLK as clock
    participant DS as doseSession (FR-03, FR-04)
    participant SR as หน้าเตือน Senior
    actor Senior
    participant ES as escalation (FR-05)
    participant NT as notification
    actor Caregiver

    CLK->>DS: 08:00 ถึงเวลา T
    DS->>SR: เตือนรอบ 1 — ยาทั้งมื้อ + เสียง (BR-08, BR-09)
    alt กด "กินแล้ว" ระหว่างรอบเตือน (FR-04 ✓1)
        Senior->>SR: แตะ "กินแล้ว" 08:03
        SR->>DS: confirm(08:03)
        DS->>DS: สถานะ "กินแล้ว" + บันทึก 08:03 · หยุดเตือน (BR-10)
    else ยังไม่ยืนยัน
        CLK->>DS: 08:05 (T+5)
        DS->>SR: แจ้งซ้ำครั้งที่ 1 + เสียง
        CLK->>DS: 08:10 (T+10)
        DS->>SR: แจ้งซ้ำครั้งที่ 2 (รอบสุดท้าย) + เสียง
        alt กด "ยังไม่กิน" ในรอบสุดท้าย (FR-04 ✗4)
            Senior->>SR: แตะ "ยังไม่กิน"
            DS-->>ES: event DoseUnconfirmed (ทันที)
        else ไม่มีการกดจนถึง T+15 (FR-05 ✗2)
            CLK->>DS: 08:15 (T+15)
            DS->>DS: สถานะ "ยังไม่ยืนยัน"
            DS-->>ES: event DoseUnconfirmed
        end
        ES->>NT: แจ้ง 1 ครั้งต่อมื้อ (BR-13)
        NT->>Caregiver: "ยังไม่ยืนยันการกินยา"
        opt ยืนยันช้าจากหน้าแรก ก่อนเวลาเตือนของมื้อถัดไป (FR-04 ✓5, BR-15)
            Senior->>DS: แตะ "กินแล้ว" 08:40
            DS->>DS: สถานะ "กินแล้ว (ยืนยันช้า)" + 08:40
            DS-->>ES: event DoseConfirmedLate
            ES->>NT: แจ้งผลยืนยันช้า
            NT->>Caregiver: "ยืนยันการกินยาแล้ว เวลา 08:40" (FR-05 ✓6)
        end
    end
```

### 3.2 เพิ่มยาจากฉลาก (FR-02)

```mermaid
sequenceDiagram
    autonumber
    actor Caregiver
    participant UI as หน้าสแกน / ร่าง
    participant MD as medication
    participant RL as readLabel adapter
    participant EXT as ผู้ให้บริการอ่านฉลาก

    Caregiver->>UI: ถ่ายรูปฉลาก
    UI->>MD: draftFromPhoto(รูป)
    MD->>RL: read(รูป)
    RL->>EXT: ส่งรูป
    alt อ่านได้
        EXT-->>RL: ข้อความบนฉลาก
        RL-->>MD: ร่าง (ช่องที่อ่านไม่ได้ = ว่าง + "กรุณาตรวจสอบ") (BR-04)
        MD-->>UI: แสดงร่าง — ยังไม่บันทึกอะไร (FR-02 ✓1)
    else อ่านไม่ได้ / ล่ม (FR-02 ✗5)
        RL-->>MD: ล้มเหลว
        MD-->>UI: ฟอร์มว่างให้กรอกเอง
    end
    Caregiver->>UI: ตรวจ / แก้ช่อง แล้วกดบันทึก
    UI->>MD: save(ค่าที่ Caregiver ยืนยัน)
    MD->>MD: ตรวจช่องบังคับครบ (BR-05) · คำนวณเวลาเตือนจากคำสั่งบนฉลาก (BR-06)
    MD-->>UI: บันทึกแล้ว · event MedicationSaved
```

---

## 4. State Machine — DoseSession (หนึ่งมื้อของหนึ่งวัน)

```mermaid
stateDiagram-v2
    state "รอถึงเวลา" as Waiting
    state "กำลังเตือน (รอบ 1–3)" as Reminding
    state "กินแล้ว" as Taken
    state "ยังไม่ยืนยัน" as Unconfirmed
    state "กินแล้ว (ยืนยันช้า)" as TakenLate

    [*] --> Waiting
    Waiting --> Reminding : ถึง T / เตือนรอบ 1 + เสียง
    Reminding --> Reminding : T+5, T+10 / แจ้งซ้ำรอบ 2, 3 (BR-08)
    note right of Reminding
        กด "ยังไม่กิน" รอบ 1–2 = รอรอบถัดไป
        กด "ยังไม่กิน" รอบ 3 = แจ้ง Caregiver ทันที (BR-11)
    end note
    Reminding --> Taken : กด "กินแล้ว" / บันทึกเวลา หยุดเตือน (BR-10)
    Reminding --> Unconfirmed : ถึง T+15 / แจ้ง Caregiver ถ้ายังไม่เคยแจ้ง (BR-13)
    Unconfirmed --> TakenLate : กด "กินแล้ว" จากหน้าแรก ก่อนเวลาเตือนมื้อถัดไป / แจ้ง Caregiver (BR-15)
    Unconfirmed --> [*] : พ้นช่วงยืนยันช้า / คง "ยังไม่ยืนยัน"
    Taken --> [*]
    TakenLate --> [*]
```

- กด "กินแล้ว" ซ้ำในสถานะ "กินแล้ว" → ไม่สร้างบันทึกใหม่ (BR-12, NFR-07)
- มื้อเวลาซ้อนกัน: แต่ละมื้อมี DoseSession ของตัวเอง เดินตาม state machine นี้แยกกัน (BR-16)
- ช่วงยืนยันช้าสิ้นสุดที่เวลาเตือนของมื้อถัดไปที่เริ่มหลัง T+15 ของมื้อนี้ ถ้าไม่มีให้ถึง 23:59 (BR-15)
- หน้าสถานะของ Caregiver แสดงคำตามสถานะในแผนภาพนี้ตรงตัว — ช่วง T ถึง T+15 แสดง "กำลังเตือน" (BR-14, FR-05 ✓3)

---

## 5. Data Model / ERD

เก็บเฉพาะข้อมูลที่ FR-01..05 ใช้ · **ไม่มี** เลขบัตรประชาชน ที่อยู่ วันเกิด เบอร์โทร หรือเลข HN ของผู้สูงอายุ (NFR-09) · Senior ไม่มีบัญชีหรือรหัสผ่าน (BR-02)

```mermaid
erDiagram
    SENIOR ||--o| PAIRING : "จับคู่ได้ 1 คน (BR-02)"
    CAREGIVER ||--o{ PAIRING : "ดูแล"
    SENIOR ||--o{ INVITE_CODE : "สร้างรหัส"
    PAIRING ||--|| MEAL_TIMES : "ตั้งเวลามื้อ"
    PAIRING ||--o{ MEDICATION : "ยาของคู่นี้"
    PAIRING ||--o{ DOSE_SESSION : "มื้อยารายวัน"
    DOSE_SESSION ||--|{ DOSE_ITEM : "ยาในมื้อ"
    MEDICATION ||--o{ DOSE_ITEM : "อยู่ในมื้อ"
    DOSE_SESSION ||--o{ NOTIFICATION_LOG : "ข้อความถึง Caregiver"

    SENIOR {
        string seniorId PK "รหัสเครื่อง ไม่ใช่ข้อมูลส่วนตัว"
        datetime createdAt
    }
    CAREGIVER {
        string caregiverId PK "รหัสเครื่อง ไม่มีบัญชี (ADR-05)"
        datetime createdAt
    }
    INVITE_CODE {
        string code PK "ตัวเลข 6 หลัก + QR"
        string seniorId FK
        datetime createdAt
        datetime expiresAt "createdAt + 10 นาที (BR-01)"
        datetime usedAt "ใช้ได้ 1 ครั้ง"
    }
    PAIRING {
        string pairingId PK
        string seniorId FK "unique"
        string caregiverId FK
        datetime consentAt "Senior กดยินยอม (BR-02, NFR-05)"
        datetime pairedAt
    }
    MEAL_TIMES {
        string pairingId PK
        time breakfast
        time lunch
        time dinner
        time bedtime
    }
    MEDICATION {
        string medicationId PK
        string pairingId FK
        string name "ช่องบังคับ (BR-05)"
        int tabletsPerDose "ช่องบังคับ"
        string labelTiming "หลังอาหาร / ก่อนอาหาร / ก่อนนอน"
        string meal "เช้า / กลางวัน / เย็น"
        int minutesBefore "ก่อนอาหาร N นาที ตามฉลาก"
        time reminderTime "คำนวณตาม BR-06"
        string warnings "ถ้าฉลากมี"
        string contraindications "ถ้าฉลากมี"
        string scheduleDays "วันในสัปดาห์ที่กิน อา–ส (ค่าเริ่มต้น ทุกวัน)"
        date startDate "วันเริ่มต้น (ค่าเริ่มต้น วันที่เพิ่มยา)"
        date endDate "วันสิ้นสุด (ว่าง = ไม่มีวันสิ้นสุด)"
        datetime savedAt "Caregiver กดบันทึก (NFR-06)"
    }
    DOSE_SESSION {
        string sessionId PK
        string pairingId FK
        date day
        time reminderTime "T"
        string status "ดู state machine §4"
        int round "รอบเตือน 0–3"
        datetime confirmedAt
        datetime caregiverAlertedAt "แจ้ง 1 ครั้งต่อมื้อ (BR-13)"
    }
    DOSE_ITEM {
        string sessionId FK
        string medicationId FK
    }
    NOTIFICATION_LOG {
        string notificationId PK
        string sessionId FK
        string type "UNCONFIRMED / CONFIRMED_LATE"
        datetime sentAt
    }
```

| Entity | รองรับ FR | หมายเหตุ |
|---|---|---|
| SENIOR, CAREGIVER, INVITE_CODE, PAIRING | FR-01 | ยกเลิกการจับคู่ = ลบ PAIRING และทุกอย่างที่ผูกอยู่ (BR-17, NFR-10) |
| MEDICATION, MEAL_TIMES | FR-02 | ร่างจากฉลากไม่ถูกเก็บ — เก็บเมื่อ Caregiver กดบันทึกเท่านั้น (BR-04, NFR-06) |
| DOSE_SESSION, DOSE_ITEM | FR-03, FR-04 | ยาที่เวลาเตือนตรงกันรวมเป็นมื้อเดียว (BR-06) · หนึ่งมื้อมีบันทึกยืนยันได้รายการเดียว (NFR-07) |
| NOTIFICATION_LOG | FR-05 | ใช้ตรวจว่าแจ้ง Caregiver ครั้งเดียวต่อมื้อ (BR-13, NFR-01) |

---

## 6. Module & Event (cohesion / coupling)

| Module | FR | ข้อมูลที่เป็นเจ้าของ | รับ event | ส่ง event |
|---|---|---|---|---|
| `pairing` | FR-01 | SENIOR, CAREGIVER, INVITE_CODE, PAIRING | — | `Unpaired` |
| `medication` (+ adapter `readLabel`) | FR-02 | MEDICATION, MEAL_TIMES | `Unpaired` (ลบข้อมูล) | `MedicationSaved` |
| `doseSession` | FR-03, FR-04 | DOSE_SESSION, DOSE_ITEM | `MedicationSaved` (สร้างมื้อ), `Unpaired` (ลบข้อมูล) | `DoseConfirmed`, `DoseUnconfirmed`, `DoseConfirmedLate` |
| `escalation` | FR-05 | — | `DoseUnconfirmed`, `DoseConfirmedLate` | — (เรียก `notification`) |
| `notification` | ใช้ร่วม | NOTIFICATION_LOG | — | — |

Event: `MedicationSaved` → `DoseConfirmed` / `DoseUnconfirmed` → `DoseConfirmedLate` (BR-15) · `Unpaired` (BR-17)

- **Cohesion:** แต่ละโมดูลดูแล FR ของตัวเองและเป็นเจ้าของข้อมูลของตัวเองเท่านั้น — เช่น กฎรอบเตือนทั้งหมดอยู่ใน `doseSession` ที่เดียว
- **Coupling:** โมดูลคุยกันผ่าน event ไม่อ่านข้อมูลของกันและกันโดยตรง — `escalation` ไม่ต้องรู้ว่ามื้อมียาอะไร รู้แค่ว่ามื้อไหนยังไม่ยืนยัน · เปลี่ยนผู้ให้บริการอ่านฉลากได้โดยแก้แค่ `readLabel`

---

## 7. Coverage: FR → Design (sync-check)

| FR / NFR | Architecture §1 | Use Case §2 | Sequence §3 | State §4 | ERD §5 | Module §6 |
|---|---|---|---|---|---|---|
| FR-01 จับคู่ | S1, C1 · ADR-04 | UC-1 | — | — | SENIOR, CAREGIVER, INVITE_CODE, PAIRING | `pairing` |
| FR-02 สแกนฉลาก | C2 · ADR-03 | UC-2 | §3.2 | — | MEDICATION, MEAL_TIMES | `medication` |
| FR-03 แจ้งเตือน | S2 · ADR-01, ADR-02 | UC-3 | §3.1 | Waiting → Reminding | DOSE_SESSION, DOSE_ITEM | `doseSession` |
| FR-04 ยืนยัน | S2, S3 | UC-4 | §3.1 | Taken, TakenLate | DOSE_SESSION (confirmedAt) | `doseSession` |
| FR-05 แจ้ง Caregiver + สถานะ | C3 | UC-5, UC-6 | §3.1 | Unconfirmed | NOTIFICATION_LOG | `escalation`, `notification` |
| NFR-01 | ADR-02 | — | §3.1 | §4 | NOTIFICATION_LOG | `escalation` |
| NFR-04, NFR-05, NFR-10 | ADR-04 | UC-1 | — | — | PAIRING (consentAt) | `pairing` |
| NFR-06, NFR-09 | ADR-03 · ชั้น Data | UC-2 | §3.2 | — | §5 ทั้งหมด | `medication` |
| NFR-07 | — | — | — | หมายเหตุ §4 | DOSE_SESSION | `doseSession` |

ทุก Must FR (FR-01..05) มีที่อยู่ใน design อย่างน้อย 4 ส่วน — ไม่มี FR ที่ไม่มีที่อยู่ · FR-06..08 (Should / Could) อยู่นอก MVP จึงยังไม่ออกแบบ

### 7.1 Traceability: FR → Operation → Entity → Screen

Operation = ฟังก์ชันใน `prototype/src/logic.js` (และระบบสแกน `qrCode.js`, `readLabel.js`, `labelParser.js`) · ในวงเล็บคือสิ่งที่ทำกับ entity: C = สร้าง, R = อ่าน, U = แก้, D = ลบ

| FR | Operation | Entity (C/R/U/D) | Screen |
|---|---|---|---|
| FR-01 จับคู่ | `newInviteCode` · `qrMatrix` / `readQr` (QR) · `consent` · `pair` · `unpair` · `canAccess` | INVITE_CODE (C, U `usedAt`) · SENIOR (U `consentAt`) · PAIRING (C, R, D) · `unpair` ลบ MEDICATION, MEAL_TIMES, DOSE_SESSION, NOTIFICATION_LOG ของคู่นี้ด้วย (BR-17) | R0, S1, C1 |
| FR-02 สแกนฉลาก | `readLabel` (adapter) · `parseLabel` · `validateDraft` · `setMealTimes` · `reminderTime` · `saveMedication` | MEDICATION (C) · MEAL_TIMES (C, U) | C2 |
| FR-03 แจ้งเตือน | `startDay` · `tick` (รอบเตือน BR-08) · `dueSessions` | DOSE_SESSION (C, U `round`, `status`) · DOSE_ITEM (C) | S2 |
| FR-04 ยืนยัน | `confirm` · `notYet` · `canConfirmLate` · `lateUntil` · `medsOf` | DOSE_SESSION (U `confirmedAt`, `status`) · DOSE_ITEM (R) · MEDICATION (R) | S2, S3 |
| FR-05 แจ้ง Caregiver + สถานะ | `escalate` (เรียกจาก `tick` / `notYet`) · `notify` (เรียกจาก `escalate` / `confirm` ยืนยันช้า) · `dailyStatus` · `statusLabel` | NOTIFICATION_LOG (C) · DOSE_SESSION (R, U `caregiverAlertedAt`) | C3 |
| — (ไม่มี FR รองรับ) | `validSchedule` · `takesOn` — ความถี่ (วันในสัปดาห์) + วันเริ่ม/สิ้นสุด | MEDICATION (C `scheduleDays`, `startDate`, `endDate`) | C2 |

แถวสุดท้ายเป็นฟีเจอร์ที่ทีมเพิ่มใน prototype โดยไม่มี FR ใน SRS — ทีมตัดสิน (12 ต.ค. 2569) ให้คงไว้ใน prototype แต่ไม่เพิ่มเป็น requirement

---

## 8. การตัดสินใจเพิ่มเติม (SRS เดิมยังไม่ได้ระบุ)

| # | เรื่อง | ตัดสินว่า | แก้ที่ |
|---|---|---|---|
| 1 | หน้าสถานะของ Caregiver แสดงคำไหนระหว่าง T ถึง T+15 | แสดง "กำลังเตือน" | `spec.md` BR-14, FR-05 ✓3 · §4 |
| 2 | Caregiver ระบุตัวตนอย่างไร | ผูกกับเครื่อง ไม่มีบัญชี (ง่ายที่สุด) | ADR-05 · §5 CAREGIVER |
