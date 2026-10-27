/*
 * MedMind prototype — หน้าจอ (ชั้น Presentation) · กฎทั้งหมดอยู่ใน logic.js
 * จำลองโทรศัพท์ 2 เครื่องในหน้าเดียว (ไม่มี server) และนาฬิกาจำลอง (ADR-02)
 * รหัสหน้าจอ R0, S1–S3 / C1–C3 ตาม docs/03-design/design-system.md §2 · เลย์เอาต์ตาม design canvas (ธีมฟ้ามิ้นต์)
 */
(function () {
  'use strict';
  const M = window.MedMind, I = window.Icons, fmt = M.fmt, T = M.parseTime;
  // ระบบสแกน: QR (qrCode + qrScanner) และฉลากยา (readLabel → labelParser)
  const QR = window.QrCode, SCANNER = window.QrScanner, OCR = window.ReadLabel, PARSER = window.LabelParser;
  const CAREGIVER = 'caregiver-1';
  const MEAL_OPTIONS = [['breakfast', 'เช้า'], ['lunch', 'กลางวัน'], ['dinner', 'เย็น']];
  const DEFAULT_MEALS = { breakfast: T('07:00'), lunch: T('12:00'), dinner: T('18:00'), bedtime: T('21:00') };
  const DAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  const pad2 = (n) => String(n).padStart(2, '0');
  const isoOf = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return isoOf(d); };
  const thDate = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  const thDay = (iso) => DAYS[new Date(iso + 'T00:00:00').getDay()] + ' ' + thDate(iso);

  let S;
  function reset(startAt) {
    S = {
      store: M.createStore(), now: startAt === undefined ? T('07:30') : startAt,
      role: { senior: false, caregiver: false },   // หน้า R0: แต่ละเครื่องเลือกบทบาทของตัวเองก่อน
      swapped: false,   // เครื่องซ้ายเลือก "ผู้ดูแล" → สลับตำแหน่งโทรศัพท์ ให้เครื่องที่กดเป็นบทบาทที่เลือก
      soundOn: false, reminderOpen: false, dismissed: {}, ringing: false,
      cgTab: 'C1', cgMsg: null, srMsg: null, cameraAllowed: true,
      draft: null, draftNote: null, unreadable: [], mealDraft: null, saved: null, reading: false,
      dialog: null, log: [], autoTimer: null, realTimer: null,
    };
    S.store.today = isoOf(new Date());   // วันที่จำลอง = วันนี้ของเครื่อง
    M.newInviteCode(S.store, S.now);
    M.tick(S.store, S.now);
    log('เริ่มใหม่ เวลา ' + fmt(S.now));
  }

  const esc = (t) => String(t === undefined || t === null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function log(text) { S.log.unshift(fmt(S.now) + ' · ' + text); S.log = S.log.slice(0, 30); }
  const paired = () => !!S.store.pairing;

  /* ---------- เวลาและ event ---------- */

  function advanceTo(target) {
    if (target <= S.now) return;
    target = Math.min(target, M.DAY_END);
    S.now = target;
    handleEvents(M.tick(S.store, S.now));
    render();
  }

  function handleEvents(events) {
    let remind = false;
    events.forEach(function (e) {
      if (e.type === 'remind') {
        remind = true;
        delete S.dismissed[e.sessionId];
        const sess = S.store.sessions.find((x) => x.id === e.sessionId);
        log('เตือนรอบ ' + e.round + ' มื้อ ' + fmt(sess.T) + (e.round > 1 ? ' (แจ้งซ้ำ)' : ''));
      }
      if (e.type === 'notify') log('แจ้ง Caregiver: "' + e.notification.message + '"');
    });
    if (remind) { S.reminderOpen = true; S.ringing = true; beep(); }   // เตือนพร้อมกันหลายมื้อ = เสียงครั้งเดียว (BR-16)
  }

  /* ---------- เสียง (เล่นได้หลังแตะหน้าจอครั้งแรก — SRS §2.2, ADR-01) ---------- */

  let audio = null;
  function enableSound() {
    if (S.soundOn) return;
    try { audio = new (window.AudioContext || window.webkitAudioContext)(); S.soundOn = true; log('Senior แตะหน้าจอ — เปิดเสียงเตือนแล้ว'); }
    catch (e) { S.soundOn = false; }
  }
  function beep() {
    if (!S.soundOn || !audio) return;
    [0, 0.35, 0.7].forEach(function (t) {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(audio.destination);
      g.gain.setValueAtTime(0.25, audio.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + t + 0.3);
      o.start(audio.currentTime + t); o.stop(audio.currentTime + t + 0.3);
    });
  }

  /* ---------- QR รหัสเชิญ (FR-01 ✓1) ---------- */

  const QR_QUIET_ZONE = 4;   // ขอบขาวรอบ QR 4 ช่องตามมาตรฐาน ให้กล้องจับได้
  function drawQR(canvas, code) {
    const rows = QR.qrMatrix(code), n = rows.length + QR_QUIET_ZONE * 2, ctx = canvas.getContext('2d');
    const css = getComputedStyle(document.documentElement);
    canvas.width = n; canvas.height = n;
    ctx.fillStyle = css.getPropertyValue('--color-surface').trim(); ctx.fillRect(0, 0, n, n);
    ctx.fillStyle = css.getPropertyValue('--color-frame').trim();
    rows.forEach(function (row, y) {
      row.forEach(function (dark, x) { if (dark) ctx.fillRect(x + QR_QUIET_ZONE, y + QR_QUIET_ZONE, 1, 1); });
    });
  }

  /* ---------- ส่วนประกอบ ---------- */

  const badge = (sess) => '<span class="badge ' + sess.status + '">' + esc(M.statusLabel(sess)) + '</span>';
  const msg = (m) => m ? '<div class="msg ' + m.kind + '">' + esc(m.text) + '</div>' : '';
  const STATUS_ICON = { waiting: 'clock', reminding: 'bell', unconfirmed: 'clock', taken: 'check', takenLate: 'check' };
  const statusIcon = (status) => '<span class="row-ic ' + status + '">' + I.svg(STATUS_ICON[status] || 'clock', 22) + '</span>';
  const medSummary = (sess) => M.medsOf(S.store, sess).map((m) => esc(m.name) + ' ' + m.tabletsPerDose + ' เม็ด').join(' · ');
  // การ์ดยาบนหน้าเตือน (S2): ชื่อยา 24 px + จำนวนเม็ด + ข้อควรระวัง / ข้อห้ามใช้
  function medCards(sess) {
    return M.medsOf(S.store, sess).map(function (m) {
      return '<div class="card med-card"><div class="med-row"><span class="med-ic-box">' + I.svg('pill', 26) + '</span>' +
        '<div class="med-name">' + esc(m.name) + '</div><span class="chip-dose">' + m.tabletsPerDose + ' เม็ด</span></div>' +
        (m.warnings ? '<div><b>ข้อควรระวัง:</b> ' + esc(m.warnings) + '</div>' : '') +
        (m.contraindications ? '<div><b>ข้อห้ามใช้:</b> ' + esc(m.contraindications) + '</div>' : '') +
        '</div>';
    }).join('');
  }
  const statusBar = () => '<div class="statusbar"><span>' + fmt(S.now) + '</span><span class="sb-ic">' + I.svg('signal', 16) + I.svg('battery', 20) + '</span></div>';
  const mealHead = (sess, right) => '<div class="meal-head"><span class="meal-time">' + I.svg('clock', 24) + ' ' + fmt(sess.T) + ' น.</span>' + right + '</div>';
  // แถวบน: ปุ่มย้อนกลับ หรือรูปโปรไฟล์ + คำทักทาย + หัวข้อ
  function topbar(o) {
    return '<div class="topbar">' +
      (o.back ? '<button class="round-btn" data-act="role-back" data-side="' + o.back + '" aria-label="ย้อนกลับ">' + I.svg('back', 24) + '</button>' : '') +
      (o.avatar ? I.avatar(o.avatar, 56) : '') +
      '<div class="topbar-text">' + (o.hello ? '<span class="muted">' + o.hello + '</span>' : '') +
      (o.title ? '<span class="topbar-title">' + o.title + '</span>' : '') + '</div>' + (o.right || '') + '</div>';
  }
  // การ์ดหลักสีฟ้ามิ้นต์ (ตัวอักษรเข้ม --color-on-mint)
  const heroCard = (inner, art, cls) => '<div class="hero-card' + (cls ? ' ' + cls : '') + '">' + (art ? '<div class="hero-art">' + art + '</div>' : '') + inner + '</div>';
  const pillArt = () => '<svg width="104" height="104" viewBox="0 0 80 80" aria-hidden="true"><g transform="rotate(-35 40 40)">' +
    '<rect x="8" y="26" width="64" height="28" rx="14" style="fill: var(--color-surface)"/><path d="M40 26h18a14 14 0 0 1 0 28H40z" style="fill: var(--color-primary)"/></g></svg>';
  function unpairDialog(side) {
    if (S.dialog !== side) return '';
    return '<div class="dialog"><div class="card"><h3>ยกเลิกการจับคู่?</h3>' +
      '<p>ข้อมูลยาและประวัติการยืนยันของคู่นี้จะถูกลบ และผู้ดูแลจะดูข้อมูลไม่ได้อีก</p>' +
      '<button class="btn danger" data-act="unpair-confirm">ยืนยันยกเลิกการจับคู่</button>' +
      '<button class="btn ghost" data-act="unpair-cancel">ไม่ยกเลิก</button></div></div>';
  }

  /* ---------- R0 เลือกบทบาท (ขึ้นทั้ง 2 เครื่อง · แต่ละเครื่องเลือกได้เฉพาะบทบาทของตัวเอง) ---------- */

  function roleScreen(side) {
    // เลือกได้ทั้ง 2 บทบาทเสมอ — โทรศัพท์จริงไม่รู้ว่าอีกเครื่องเลือกอะไรก่อนจับคู่
    const card = (key, title, desc, art, tone) =>
      '<button class="role-card" data-act="role" data-side="' + side + '" data-role="' + key + '">' +
        '<span class="role-art ' + tone + '">' + art + '</span>' +
        '<span class="role-body"><span class="role-text"><span class="role-title">' + title + '</span>' +
        '<span class="muted">' + desc + '</span></span>' +
        '<span class="role-go">' + I.svg('arrow', 24) + '</span></span></button>';
    return '<div class="brand">' + I.mascot(40) + '<span>MedMind</span></div>' +
      '<h3 class="page-title">ยินดีต้อนรับ</h3><p class="muted lead">คุณใช้ MedMind ในฐานะใคร</p>' +
      card('senior', 'ผู้สูงอายุ', 'รับการเตือนกินยา กดยืนยันได้ในแตะเดียว', I.couple(236, 'คุณตาและคุณยาย'), 'mint') +
      card('caregiver', 'ผู้ดูแล / ลูกหลาน', 'เพิ่มยาและดูสถานะการกินยา', I.carer(124, 'ลูกหลานผู้ดูแล'), 'soft');
  }

  /* ---------- Senior ---------- */

  function seniorScreen() {
    if (!S.role.senior) return 'R0';
    if (!paired()) return 'S1';
    const due = M.dueSessions(S.store, S.now).filter((x) => !S.dismissed[x.id]);
    return S.reminderOpen && due.length ? 'S2' : 'S3';
  }

  function renderSenior() {
    const el = document.getElementById('senior');
    const scr = seniorScreen();
    const covers = { R0: 'R0 · เลือกบทบาท', S1: 'S1 · Covers: FR-01', S2: 'S2 · Covers: FR-03, FR-04', S3: 'S3 · Covers: FR-04 (BR-15)' }[scr];
    const soundBanner = !S.soundOn && scr !== 'S1' && scr !== 'R0'
      ? '<button class="banner" data-act="sound">' + I.svg('sound', 22) + ' แตะที่นี่เพื่อเปิดเสียงเตือน</button>' : '';
    let body = '';

    if (scr === 'R0') body = roleScreen('senior');

    if (scr === 'S1') {
      const inv = S.store.invite, expired = S.now >= inv.expiresAt || inv.usedAt !== null;
      body += topbar({ back: 'senior' }) +
        '<div class="intro">' + I.couple(186, 'คุณตาและคุณยาย') + '<h3 class="page-title">เชื่อมต่อกับลูกหลาน</h3>' +
        '<p class="muted lead">ให้ลูกหลานสแกน QR หรือใส่รหัส 6 หลัก</p></div>' +
        '<div class="card center"><div class="qr-frame"><canvas class="qr" id="qr" role="img" aria-label="QR รหัสเชิญ"></canvas></div>' +
        '<div class="muted">' + (expired ? 'รหัสนี้หมดอายุแล้ว — กดสร้างรหัสใหม่' : 'รหัสเชิญ · ใช้ได้ 1 ครั้ง ถึงเวลา ' + fmt(inv.expiresAt)) + '</div>' +
        '<div class="code">' + inv.code + '</div></div>' +
        (S.store.senior.consentAt === null
          ? '<button class="btn taken" data-act="consent">' + I.svg('check', 24) + ' ยินยอมให้ลูกหลานเชื่อมต่อ</button>'
          : '<div class="msg ok">ยินยอมแล้ว · รอลูกหลานสแกน QR หรือใส่รหัส</div>') +
        '<button class="btn ghost" data-act="new-code">สร้างรหัสใหม่</button>' + msg(S.srMsg);
    }

    if (scr === 'S2') {
      const due = M.dueSessions(S.store, S.now).filter((x) => !S.dismissed[x.id]);
      const only = due.length === 1 && due[0].status === 'reminding' ? due[0] : null;
      body += '<div class="alarm-band"><span class="chip">' + (only ? 'เตือนครั้งที่ ' + only.round + ' จาก 3' : 'มีมื้อที่ต้องยืนยัน ' + due.length + ' มื้อ') + '</span>' +
        '<span class="alarm-bell">' + I.svg('bell', 34) + '</span><h3>ถึงเวลากินยา</h3><div class="alarm-sub">เวลา ' + fmt(S.now) + ' น.</div></div>' +
        soundBanner + due.map(function (sess) {
          const late = sess.status === 'unconfirmed';
          return '<section class="dose">' + mealHead(sess, late ? badge(sess) : '<span class="muted">รอบ ' + sess.round + '/3</span>') +
            '<div class="muted">ยาในมื้อนี้ ' + M.medsOf(S.store, sess).length + ' ตัว</div>' + medCards(sess) +
            '<button class="btn taken" data-act="taken" data-id="' + sess.id + '">' + I.svg('check', 26) + ' กินแล้ว</button>' +
            '<button class="btn not-yet" data-act="not-yet" data-id="' + sess.id + '">' + I.svg('x', 24) + ' ยังไม่กิน</button></section>';
        }).join('');
    }

    if (scr === 'S3') {
      const sessions = S.store.sessions;
      const next = sessions.find((x) => x.status === 'reminding') || sessions.find((x) => x.status === 'waiting');
      body += topbar({ avatar: 'senior', hello: 'สวัสดี · วันนี้ ' + thDate(S.store.today), title: 'เวลา ' + fmt(S.now) + ' น.' });
      if (next) {
        body += heroCard('<span class="chip">มื้อถัดไป</span><div class="hero-time">' + fmt(next.T) + '</div>' +
          '<div class="hero-sub">ยา ' + M.medsOf(S.store, next).length + ' ตัว</div><div>' + badge(next) + '</div>' +
          (next.status === 'reminding' ? '<button class="btn white" data-act="open-reminder">ดูยามื้อนี้ ' + I.svg('arrow', 22) + '</button>' : ''), pillArt());
      } else if (sessions.length) {
        body += heroCard('<span class="chip">วันนี้</span><div class="hero-big">ไม่มีมื้อที่รออยู่แล้ว</div>', pillArt());
      }
      body += soundBanner + msg(S.srMsg) + '<h4 class="section-title">ตารางยาวันนี้</h4>';
      if (!sessions.length) body += '<div class="card center muted">ยังไม่มีมื้อยาวันนี้</div>';
      sessions.forEach(function (sess) {
        const canLate = M.canConfirmLate(S.store, sess, S.now);
        body += '<div class="card row-card' + (canLate ? ' alert' : '') + '"><div class="row-main">' + statusIcon(sess.status) +
          '<div class="row-text"><span class="row-time">' + fmt(sess.T) + ' น.</span><span class="muted">' + medSummary(sess) + '</span>' + badge(sess) + '</div></div>' +
          (sess.status === 'reminding' ? '<button class="btn" data-act="open-reminder">ดูหน้าเตือน</button>' : '') +
          (canLate ? '<div class="muted">ยืนยันช้าได้ถึง ' + fmt(Math.min(M.lateUntil(S.store, sess), M.DAY_END)) + '</div>' +
                     '<button class="btn taken" data-act="taken" data-id="' + sess.id + '">' + I.svg('check', 24) + ' กินแล้ว</button>' : '') +
          '</div>';
      });
      body += '<div class="center"><button class="link" data-act="unpair-ask" data-side="senior">ยกเลิกการจับคู่</button></div>';
    }

    document.getElementById('senior-covers').textContent = covers;
    el.className = 'phone' + (scr === 'S2' ? ' mint-top' : '');
    el.innerHTML = statusBar() + '<div class="screen' + (S.ringing && scr === 'S2' ? ' ring' : '') + '">' +
      body + '</div>' + unpairDialog('senior');
    if (scr === 'S1') drawQR(document.getElementById('qr'), S.store.invite.code);
  }

  /* ---------- Caregiver ---------- */

  function renderCaregiver() {
    const el = document.getElementById('caregiver');
    if (!paired()) S.cgTab = 'C1';
    const tab = S.role.caregiver ? S.cgTab : 'R0';
    const covers = { R0: 'R0 · เลือกบทบาท', C1: 'C1 · Covers: FR-01', C2: 'C2 · Covers: FR-02', C3: 'C3 · Covers: FR-05' }[tab];
    const drafting = tab === 'C2' && S.draft;
    let tabs = '';
    if (tab !== 'R0' && paired() && !drafting) {
      tabs = '<nav class="tabs" aria-label="เมนูหลัก">' + [['C3', 'สถานะ', 'home'], ['C2', 'เพิ่มยา', 'plus'], ['C1', 'จับคู่', 'link']].map(function (t) {
        return '<button class="' + (t[0] === tab ? 'active' : '') + '" data-act="tab" data-tab="' + t[0] + '"' + (t[0] === tab ? ' aria-current="page"' : '') + '>' +
          I.svg(t[2], 22) + '<span>' + t[1] + '</span></button>';
      }).join('') + '</nav>';
    }
    let body = '';
    if (tab === 'R0') body = roleScreen('caregiver');
    if (tab === 'C1') body = caregiverPairing();
    if (tab === 'C2') body = caregiverAddMedication();
    if (tab === 'C3') body = caregiverStatus();
    const bottom = drafting
      ? '<div class="bottom-bar"><button class="btn ghost" data-act="cancel-draft">ยกเลิก</button>' +
        '<button class="btn taken" id="save-btn" data-act="save">บันทึก</button></div>' : '';
    document.getElementById('caregiver-covers').textContent = covers;
    el.innerHTML = statusBar() + '<div class="screen' + (tabs ? ' has-tabs' : '') + '">' + body + '</div>' + bottom + tabs + unpairDialog('caregiver');
  }

  const cgTop = (title, right) => topbar({ avatar: 'caregiver', hello: 'สวัสดี ผู้ดูแล', title: title, right: right });

  function caregiverPairing() {
    if (paired()) {
      return cgTop('การจับคู่') +
        heroCard('<div class="hero-text"><span class="hero-title">เชื่อมต่อแล้ว</span><span class="hero-sub">กับโทรศัพท์ของผู้สูงอายุ</span></div>', I.couple(124), 'with-art') +
        msg(S.cgMsg) + '<button class="btn danger" data-act="unpair-ask" data-side="caregiver">ยกเลิกการจับคู่</button>';
    }
    return topbar({ back: 'caregiver', title: 'จับคู่' }) +
      heroCard('<div class="hero-text"><span class="hero-title">เชื่อมต่อกับผู้สูงอายุ</span><span class="hero-sub">สแกน QR หรือใส่รหัสจากโทรศัพท์ผู้สูงอายุ</span></div>', I.couple(124), 'with-art') +
      '<div class="card">' +
      (S.cameraAllowed
        ? qrScanControls() + '<div class="divider">หรือใส่รหัส 6 หลัก</div>'
        : '<div class="msg info">ไม่ได้รับอนุญาตใช้กล้อง — ใส่รหัส 6 หลักแทน</div>') +
      '<div class="field"><label for="code-in">รหัส 6 หลัก</label><input id="code-in" inputmode="numeric" maxlength="6" placeholder="000000"></div>' +
      '<button class="btn" data-act="pair-code">เชื่อมต่อ</button></div>' + msg(S.cgMsg);
  }

  // ระหว่างเปิดกล้อง: ช่องวิดีโอ (qrScanner.mount ใส่วิดีโอหลังวาดหน้าจอ) · ปกติ: ปุ่มสแกน + ทางสำรองเลือกรูป
  function qrScanControls() {
    if (SCANNER.isScanning()) {
      return '<div id="qr-slot"></div><p class="muted center">เล็งกล้องไปที่ QR บนโทรศัพท์ผู้สูงอายุ</p>' +
        '<button class="btn ghost" data-act="scan-stop">หยุดสแกน</button>';
    }
    return '<button class="btn" data-act="scan-qr">' + I.svg('qr', 26) + ' สแกน QR</button>' +
      '<div class="center"><button class="link" data-act="pick-qr">เลือกรูป QR จากเครื่อง</button></div>';
  }

  const PAIR_ERRORS = {
    NO_CONSENT: 'รอผู้สูงอายุกดยินยอมก่อน ยังไม่เชื่อมต่อ',
    INVALID_CODE: 'รหัสไม่ถูกต้องหรือหมดอายุ ขอรหัสใหม่จากผู้สูงอายุ',
    ALREADY_PAIRED: 'ผู้สูงอายุท่านนี้มีผู้ดูแลแล้ว',
  };
  function tryPair(caregiverId, code) {
    const r = M.pair(S.store, caregiverId, code, S.now);
    if (r.ok) { S.cgMsg = null; S.srMsg = null; S.cgTab = 'C2'; log('จับคู่สำเร็จ (FR-01 ✓3)'); }
    else { log('จับคู่ไม่สำเร็จ: ' + PAIR_ERRORS[r.error]); }
    return r;
  }

  function caregiverAddMedication() {
    let h = cgTop('เพิ่มยา') +
      heroCard('<div class="hero-row"><span class="hero-ic">' + I.svg('camera', 26) + '</span><div class="hero-text"><span class="hero-title">เพิ่มยาจากฉลาก</span>' +
        '<span class="hero-sub">' + (S.draft ? 'ระบบอ่านฉลากให้แล้ว แก้ให้ถูกก่อนบันทึก' : 'ถ่ายรูปฉลากยา แล้วตรวจก่อนบันทึก') + '</span></div></div>') + msg(S.cgMsg);
    if (S.saved) {
      h += '<div class="card"><div class="section-label">ยาที่บันทึกแล้ว</div>' + S.store.medications.map(function (m) {
        return '<div class="med">' + I.svg('pill', 22, 'med-ic') + '<span>' + esc(m.name) + ' · ' + m.tabletsPerDose + ' เม็ด · เตือน ' + fmt(m.reminderTime) +
          '<span class="muted block">' + scheduleLabel(m.schedule) + '</span></span></div>';
      }).join('') + '</div>';
    }
    if (S.reading) {
      return h + '<div class="card center" role="status"><b>กำลังอ่านฉลาก…</b>' +
        '<div class="muted" id="ocr-progress">ครั้งแรกใช้เวลานานกว่า (โหลดตัวอ่านฉลากในเครื่อง)</div></div>';
    }
    if (!S.draft) {
      return h + (S.cameraAllowed
        ? '<button class="btn" data-act="scan-label">' + I.svg('camera', 26) + ' ถ่ายรูป / เลือกรูปฉลาก</button>' +
          '<p class="muted small center">ไม่มีฉลากจริง ใช้รูปตัวอย่างในโฟลเดอร์ prototype/samples/</p>'
        : '<div class="msg info">ไม่ได้รับอนุญาตใช้กล้อง — กรอกข้อมูลยาเอง</div>') +
        '<button class="btn ghost" data-act="manual">กรอกข้อมูลเอง</button>';
    }
    const d = S.draft, t = d.timing;
    const flag = (f) => S.unreadable.includes(f) && isEmptyField(f) ? ' check' : '';
    const tag = (f) => flag(f) ? '<span class="check-tag">กรุณาตรวจสอบ</span>' : '';
    h += (S.draftNote ? msg(S.draftNote) : '') + '<div class="card">' +
      '<div class="field' + flag('name') + '"><label>ชื่อยา' + tag('name') + '</label><input data-f="name" value="' + esc(d.name) + '"></div>' +
      '<div class="field' + flag('tabletsPerDose') + '"><label>จำนวนเม็ดต่อครั้ง' + tag('tabletsPerDose') + '</label><input data-f="tabletsPerDose" type="number" min="1" value="' + esc(d.tabletsPerDose) + '"></div>' +
      '<div class="field' + flag('type') + '"><label>เวลากินตามฉลาก' + tag('type') + '</label><select data-f="type">' +
        options([['after', 'หลังอาหาร'], ['before', 'ก่อนอาหาร'], ['bedtime', 'ก่อนนอน']], t.type) + '</select></div>' +
      (t.type !== 'bedtime' ? '<div class="field' + flag('meal') + '"><label>มื้อ' + tag('meal') + '</label><select data-f="meal">' +
        options(MEAL_OPTIONS, t.meal) + '</select></div>' : '') +
      (t.type === 'before' ? '<div class="field' + flag('minutes') + '"><label>ก่อนอาหารกี่นาที' + tag('minutes') + '</label><input data-f="minutes" type="number" min="1" value="' + esc(t.minutes) + '"></div>' : '') +
      '<div class="field"><label>ข้อควรระวัง (ถ้าฉลากมี)</label><input data-f="warnings" value="' + esc(d.warnings) + '"></div>' +
      '<div class="field"><label>ข้อห้ามใช้ (ถ้าฉลากมี)</label><input data-f="contraindications" value="' + esc(d.contraindications) + '"></div>' +
      '</div>';
    if (!S.store.mealTimes) {
      const md = S.mealDraft;
      h += '<div class="card"><h4 class="section-title">ตั้งเวลามื้อ (ครั้งแรก)</h4><div class="grid2">' +
        [['breakfast', 'มื้อเช้า'], ['lunch', 'มื้อกลางวัน'], ['dinner', 'มื้อเย็น'], ['bedtime', 'เข้านอน']].map(function (k) {
          return '<div class="field"><label>' + k[1] + '</label><input type="time" data-meal="' + k[0] + '" value="' + fmt(md[k[0]]) + '"></div>';
        }).join('') + '</div></div>';
    }
    h += scheduleForm(d.schedule) + '<div class="msg info" id="preview"></div>';
    return h;
  }

  // ตัวเลือกของ <select> · ค่ายังว่าง (อ่านจากฉลากไม่ได้) → แสดง "เลือก" ไม่เลือกให้เอง (BR-04)
  function options(list, value) {
    return (value ? '' : '<option value="" selected disabled>— เลือก —</option>') +
      list.map((o) => '<option value="' + o[0] + '"' + (value === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('');
  }

  // ความถี่ + วันเริ่ม–สิ้นสุด (กฎอยู่ใน logic.js: validSchedule, takesOn)
  function scheduleLabel(sc) {
    if (!sc) return 'ทุกวัน';
    const f = sc.days.length === 7 ? 'ทุกวัน' : 'ทุก ' + sc.days.map((d) => DAYS[d]).join(' ');
    return f + ' · ' + thDate(sc.start) + (sc.end ? ' – ' + thDate(sc.end) : ' เป็นต้นไป');
  }
  function scheduleForm(sc) {
    const days = DAYS.map(function (d, i) {
      const on = sc.days.includes(i);
      return '<label class="day-chip' + (on ? ' on' : '') + '"><input type="checkbox" data-day="' + i + '"' + (on ? ' checked' : '') + '><span>' + d + '</span></label>';
    }).join('');
    return '<h4 class="section-title">ความถี่</h4><div class="card freq-card">' +
      '<div class="freq-text"><b>วันในสัปดาห์</b><span class="muted">เลือกวันที่จะกิน</span></div>' +
      '<div class="day-chips" role="group" aria-label="วันที่จะกินยา">' + days + '</div></div>' +
      '<div class="date-grid"><div class="card date-card"><label for="sc-start">' + I.svg('play', 18) + ' เริ่มต้น</label>' +
      '<input id="sc-start" type="date" data-s="start" value="' + sc.start + '"></div>' +
      '<div class="card date-card"><label for="sc-end">' + I.svg('stop', 18) + ' วันสิ้นสุด</label>' +
      (sc.end ? '<input id="sc-end" type="date" data-s="end" min="' + sc.start + '" value="' + sc.end + '">' : '<div class="date-none">ไม่มี</div>') +
      '<label class="no-end"><input type="checkbox" data-s="noEnd"' + (sc.end ? '' : ' checked') + '> ไม่มีวันสิ้นสุด</label></div></div>';
  }

  function isEmptyField(f) {
    const d = S.draft;
    if (f === 'minutes') return !(Number(d.timing.minutes) > 0);
    if (f === 'tabletsPerDose') return !(Number(d.tabletsPerDose) > 0);
    if (f === 'type' || f === 'meal') return !d.timing[f];
    return !String(d[f] || '').trim();
  }

  // อัปเดตปุ่มบันทึกและเวลาเตือนโดยไม่วาดฟอร์มใหม่ (ไม่ให้ช่องที่กำลังพิมพ์หลุด)
  // ช่องที่ยังขาด → ชื่อที่แสดงในข้อความ + กล่องที่ขึ้นกรอบสีส้ม
  const MISSING = {
    name: ['ชื่อยา', '[data-f=name]'], tabletsPerDose: ['จำนวนเม็ดต่อครั้ง', '[data-f=tabletsPerDose]'],
    timing: ['เวลากินตามฉลาก', '[data-f=type]'], meal: ['มื้อ', '[data-f=meal]'], minutes: ['ก่อนอาหารกี่นาที', '[data-f=minutes]'],
  };
  function scheduleProblem(sc) {
    if (!sc.days.length) return ['ความถี่ (เลือกอย่างน้อย 1 วัน)', '.freq-card'];
    if (!sc.start) return ['วันเริ่มต้น', '#sc-start'];
    return ['วันสิ้นสุด (ต้องไม่ก่อนวันเริ่มต้น)', '#sc-end'];
  }
  function refreshDraft() {
    const btn = document.getElementById('save-btn'); if (!btn) return;
    const problems = M.validateDraft(S.draft);
    btn.disabled = problems.length > 0;
    const root = document.getElementById('caregiver');
    root.querySelectorAll('.missing').forEach((el) => el.classList.remove('missing'));
    const found = problems.map((p) => p === 'schedule' ? scheduleProblem(S.draft.schedule) : MISSING[p]).filter(Boolean);
    found.forEach(function (m) {
      const el = root.querySelector(m[1]);
      if (el) (el.closest('.field') || el.closest('.date-card') || el).classList.add('missing');
    });
    const preview = document.getElementById('preview'), mt = S.store.mealTimes || S.mealDraft;
    preview.className = 'msg ' + (found.length ? 'warn' : 'info');
    preview.textContent = found.length
      ? 'ยังกรอกไม่ครบ: ' + found.map((m) => m[0]).join(', ') + ' — แก้ช่องที่มีกรอบสีส้มก่อนบันทึก'
      : 'เวลาเตือน: ' + fmt(M.reminderTime(S.draft.timing, mt)) + ' · ' + scheduleLabel(S.draft.schedule);
  }


  function caregiverStatus() {
    const st = M.dailyStatus(S.store, CAREGIVER);
    if (!st.ok) return '<div class="msg error">ไม่มีสิทธิ์ดูข้อมูลนี้</div>';
    const sessions = S.store.sessions;
    const notes = S.store.notifications.slice().reverse();
    const alertDot = notes.some((n) => n.type === 'UNCONFIRMED') ? '<span class="dot"></span>' : '';
    let h = cgTop('สถานะวันนี้', '<span class="round-btn" aria-hidden="true">' + I.svg('bell', 24) + alertDot + '</span>');
    if (sessions.length) {
      const done = sessions.filter((x) => x.status === 'taken' || x.status === 'takenLate').length;
      h += heroCard('<span class="hero-sub">สถานะการกินยาของผู้สูงอายุ</span><div class="hero-big">กินแล้ว ' + done + ' จาก ' + sessions.length + ' มื้อ</div>' +
        '<div class="progress"><span style="width:' + Math.round(done * 100 / sessions.length) + '%"></span></div>');
    }
    if (notes.length) {
      h += '<h4 class="section-title">การแจ้งเตือน</h4>' + notes.map(function (n) {
        const bad = n.type === 'UNCONFIRMED';
        return '<div class="card note ' + n.type + '">' + statusIcon(bad ? 'unconfirmed' : 'taken') +
          '<div><b>' + esc(n.message) + '</b><div class="muted">แจ้งเมื่อ ' + fmt(n.sentAt) + '</div></div></div>';
      }).join('');
    }
    if (!sessions.length) return h + '<div class="card center muted">ยังไม่มีมื้อยาวันนี้</div>';
    return h + '<h4 class="section-title">ทุกมื้อวันนี้</h4><div class="card list-card">' + sessions.map(function (sess) {
      return '<div class="list-row"><div class="row-text"><span class="row-time">' + fmt(sess.T) + ' น.</span><span class="muted">' + medSummary(sess) + '</span></div>' + badge(sess) + '</div>';
    }).join('') + '</div>';
  }

  /* ---------- แถบ demo ---------- */

  function renderDemo() {
    document.getElementById('demo').innerHTML =
      '<h1>MedMind — Clickable Prototype</h1>' +
      '<div class="row"><span>วันที่จำลอง</span><span class="day">' + thDay(S.store.today) + '</span>' +
      '<button data-act="next-day"' + (S.realTimer ? ' disabled' : '') + '>ไปวันถัดไป (06:00)</button>' +
      '<label class="realtime"><input type="checkbox" data-act="realtime"' + (S.realTimer ? ' checked' : '') + '> ใช้เวลาจริงของเครื่อง</label>' +
      (S.realTimer ? '<span class="hint">นาฬิกาเดินตามเวลาจริง · เปิดหน้าเว็บค้างไว้ถึงจะเตือน</span>' : '') + '</div>' +
      '<div class="row"><span>เวลาจำลอง</span><span class="clock">' + fmt(S.now) + '</span>' +
      '<button data-act="adv" data-min="1"' + (S.realTimer ? ' disabled' : '') + '>+1 นาที</button><button data-act="adv" data-min="5"' + (S.realTimer ? ' disabled' : '') + '>+5 นาที</button>' +
      '<button data-act="adv" data-min="15"' + (S.realTimer ? ' disabled' : '') + '>+15 นาที</button>' +
      '<input type="time" id="goto" value="' + fmt(Math.min(S.now + 30, M.DAY_END)) + '"' + (S.realTimer ? ' disabled' : '') + '><button data-act="goto"' + (S.realTimer ? ' disabled' : '') + '>ไปที่เวลา</button>' +
      '<button data-act="auto"' + (S.realTimer ? ' disabled' : '') + '>' + (S.autoTimer ? '⏸ หยุดเดินเวลา' : '▶ เดินเวลา 1 นาที/วินาที') + '</button></div>' +
      '<div class="row"><span>สถานการณ์:</span>' +
      '<button data-act="scenario" data-s="basic">มื้อ 08:00 มียา 2 ตัว (FR-03 ✓1)</button>' +
      '<button data-act="scenario" data-s="overlap">มื้อซ้อน 06:45 + 07:00 (FR-03 ✗4)</button>' +
      '<button data-act="caregiver2">Caregiver คนที่ 2 ใส่รหัส (FR-01 ✗5)</button>' +
      '<label><input type="checkbox" data-act="camera"' + (S.cameraAllowed ? '' : ' checked') + '> ไม่อนุญาตกล้อง</label>' +
      '<button data-act="reset">เริ่มใหม่</button></div>' +
      '<div class="hint">ข้อมูลอยู่ในหน้าเว็บนี้เท่านั้น (ไม่มี server) · รีเฟรชหน้า = เริ่มใหม่</div>' +
      '<ul class="log">' + S.log.map((l) => '<li>' + esc(l) + '</li>').join('') + '</ul>';
  }

  function render() {
    document.querySelector('.phones').classList.toggle('swapped', !!S.swapped);
    renderDemo(); renderSenior(); renderCaregiver(); refreshDraft(); S.ringing = false;
    SCANNER.mount(document.getElementById('qr-slot'));   // กล้องสแกน QR: ย้ายวิดีโอเข้าหน้าจอใหม่ หรือปิดถ้าออกจากหน้าแล้ว
  }

  /* ---------- สถานการณ์ตัวอย่าง ---------- */

  function scenario(name) {
    stopAuto(); stopReal();
    const basic = name === 'basic';
    reset(basic ? T('07:55') : T('06:40'));
    S.role = { senior: true, caregiver: true }; S.swapped = false;   // สถานการณ์ตัวอย่างข้ามหน้าเลือกบทบาท
    M.consent(S.store, S.now); tryPair(CAREGIVER, S.store.invite.code);
    M.setMealTimes(S.store, basic ? { breakfast: T('08:00'), lunch: T('12:00'), dinner: T('18:00'), bedtime: T('21:00') }
                                  : { breakfast: T('07:00'), lunch: T('12:00'), dinner: T('18:00'), bedtime: T('21:00') });
    const meds = basic
      ? [{ name: 'ยาตัวอย่าง A', tabletsPerDose: 1, timing: { type: 'after', meal: 'breakfast' }, warnings: 'อาจทำให้ง่วงซึม', contraindications: 'ห้ามใช้ร่วมกับแอลกอฮอล์' },
         { name: 'ยาตัวอย่าง B', tabletsPerDose: 2, timing: { type: 'after', meal: 'breakfast' }, warnings: 'กินพร้อมน้ำเปล่า 1 แก้ว', contraindications: '' },
         { name: 'ยาตัวอย่าง C', tabletsPerDose: 1, timing: { type: 'after', meal: 'lunch' }, warnings: '', contraindications: '' }]
      : [{ name: 'ยาก่อนอาหาร', tabletsPerDose: 1, timing: { type: 'before', meal: 'breakfast', minutes: 15 }, warnings: '', contraindications: '' },
         { name: 'ยาหลังอาหาร', tabletsPerDose: 1, timing: { type: 'after', meal: 'breakfast' }, warnings: '', contraindications: '' }];
    meds.forEach((d) => M.saveMedication(S.store, d, S.now));
    S.saved = true; S.cgTab = 'C3';
    log('โหลดสถานการณ์: ' + (basic ? 'มื้อ 08:00 มียา 2 ตัว + มื้อกลางวัน 12:00' : 'มื้อ 06:45 และ 07:00 ซ้อนกัน'));
    render();
  }

  function stopAuto() { if (S && S.autoTimer) { clearInterval(S.autoTimer); S.autoTimer = null; } }

  // โหมดเวลาจริง: นาฬิกาจำลองเดินตามนาฬิกาเครื่อง (เช็กทุก 5 วินาที) · ไม่มี server จึงเตือนได้เฉพาะตอนเปิดหน้าเว็บค้างไว้
  const realClock = () => { const d = new Date(); return { iso: isoOf(d), min: d.getHours() * 60 + d.getMinutes() }; };
  function syncReal(first) {
    const r = realClock();
    if (r.iso !== S.store.today || r.min < S.now) {
      // วันจริงไม่ตรงกับวันจำลอง หรือนาฬิกาจำลองเดินเลยเวลาจริงไปแล้ว → เริ่มวันตามเวลาจริง (มื้อที่ผ่านไปแล้วไม่สร้างย้อนหลัง)
      const newDay = r.iso !== S.store.today;
      M.startDay(S.store, r.iso, first || !newDay ? r.min : 0);
      S.now = r.min; S.reminderOpen = false; S.dismissed = {};
      log('ใช้เวลาจริง: ' + thDay(r.iso) + ' ' + fmt(r.min) + ' · มื้อยาที่เหลือวันนี้ ' + S.store.sessions.length + ' มื้อ');
      handleEvents(M.tick(S.store, S.now));
      render();
    } else if (r.min > S.now) {
      advanceTo(r.min);
    } else if (first) {
      render();
    }
  }
  function startReal() { stopAuto(); stopReal(); S.realTimer = setInterval(function () { syncReal(false); }, 5000); log('เปิดโหมดเวลาจริง'); syncReal(true); }
  function stopReal() { if (S && S.realTimer) { clearInterval(S.realTimer); S.realTimer = null; } }

  /* ---------- การกด ---------- */

  document.addEventListener('click', function (ev) {
    const t = ev.target.closest('[data-act]');
    if (ev.target.closest('#senior')) enableSound();     // แตะหน้าจอ Senior ครั้งแรก = เปิดเสียงได้
    if (!t) { if (ev.target.closest('#senior')) render(); return; }
    const act = t.dataset.act, id = t.dataset.id;
    switch (act) {
      case 'adv': advanceTo(S.now + Number(t.dataset.min)); return;
      case 'goto': { const v = T(document.getElementById('goto').value); if (v !== null) advanceTo(v); return; }
      case 'auto':
        if (S.autoTimer) stopAuto();
        else S.autoTimer = setInterval(function () { if (S.now >= M.DAY_END) stopAuto(); advanceTo(S.now + 1); }, 1000);
        break;
      case 'scenario': scenario(t.dataset.s); return;
      case 'reset': stopAuto(); stopReal(); reset(); break;
      case 'realtime': if (t.checked) { startReal(); return; } stopReal(); log('ปิดโหมดเวลาจริง'); break;
      case 'next-day': {
        stopAuto();
        M.startDay(S.store, addDays(S.store.today, 1));
        S.now = T('06:00'); S.reminderOpen = false; S.dismissed = {}; S.srMsg = null; S.cgMsg = null;
        log('ขึ้นวันใหม่ ' + thDay(S.store.today) + ' · มื้อยาวันนี้ ' + S.store.sessions.length + ' มื้อ');
        handleEvents(M.tick(S.store, S.now));
        break;
      }
      case 'camera': S.cameraAllowed = !t.checked; break;
      case 'caregiver2': {
        const r = tryPair('caregiver-2', S.store.invite.code);
        log('Caregiver คนที่ 2 → ' + (r.ok ? 'จับคู่สำเร็จ' : PAIR_ERRORS[r.error]));
        break;
      }
      case 'role': {
        // prototype จำลอง Senior 1 คน กับ Caregiver 1 คน (BR-02): เครื่องที่กดได้บทบาทที่เลือกเสมอ
        const r = t.dataset.role, other = r === 'senior' ? 'caregiver' : 'senior', name = (x) => x === 'senior' ? 'ผู้สูงอายุ' : 'ผู้ดูแล';
        if (r !== t.dataset.side) S.swapped = !S.swapped;   // สลับข้างโทรศัพท์ ให้เครื่องที่กดเป็นบทบาทที่เลือก
        if (S.role[r]) {                                    // อีกเครื่องเลือกบทบาทนี้ไว้แล้ว → อีกเครื่องเปลี่ยนเป็นอีกบทบาท
          S.role[other] = true;
          S.store.senior.consentAt = null;                  // คนที่เป็นผู้สูงอายุเปลี่ยน → ต้องกดยินยอมใหม่
          log('เครื่องนี้เลือก' + name(r) + ' → อีกเครื่องเปลี่ยนเป็น' + name(other));
        } else log((r === 'senior' ? 'Senior' : 'Caregiver') + ' เลือกบทบาท');
        S.role[r] = true;
        break;
      }
      case 'role-back': S.role[t.dataset.side] = false; break;
      case 'sound': enableSound(); break;
      case 'consent': M.consent(S.store, S.now); log('Senior กดยินยอม'); break;
      case 'new-code': M.newInviteCode(S.store, S.now); S.srMsg = { kind: 'info', text: 'สร้างรหัสใหม่แล้ว' }; log('สร้างรหัสเชิญใหม่'); break;
      case 'scan-qr':
        S.cgMsg = null;
        if (SCANNER.canUseCamera()) { SCANNER.start(pairFromQr, onCameraError); log('ผู้ดูแลเปิดกล้องสแกน QR'); }
        else qrPicker.click();   // ไม่มีกล้องสด (เช่น เปิดไฟล์บนมือถือ) → เลือก/ถ่ายรูปแทน
        break;
      case 'scan-stop': SCANNER.stop(); break;
      case 'pick-qr': S.cgMsg = null; qrPicker.click(); return;
      case 'pair-code': { const r = tryPair(CAREGIVER, document.getElementById('code-in').value); S.cgMsg = r.ok ? null : { kind: 'error', text: PAIR_ERRORS[r.error] }; break; }
      case 'unpair-ask': S.dialog = t.dataset.side; break;
      case 'unpair-cancel': S.dialog = null; break;
      case 'unpair-confirm':
        M.unpair(S.store, S.now); S.dialog = null; S.draft = null; S.saved = null; S.reading = false; S.reminderOpen = false;
        S.cgMsg = { kind: 'info', text: 'ยกเลิกการจับคู่แล้ว · ข้อมูลยาและประวัติถูกลบ' };
        log('ยกเลิกการจับคู่ — ลบข้อมูลยาและประวัติ, Senior ได้ QR ใหม่ (FR-01 ✗6)');
        break;
      case 'tab': S.cgTab = t.dataset.tab; S.cgMsg = null; break;
      case 'scan-label': S.cgMsg = null; labelPicker.click(); return;
      case 'manual': S.mealDraft = Object.assign({}, DEFAULT_MEALS); startDraft(null); break;
      case 'cancel-draft': S.draft = null; S.draftNote = null; S.cgMsg = { kind: 'info', text: 'ยกเลิกแล้ว · ไม่ได้บันทึกอะไร' }; log('ยกเลิกร่าง — ไม่บันทึก (FR-02 ✗7)'); break;
      case 'save': {
        if (!S.store.mealTimes) M.setMealTimes(S.store, S.mealDraft);
        const r = M.saveMedication(S.store, S.draft, S.now);
        if (!r.ok) { S.cgMsg = { kind: 'error', text: 'บันทึกไม่ได้ — กรอกช่องที่จำเป็นให้ครบ' }; break; }
        S.draft = null; S.draftNote = null; S.saved = true;
        const late = r.medication.reminderTime < S.now;
        const notToday = !M.takesOn(r.medication.schedule, S.store.today);
        S.cgMsg = { kind: 'ok', text: 'บันทึกแล้ว · เตือน ' + fmt(r.medication.reminderTime) +
          (notToday ? ' · วันนี้ไม่ใช่วันกินยาตามความถี่ที่ตั้ง' : late ? ' (เลยเวลาวันนี้แล้ว เริ่มพรุ่งนี้)' : '') };
        log('บันทึกยา "' + r.medication.name + '" เตือน ' + fmt(r.medication.reminderTime));
        handleEvents(M.tick(S.store, S.now));
        break;
      }
      case 'taken': {
        const r = M.confirm(S.store, id, S.now);
        const sess = S.store.sessions.find((x) => x.id === id);
        if (r.ok) log('Senior กด "กินแล้ว" มื้อ ' + fmt(sess.T) + ' → ' + M.statusLabel(sess));
        else if (r.error === 'ALREADY_CONFIRMED') log('กดซ้ำ — ไม่บันทึกซ้ำ (FR-04 ✗2)');
        else if (r.error === 'LATE_WINDOW_CLOSED') { S.srMsg = { kind: 'error', text: 'เลยช่วงยืนยันแล้ว' }; log('เลยช่วงยืนยันช้า (FR-04 ✗6)'); }
        handleEvents(r.events);
        break;
      }
      case 'not-yet': {
        const sess = S.store.sessions.find((x) => x.id === id);
        const r = M.notYet(S.store, id, S.now);
        S.dismissed[id] = true;
        log('Senior กด "ยังไม่กิน" มื้อ ' + fmt(sess.T) + (r.events.length ? ' ในรอบสุดท้าย' : ' — รอรอบถัดไป'));
        handleEvents(r.events);
        break;
      }
      case 'open-reminder': S.reminderOpen = true; S.dismissed = {}; break;
    }
    render();
  });

  /* ---------- ระบบสแกน: QR (FR-01) และฉลากยา (FR-02) ---------- */

  // input เลือก/ถ่ายรูป อยู่นอกโทรศัพท์จำลอง → ไม่หายตอนวาดหน้าจอใหม่ระหว่างที่หน้าต่างเลือกไฟล์เปิดอยู่
  function filePicker(onFile) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.hidden = true;
    input.addEventListener('change', function () { const file = input.files[0]; input.value = ''; if (file) onFile(file); });
    document.body.appendChild(input);
    return input;
  }
  const qrPicker = filePicker(onQrImage), labelPicker = filePicker(onLabelImage);

  function pairFromQr(code) {
    const r = tryPair(CAREGIVER, code);
    S.cgMsg = r.ok ? null : { kind: 'error', text: PAIR_ERRORS[r.error] };
    render();
  }
  function onCameraError(err) {
    log('เปิดกล้องไม่ได้ (' + (err && err.name || 'error') + ')');
    S.cgMsg = { kind: 'info', text: 'เปิดกล้องไม่ได้ — เลือกรูป QR จากเครื่อง หรือใส่รหัส 6 หลักแทน' };
    render();
  }
  function onQrImage(file) {
    SCANNER.readFile(file).then(function (code) {
      if (code) { pairFromQr(code); return; }
      S.cgMsg = { kind: 'error', text: 'ไม่พบ QR ของ MedMind ในรูปนี้ — ลองรูปที่ชัดขึ้น หรือใส่รหัส 6 หลัก' };
      render();
    });
  }

  const UNSUPPORTED_TEXT = {   // BR-07 · FR-02 ✗4
    asNeeded: 'ระบบยังไม่รองรับยาเมื่อมีอาการ — ไม่ได้สร้างตาราง',
    notTablet: 'ระบบยังไม่รองรับยาที่ไม่ใช่ยาเม็ด (เช่น ยาน้ำ) — ไม่ได้สร้างตาราง',
    halfTablet: 'ระบบยังไม่รองรับยาครึ่งเม็ด — ไม่ได้สร้างตาราง',
  };
  const MEAL_NAME = Object.fromEntries(MEAL_OPTIONS);

  function onLabelImage(file) {
    S.reading = true; S.draft = null; S.cgMsg = null;
    log('ผู้ดูแลเลือกรูปฉลาก — อ่านในเครื่อง ไม่ส่งรูปออกไป');
    render();
    OCR.readLabel(file, function (percent) {
      const el = document.getElementById('ocr-progress');
      if (el) el.textContent = 'กำลังอ่านข้อความ ' + percent + '%';
    }).then(function (r) {
      if (!S.reading) return;   // ระหว่างอ่าน มีการเริ่มใหม่ / ยกเลิกการจับคู่ → ทิ้งผล
      S.reading = false;
      applyLabelResult(r);
      render();
    });
  }

  // ผลอ่านฉลาก → ร่างให้ผู้ดูแลตรวจ (ยังไม่บันทึก · FR-02 ✓1)
  function applyLabelResult(r) {
    S.mealDraft = Object.assign({}, DEFAULT_MEALS);
    if (!r.ok) {
      startDraft(null);
      S.draftNote = { kind: 'error', text: OCR.REASON_TEXT[r.reason] };
      log('อ่านฉลากไม่ได้ → ฟอร์มว่าง (FR-02 ✗5)');
      return;
    }
    const parsed = PARSER.parseLabel(r.text);
    if (parsed.unsupported) {
      S.cgMsg = { kind: 'error', text: UNSUPPORTED_TEXT[parsed.unsupported] };
      log('ฉลากเป็นยาที่ไม่รองรับ → ไม่สร้างตาราง (FR-02 ✗4)');
      return;
    }
    startDraft(parsed.draft);
    if (parsed.meals.length > 1) {   // ร่างใช้มื้อแรก — ยา 1 รายการเตือน 1 มื้อ
      const names = parsed.meals.map((m) => MEAL_NAME[m]).join(', ');
      const note = 'ฉลากระบุหลายมื้อ (' + names + ') — บันทึกมื้อ' + MEAL_NAME[parsed.meals[0]] + 'ก่อน แล้วเพิ่มยาอีกครั้งสำหรับมื้อที่เหลือ';
      S.draftNote = { kind: 'info', text: S.draftNote ? S.draftNote.text + ' · ' + note : note };
    }
    log('ได้ร่างจากฉลาก — ยังไม่บันทึก (FR-02 ✓1)');
  }

  function startDraft(draft) {
    S.draft = draft || { name: '', tabletsPerDose: '', timing: { type: 'after', meal: 'breakfast', minutes: '' }, warnings: '', contraindications: '' };
    // ความถี่เริ่มต้น: ทุกวัน เริ่มวันนี้ ไม่มีวันสิ้นสุด (ผู้ดูแลเปลี่ยนได้)
    S.draft.schedule = { days: [0, 1, 2, 3, 4, 5, 6], start: S.store.today, end: null };
    // ช่อง "ก่อนอาหารกี่นาที" นับเฉพาะยาก่อนอาหาร — ยาหลังอาหาร / ก่อนนอนไม่มีช่องนี้
    const t = S.draft.timing;
    S.unreadable = draft ? ['name', 'tabletsPerDose', 'type'].concat(t.type !== 'bedtime' ? ['meal'] : [], t.type === 'before' ? ['minutes'] : []).filter(isEmptyField) : [];
    S.draftNote = S.unreadable.length ? { kind: 'info', text: 'บางช่องอ่านจากฉลากไม่ได้ — กรุณาตรวจสอบและกรอกเอง' } : null;
  }

  document.addEventListener('input', function (ev) {
    const f = ev.target.dataset.f, meal = ev.target.dataset.meal, sk = ev.target.dataset.s;
    if (!S.draft) return;
    if (sk === 'start' || sk === 'end') { S.draft.schedule[sk] = ev.target.value; refreshDraft(); return; }
    if (meal) { const v = T(ev.target.value); if (v !== null) S.mealDraft[meal] = v; }
    else if (f === 'type' || f === 'meal' || f === 'minutes') S.draft.timing[f] = ev.target.value;
    else if (f) S.draft[f] = ev.target.value;
    refreshDraft();
  });
  document.addEventListener('change', function (ev) {   // เลือกวัน / วันสิ้นสุด = วาดฟอร์มใหม่
    const sc = S.draft && S.draft.schedule, el = ev.target;
    if (sc && el.dataset.day !== undefined) {
      const d = Number(el.dataset.day);
      sc.days = el.checked ? sc.days.concat(d).sort() : sc.days.filter((x) => x !== d);
      render(); return;
    }
    if (sc && el.dataset.s === 'noEnd') { sc.end = el.checked ? null : addDays(sc.start, 6); render(); return; }
  });
  document.addEventListener('change', function (ev) {   // เปลี่ยนชนิดเวลาหรือมื้อ = วาดฟอร์มใหม่ (ช่องนาทีโผล่/หาย)
    if (S.draft && (ev.target.dataset.f === 'type' || ev.target.dataset.f === 'meal')) render();
  });

  reset();
  render();
})();
