/**
 * apps_script_stripe.js — รับชำระเงินผ่าน Stripe (ค่าเช่า + มัดจำ/กันวงเงิน) + หน้าจองออนไลน์ (book.html)
 * ============================================================
 * ไฟล์ "ส่วนเพิ่ม" แบบเดียวกับ apps_script_additions.js — ไม่ได้แทนที่ apps_script_v4.js
 * ไฟล์นี้ใช้ได้ด้วยตัวเอง (ไม่เรียกฟังก์ชันจากไฟล์อื่น ยกเว้น notifyLine_ ถ้ามี) ชื่อฟังก์ชันขึ้นต้นด้วย stp / stripe
 *
 * ── 2 นิติบุคคล 2 บัญชี Stripe (เจ้าของสั่ง 16 พ.ย. 2026) ──
 *   • จองออนไลน์ (book.html, ลูกค้าจ่ายเอง)   → entity "jia"     → เงินเข้าบัญชี Stripe ของ JIA (Jia1669)
 *   • จองโดยเซลล์ใน index.html                → entity "rojrung" → ต้องใช้บัญชี Stripe ของ บริษัท โรจน์รุ่ง ธุรกิจ จำกัด
 *     ห้ามใช้บัญชี Jia1669 กับรายการของโรจน์รุ่ง — ถ้ายังไม่ตั้ง STRIPE_SECRET_KEY_ROJRUNG ปุ่มสร้างลิงก์จะกดไม่ได้
 *     และการรับเงินแบบเดิม (โอน/จ่ายหน้างาน) ใช้ได้ตามปกติ
 *
 * ------------------------------------------------------------
 * วิธีติดตั้ง (ทำทีละขั้น)
 * ------------------------------------------------------------
 * 1. Google Sheets ต้นทาง > Extensions > Apps Script > "+" ข้าง Files > Script
 *    ตั้งชื่อ "apps_script_stripe" แล้ววางโค้ดทั้งไฟล์นี้ลงไป
 *
 * 2. ใน apps_script_v4.js หา function doGet(e) แล้วเพิ่ม 2 บรรทัดนี้เป็นบรรทัดแรกในฟังก์ชัน:
 *
 *      var stripeOut = stripeHandleGet_(e);
 *      if (stripeOut) return stripeOut;
 *
 * 3. หา function doPost(e) (มีอยู่ใน apps_script_additions.js สำหรับ LINE webhook) แล้วเพิ่ม
 *    2 บรรทัดนี้เป็นบรรทัดแรกในฟังก์ชัน (มี doPost ได้แค่ตัวเดียวต่อโปรเจกต์ — ห้ามสร้างใหม่):
 *
 *      var stripePostOut = stripeHandlePost_(e);
 *      if (stripePostOut) return stripePostOut;
 *
 * 4. Project Settings (รูปเฟือง) > Script Properties > Add script property
 *      STRIPE_SECRET_KEY_JIA      = rk_live_... (Restricted key ของบัญชี JIA / Jia1669 — ใช้กับ book.html)
 *      STRIPE_SECRET_KEY_ROJRUNG  = rk_live_... (Restricted key ของบัญชี Stripe โรจน์รุ่ง — ใช้กับลิงก์ของเซลล์)
 *                                   ยังไม่มีบัญชี = ไม่ต้องใส่ ระบบเดิมทำงานต่อได้
 *      STAFF_PAY_KEY              = รหัสสุ่มยาว ๆ ที่เซลล์/Ops กรอกครั้งแรกในเครื่อง (สร้างลิงก์ / ดูสถานะชำระเงิน)
 *      OPS_PAY_KEY                = รหัสสุ่มอีกชุด เฉพาะ Ops (ปล่อยวงเงิน / หักค่าเสียหาย / คืนมัดจำ)
 *      PUBLIC_BASE_URL            = https://rent.jiacpr.com   (ไม่ตั้ง = ค่านี้; ถ้ายังไม่มีโดเมนนี้ใส่
 *                                   https://jiacpr-arch.github.io/jiarental แทน — ไม่มี / ท้าย)
 *      JIA_COMPANY_NAME           = ชื่อนิติบุคคลของ JIA ที่จะขึ้นบนใบจอง/หน้าชำระเงินออนไลน์
 *                                   (TODO เจ้าของ: ยืนยันชื่อจดทะเบียน — ไม่ตั้ง = แสดงคำว่า "JIA")
 *      ONLINE_DEPOSIT_PER_ITEM    = มัดจำต่อชิ้นสำหรับจองออนไลน์ (บาท) — ไม่ตั้ง = 0 (ไม่เก็บมัดจำออนไลน์)
 *      ONLINE_CATEGORIES          = (ไม่บังคับ) ชนิดอุปกรณ์ที่เปิดให้จองออนไลน์ คั่นด้วย , — ไม่ตั้ง = ทุกชนิด
 *      (LINE_TOKEN / LINE_TO ใช้ของเดิมจาก apps_script_additions.js สำหรับแจ้งเตือน Ops)
 *
 *    สิทธิ์ขั้นต่ำของ Restricted key (Stripe Dashboard > Developers > API keys > Create restricted key):
 *      Checkout Sessions: Write · PaymentIntents: Write · Charges and Refunds: Write · Events: Read
 *      (ที่เหลือ None)
 *
 * 5. ตั้ง trigger ไล่เช็คสถานะ (ไม่พึ่ง webhook อย่างเดียว):
 *    เลือกฟังก์ชัน stripeInstallTrigger ในแถบด้านบน > Run 1 ครั้ง (อนุญาตสิทธิ์)
 *    → จะสร้าง trigger รัน stripeReconcile ทุก 10 นาที (รันซ้ำได้ ไม่สร้างซ้ำ)
 *
 * 6. Deploy > Manage deployments > แก้ deployment เดิม > Version: New version > Deploy
 *
 * 7. (ไม่บังคับ แต่ช่วยให้อัปเดตเร็วขึ้น) Stripe Dashboard ของแต่ละบัญชี > Developers > Webhooks > Add endpoint
 *      บัญชี JIA:      <URL web app>?action=stripeWebhook&acct=jia
 *      บัญชีโรจน์รุ่ง: <URL web app>?action=stripeWebhook&acct=rojrung
 *    Events: checkout.session.completed, checkout.session.async_payment_succeeded,
 *            checkout.session.async_payment_failed, checkout.session.expired
 *    หมายเหตุ: Apps Script ตอบ webhook ด้วย 302 redirect เสมอ Stripe จึงจะขึ้นว่าส่งไม่สำเร็จ (โค้ดยังทำงาน)
 *    และอาจปิด endpoint เองหลังล้มเหลวหลายวัน — ไม่เป็นไร เพราะ stripeReconcile (ข้อ 5) คือกลไกหลัก
 *    ระบบไม่เชื่อข้อมูลใน body ของ webhook: ใช้แค่ event id แล้วดึง event + session จาก Stripe ใหม่ด้วย key ของเราเอง
 *
 * TODO (นอกขอบเขตรอบนี้): FlowAccount / เอกสารภาษี — ยังไม่ออกเอกสารอัตโนมัติ
 *   มัดจำเป็นเงินรับฝาก ไม่ใช่รายได้ — ยืนยันวิธีลงบัญชีกับนักบัญชีก่อนเปิดใช้จริง (payments-playbook ข้อ 5)
 *   ค่าธรรมเนียม Stripe ไม่ใช่ฐานคอมมิชชั่น (คอมฯ ยังคิดจากค่าเช่า/วันเหมือนเดิม)
 * ============================================================
 */

// ========== ค่าคงที่ ==========
var STP_BRAND = 'jiarental';
var STP_LEDGER_SHEET = 'การชำระเงิน';
var STP_RENTAL_SHEET = 'รายการเช่า';
var STP_PRODUCT_SHEET = 'สินค้า';
var STP_CUSTOMER_SHEET = 'ลูกค้า';
var STP_LEDGER_HEADERS = ['sessionId', 'rentalId', 'kind', 'amount', 'status', 'paymentIntentId', 'captureMethod',
  'createdAt', 'paidAt', 'capturedAmount', 'refundedAmount', 'releasedAt', 'note',
  // คอลัมน์ต่อท้าย (เพิ่มจาก spec): ใช้คำนวณมัดจำ/บัญชี
  'entity', 'depositAmount', 'depositDeducted', 'method', 'url', 'expiresAt', 'createdBy'];
var STP_ROJRUNG_NAME = 'บริษัท โรจน์รุ่ง ธุรกิจ จำกัด';
var STP_MAX_HOLD_DAYS = 6;          // เจ้าของ: เช่า ≤ 6 วัน + จ่ายบัตร = กันวงเงิน
var STP_HOLD_VALID_DAYS = 7;        // วงเงินบัตรหมดอายุ ~7 วันหลังอนุมัติ
var STP_HOLD_WARN_DAYS = 5;         // เตือน Ops เมื่อกันวงเงินมา ≥ 5 วัน
var STP_PLUS_NO_MONITOR_PRICE = 200; // ตรงกับ autoSelectSmartProducts() ใน index.html
var STP_ONLINE_LIMITS = { maxItems: 10, maxDays: 30, maxAdvanceDays: 180, minLeadDays: 1, sessionMinutes: 60 };
var STP_UNUSABLE_PRODUCT = ['ซ่อม', 'ไม่พร้อมใช้งาน', 'ออกสอน', 'ออกบูธ', 'ทดแทน'];
var STP_BUSY_RENTAL = ['กำลังเช่า', 'จอง', 'เกินกำหนด', 'ยืมด่วน'];
var STP_ATTRIBUTION_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'fbclid', 'fbc', 'gclid', 'gbraid', 'wbraid', 'ttclid'];
var STP_PROVINCES_0 = ['กรุงเทพมหานคร', 'นนทบุรี', 'ปทุมธานี', 'สมุทรปราการ', 'นครปฐม', 'สมุทรสาคร', 'สมุทรสงคราม'];
var STP_PROVINCES_4 = ['กระบี่', 'ชุมพร', 'ตรัง', 'นครศรีธรรมราช', 'นราธิวาส', 'ปัตตานี', 'พังงา', 'พัทลุง', 'ภูเก็ต', 'ยะลา', 'ระนอง', 'สงขลา', 'สตูล', 'สุราษฎร์ธานี'];
var STP_ALL_PROVINCES = ['กรุงเทพมหานคร', 'กระบี่', 'กาญจนบุรี', 'กาฬสินธุ์', 'กำแพงเพชร', 'ขอนแก่น', 'จันทบุรี', 'ฉะเชิงเทรา', 'ชลบุรี', 'ชัยนาท', 'ชัยภูมิ', 'ชุมพร', 'เชียงราย', 'เชียงใหม่',
  'ตรัง', 'ตราด', 'ตาก', 'นครนายก', 'นครปฐม', 'นครพนม', 'นครราชสีมา', 'นครศรีธรรมราช', 'นครสวรรค์', 'นนทบุรี', 'นราธิวาส', 'น่าน',
  'บึงกาฬ', 'บุรีรัมย์', 'ปทุมธานี', 'ประจวบคีรีขันธ์', 'ปราจีนบุรี', 'ปัตตานี', 'พระนครศรีอยุธยา', 'พะเยา', 'พังงา', 'พัทลุง', 'พิจิตร', 'พิษณุโลก', 'เพชรบุรี', 'เพชรบูรณ์', 'แพร่',
  'ภูเก็ต', 'มหาสารคาม', 'มุกดาหาร', 'แม่ฮ่องสอน', 'ยโสธร', 'ยะลา', 'ร้อยเอ็ด', 'ระนอง', 'ระยอง', 'ราชบุรี',
  'ลพบุรี', 'ลำปาง', 'ลำพูน', 'เลย', 'ศรีสะเกษ', 'สกลนคร', 'สงขลา', 'สตูล', 'สมุทรปราการ', 'สมุทรสงคราม', 'สมุทรสาคร', 'สระแก้ว', 'สระบุรี', 'สิงห์บุรี', 'สุโขทัย', 'สุพรรณบุรี', 'สุราษฎร์ธานี', 'สุรินทร์',
  'หนองคาย', 'หนองบัวลำภู', 'อ่างทอง', 'อำนาจเจริญ', 'อุดรธานี', 'อุตรดิตถ์', 'อุทัยธานี', 'อุบลราชธานี'];

// =====================================================================
// ส่วนที่ 1: PURE LOGIC — ไม่แตะ Sheets/Stripe (ทดสอบด้วย node ได้: tests/stripe-logic.test.js)
// =====================================================================

function stpBufferDays(province) {
  if (!province) return 0;
  if (STP_PROVINCES_0.indexOf(province) !== -1) return 0;
  if (STP_PROVINCES_4.indexOf(province) !== -1) return 4;
  return 3;
}

function stpIsoToUtcMs(iso) {
  var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3]);
}
function stpAddDaysIso(iso, n) {
  var ms = stpIsoToUtcMs(iso);
  if (isNaN(ms)) return null;
  var d = new Date(ms + n * 86400000);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
}
function stpDiffDays(fromIso, toIso) {
  return Math.round((stpIsoToUtcMs(toIso) - stpIsoToUtcMs(fromIso)) / 86400000);
}
// สูตรเดียวกับ calcRental() ใน index.html: max(1, round((end-start)/วัน))
function stpRentalDays(startIso, endIso) {
  return Math.max(1, stpDiffDays(startIso, endIso));
}
function stpIsoToSheet(iso) { // yyyy-mm-dd -> dd/mm/yyyy (รูปแบบเดียวกับ dateToSheets() ใน index.html)
  if (!iso) return '';
  var p = iso.split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}

function stpIsPlusCat(cat) {
  var c = String(cat || '').toLowerCase();
  return (c.indexOf('cpr man') !== -1 || c.indexOf('baby') !== -1) && c.indexOf('plus') !== -1;
}

/** กรองคีย์ที่มาของผู้ซื้อตาม payments-playbook ข้อ 2 — ไม่ผ่าน = ทิ้ง */
function stpSanitizeAttribution(input) {
  var out = {};
  if (!input || typeof input !== 'object') return out;
  STP_ATTRIBUTION_KEYS.forEach(function (k) {
    var v = input[k];
    if (typeof v !== 'string') return;
    if (!v || v.length > 200) return;
    if (!/^[A-Za-z0-9._~:\/+=-]+$/.test(v)) return;
    out[k] = v;
  });
  return out;
}

/**
 * ตัดสินวิธีเก็บมัดจำ (เจ้าของสั่ง 16 พ.ย. 2026):
 *  - เช่า ≤ 6 วัน + จ่ายบัตร → 'hold' (กันวงเงิน capture_method=manual)
 *  - อื่น ๆ (เช่านานกว่า / PromptPay / ไม่กำหนดวันคืน) → 'charge' (เก็บจริงเป็นบรรทัดแยก แล้วคืนด้วย partial refund)
 *  - ตัวกันเพิ่ม: ถ้ารู้ว่าวงเงินต้องค้างนานกว่า 6 วัน (นับจากวันสร้างลิงก์ถึงของถึงออฟฟิศ) วงเงินบัตรจะหมดอายุก่อน → 'charge'
 */
function stpDecideDepositMode(o) {
  var maxHold = o.maxHoldDays || STP_MAX_HOLD_DAYS;
  if (!(o.deposit > 0)) return { mode: 'none', reason: 'ไม่มีมัดจำ' };
  if (o.noDueDate) return { mode: 'charge', reason: 'ไม่กำหนดวันคืน — กันวงเงินไม่ได้ ต้องเก็บมัดจำจริง' };
  if (o.method !== 'card') return { mode: 'charge', reason: 'PromptPay กันวงเงินไม่ได้ — เก็บมัดจำจริงแล้วคืนทีหลัง (ลูกค้าต้องกรอกบัญชีรับเงินคืนจากอีเมล Stripe)' };
  if (!(o.rentalDays <= maxHold)) return { mode: 'charge', reason: 'เช่านานกว่า ' + maxHold + ' วัน — เก็บมัดจำจริงแล้วคืนด้วย partial refund' };
  if (o.holdSpanDays != null && o.holdSpanDays > maxHold) {
    return { mode: 'charge', reason: 'วงเงินต้องค้าง ' + o.holdSpanDays + ' วัน (ถึงวันของถึงออฟฟิศ) เกิน ' + maxHold + ' วัน วงเงินบัตรจะหมดอายุก่อน — เก็บมัดจำจริงแทน หรือรอสร้างลิงก์ใกล้วันส่งของ' };
  }
  return { mode: 'hold', reason: 'เช่า ≤ ' + maxHold + ' วัน + บัตร — กันวงเงิน (ยังไม่ตัดเงิน)' };
}

function stpRound2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function stpRentPart(row) { return stpRound2((Number(row.amount) || 0) - (Number(row.depositAmount) || 0)); }

/** ค่าที่ลูกค้าต้องจ่ายตามแถวในชีต (คิดฝั่ง server เท่านั้น) */
function stpRentalCharges(r) {
  var ship = 0;
  if (r.deliveryPayer === 'ลูกค้าออกเอง') ship += Number(r.deliveryShippingCost) || 0;
  if (r.payer === 'ลูกค้าออกเอง') ship += Number(r.shippingCost) || 0;
  return { rent: stpRound2(r.total), shipping: stpRound2(ship), deposit: stpRound2(r.deposit) };
}

/**
 * วางแผน Checkout Session สำหรับลิงก์ของพนักงาน (index.html)
 * r: แถวเช่า (ตัวเลขแล้ว) + dueIso / returnByIso, ledger: แถวในชีต 'การชำระเงิน' ของ rental นี้
 * opts: { purpose: 'all'|'rent'|'deposit', method: 'card'|'promptpay', todayIso }
 */
function stpStaffPlan(r, ledger, opts) {
  var ch = stpRentalCharges(r);
  var purpose = opts.purpose || 'all';
  var method = opts.method === 'promptpay' ? 'promptpay' : 'card';
  var rows = ledger || [];
  var rentPaid = 0, depositCovered = 0;
  rows.forEach(function (x) {
    var paidLike = x.status === 'paid' || x.status === 'processing';
    if ((x.kind === 'rent' || x.kind === 'rent_plus_deposit') && paidLike) rentPaid += stpRentPart(x);
    if (x.kind === 'deposit_hold' && (x.status === 'hold' || x.status === 'captured')) depositCovered += Number(x.amount) || 0;
    if ((x.kind === 'deposit_charge' || x.kind === 'rent_plus_deposit') && paidLike) depositCovered += Number(x.depositAmount) || 0;
  });
  var rentGross = stpRound2(ch.rent + ch.shipping);
  var rentDue = Math.max(0, stpRound2(rentGross - rentPaid));
  var depositDue = Math.max(0, stpRound2(ch.deposit - depositCovered));
  var endIso = r.returnByIso || r.dueIso;
  var holdSpan = (endIso && opts.todayIso) ? stpDiffDays(opts.todayIso, endIso) + 1 : null;
  var dep = stpDecideDepositMode({ deposit: depositDue, rentalDays: Number(r.days) || 0, method: method, holdSpanDays: holdSpan, noDueDate: !!r.noDueDate });
  var wantRent = purpose !== 'deposit' && rentDue > 0;
  var wantDeposit = purpose !== 'rent' && depositDue > 0;
  var sessions = [];
  var rentLines = [];
  if (wantRent) {
    var rentOnly = Math.max(0, stpRound2(Math.min(ch.rent, rentDue)));
    var shipOnly = stpRound2(rentDue - rentOnly);
    if (rentOnly > 0) rentLines.push({ name: 'ค่าเช่า ' + r.id, amount: rentOnly });
    if (shipOnly > 0) rentLines.push({ name: 'ค่าขนส่ง ' + r.id, amount: shipOnly });
  }
  var depLine = { name: 'มัดจำ (คืนเมื่อรับคืนสภาพดี) ' + r.id, amount: depositDue };
  if (wantRent && wantDeposit && dep.mode === 'charge') {
    sessions.push({ kind: 'rent_plus_deposit', captureMethod: 'automatic', methods: [method], lines: rentLines.concat([depLine]), amount: stpRound2(rentDue + depositDue), depositAmount: depositDue });
  } else {
    if (wantRent) sessions.push({ kind: 'rent', captureMethod: 'automatic', methods: ['card', 'promptpay'], lines: rentLines, amount: rentDue, depositAmount: 0 });
    if (wantDeposit) {
      if (dep.mode === 'hold') sessions.push({ kind: 'deposit_hold', captureMethod: 'manual', methods: ['card'], lines: [depLine], amount: depositDue, depositAmount: depositDue });
      else sessions.push({ kind: 'deposit_charge', captureMethod: 'automatic', methods: [method], lines: [depLine], amount: depositDue, depositAmount: depositDue });
    }
  }
  var errors = [];
  sessions.forEach(function (s) { if (s.amount < 10) errors.push('ยอด ' + s.amount + ' บาท ต่ำกว่าขั้นต่ำของ Stripe (10 บาท)'); });
  if (!sessions.length) errors.push(purpose === 'deposit' ? 'ไม่มีมัดจำค้างชำระ' : purpose === 'rent' ? 'ไม่มีค่าเช่าค้างชำระ' : 'ไม่มียอดค้างชำระ');
  return { rentGross: rentGross, rentPaid: stpRound2(rentPaid), rentDue: rentDue, depositDue: depositDue, depositMode: dep.mode, depositReason: dep.reason, holdSpanDays: holdSpan, sessions: sessions, errors: errors };
}

/**
 * เลือกสินค้าที่ว่างตามชนิด — ตรรกะเดียวกับ isProductAvailableForDates() ใน index.html
 * + นับรายการ 'รอชำระ' ที่ session ยังไม่หมดอายุ (pendingRentalIds) เป็นคิวที่ถูกจองไว้ด้วย
 */
function stpIsProductFree(p, rentals, deliverIso, startIso, endIso, pendingRentalIds) {
  if (STP_UNUSABLE_PRODUCT.indexOf(p.status) !== -1) return false;
  var s1 = deliverIso || startIso, e1 = endIso;
  for (var i = 0; i < rentals.length; i++) {
    var ar = rentals[i];
    if ((ar.productIds || []).indexOf(p.id) === -1) continue;
    var busy = STP_BUSY_RENTAL.indexOf(ar.status) !== -1 || (ar.status === 'รอชำระ' && pendingRentalIds && pendingRentalIds[ar.id]);
    if (!busy) continue;
    if (!ar.dueIso || ar.noDueDate) return false;
    var s2 = ar.deliverIso || ar.startIso, e2 = ar.dueIso;
    if (!s2) return false;
    if (s1 <= e2 && e1 >= s2) return false;
  }
  return true;
}

function stpValidateBookingInput(b) {
  var errs = [];
  if (!b || typeof b !== 'object') return ['ข้อมูลไม่ถูกต้อง'];
  var name = String(b.name || '').trim();
  var phone = String(b.phone || '').replace(/[^0-9]/g, '');
  if (name.length < 2 || name.length > 100) errs.push('กรุณากรอกชื่อผู้เช่า/หน่วยงาน');
  if (!/^0\d{8,9}$/.test(phone)) errs.push('เบอร์โทรไม่ถูกต้อง (เช่น 0812345678)');
  var addr = String(b.address || '').trim();
  if (addr.length < 10 || addr.length > 500) errs.push('กรุณากรอกที่อยู่จัดส่งให้ครบ');
  if (STP_ALL_PROVINCES.indexOf(b.province) === -1) errs.push('กรุณาเลือกจังหวัด');
  if (b.method !== 'card' && b.method !== 'promptpay') errs.push('กรุณาเลือกวิธีชำระเงิน');
  if (String(b.note || '').length > 300) errs.push('หมายเหตุยาวเกินไป');
  if (b.taxName && String(b.taxName).length > 200) errs.push('ชื่อออกใบเสร็จยาวเกินไป');
  return errs;
}

/**
 * คำนวณใบเสนอราคาจองออนไลน์ฝั่ง server (ไม่เชื่อยอดจาก browser)
 * input: { items:[{cat, qty, monitor}], start, end, province, method }
 * ctx:   { products, rentals, pendingRentalIds, todayIso, depositPerItem, allowedCats }
 */
function stpOnlineQuote(input, ctx) {
  var L = STP_ONLINE_LIMITS;
  var errors = [];
  var start = String(input.start || ''), end = String(input.end || '');
  if (isNaN(stpIsoToUtcMs(start)) || isNaN(stpIsoToUtcMs(end))) return { ok: false, errors: ['กรุณาเลือกวันเช่าและกำหนดคืน'] };
  if (end < start) return { ok: false, errors: ['กำหนดคืนต้องไม่ก่อนวันเช่า'] };
  var days = stpRentalDays(start, end);
  if (days > L.maxDays) errors.push('จองออนไลน์ได้ไม่เกิน ' + L.maxDays + ' วัน — เช่านานกว่านี้กรุณาติดต่อเจ้าหน้าที่');
  if (stpDiffDays(ctx.todayIso, start) > L.maxAdvanceDays) errors.push('จองล่วงหน้าได้ไม่เกิน ' + L.maxAdvanceDays + ' วัน');
  var buffer = stpBufferDays(input.province);
  var deliverIso = stpAddDaysIso(start, -buffer - 1);
  if (stpDiffDays(ctx.todayIso, deliverIso) < L.minLeadDays) {
    errors.push('วันเช่าเร็วเกินไปสำหรับจังหวัดนี้ (ต้องส่งของวันที่ ' + stpIsoToSheet(deliverIso) + ') — เลือกวันเช่าให้ช้าลง หรือติดต่อเจ้าหน้าที่');
  }
  var items = (input.items || []).filter(function (it) { return it && it.cat && (parseInt(it.qty, 10) || 0) > 0; });
  if (!items.length) errors.push('กรุณาเลือกอุปกรณ์อย่างน้อย 1 รายการ');
  var totalQty = 0, seen = {};
  items.forEach(function (it) {
    totalQty += parseInt(it.qty, 10) || 0;
    if (seen[it.cat]) errors.push('เลือกชนิด ' + it.cat + ' ซ้ำ');
    seen[it.cat] = true;
    if (ctx.allowedCats && ctx.allowedCats.length && ctx.allowedCats.indexOf(it.cat) === -1) errors.push(it.cat + ' ไม่เปิดให้จองออนไลน์');
  });
  if (totalQty > L.maxItems) errors.push('จองออนไลน์ได้ไม่เกิน ' + L.maxItems + ' ชิ้นต่อครั้ง');
  if (errors.length) return { ok: false, errors: errors };

  var picked = [], lines = [], pricePerDay = 0;
  items.forEach(function (it) {
    var qty = parseInt(it.qty, 10);
    var isPlus = stpIsPlusCat(it.cat);
    var withMonitor = isPlus ? it.monitor !== false : true;
    var avail = ctx.products.filter(function (p) {
      return p.cat === it.cat && picked.indexOf(p.id) === -1 && stpIsProductFree(p, ctx.rentals, deliverIso, start, end, ctx.pendingRentalIds);
    });
    if (avail.length < qty) { errors.push(it.cat + ' ว่างไม่พอ (ว่าง ' + avail.length + ' ชิ้น)'); return; }
    var sub = 0;
    avail.slice(0, qty).forEach(function (p) {
      picked.push(p.id);
      var price = (isPlus && !withMonitor) ? STP_PLUS_NO_MONITOR_PRICE : (Number(p.price) || 0);
      sub += price;
      lines.push({ id: p.id, cat: p.cat, name: isPlus && withMonitor ? p.name + ' + มอนิเตอร์' : p.name, price: price });
    });
    pricePerDay += sub;
  });
  if (errors.length) return { ok: false, errors: errors };
  var rent = stpRound2(pricePerDay * days);
  var deposit = stpRound2((Number(ctx.depositPerItem) || 0) * totalQty);
  var dep = stpDecideDepositMode({ deposit: deposit, rentalDays: days, method: input.method === 'promptpay' ? 'promptpay' : 'card' });
  var chargeNow = stpRound2(rent + (dep.mode === 'charge' ? deposit : 0));
  if (chargeNow < 10) return { ok: false, errors: ['ยอดชำระต่ำกว่าขั้นต่ำ'] };
  // สรุปต่อชนิด (ไม่โชว์ชื่อหุ่นให้ลูกค้า — ตามแนวทาง "เลือกตามชนิด+จำนวน")
  var summary = {};
  lines.forEach(function (l) {
    var key = l.cat + (stpIsPlusCat(l.cat) ? (l.name.indexOf('+ มอนิเตอร์') !== -1 ? ' + มอนิเตอร์' : ' (ไม่รวมมอนิเตอร์)') : '');
    if (!summary[key]) summary[key] = { label: key, qty: 0, pricePerDay: 0 };
    summary[key].qty++; summary[key].pricePerDay += l.price;
  });
  return {
    ok: true, start: start, end: end, days: days, bufferDays: buffer, deliverIso: deliverIso,
    returnByIso: buffer > 0 ? stpAddDaysIso(end, buffer) : null,
    productIds: picked, productNames: lines.map(function (l) { return l.name; }),
    summary: Object.keys(summary).map(function (k) { return summary[k]; }),
    totalQty: totalQty, pricePerDay: stpRound2(pricePerDay), rent: rent, deposit: deposit,
    depositMode: dep.mode, depositReason: dep.reason, chargeNow: chargeNow,
    kind: dep.mode === 'charge' ? 'rent_plus_deposit' : 'rent'
  };
}

/** แปลง Checkout Session (expand payment_intent.latest_charge) → สถานะในสมุดบัญชี (บาท) */
function stpLedgerStateFromSession(s) {
  var pi = s.payment_intent && typeof s.payment_intent === 'object' ? s.payment_intent : null;
  var out = { paymentIntentId: pi ? pi.id : (s.payment_intent || ''), capturedAmount: 0, refundedAmount: 0, paidAtSec: null };
  if (s.status === 'expired') { out.status = 'expired'; return out; }
  if (s.status === 'open') { out.status = 'pending'; return out; }
  if (!pi) { out.status = s.payment_status === 'paid' ? 'paid' : 'processing'; return out; }
  var charge = pi.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
  out.refundedAmount = charge ? (charge.amount_refunded || 0) / 100 : 0;
  out.capturedAmount = (pi.amount_received || 0) / 100;
  out.paidAtSec = charge ? charge.created : null;
  var manual = pi.capture_method === 'manual';
  switch (pi.status) {
    case 'requires_capture': out.status = 'hold'; break;
    case 'succeeded': out.status = manual ? 'captured' : 'paid'; break;
    case 'canceled': out.status = (manual && !pi.amount_received) ? 'released' : 'canceled'; break;
    case 'processing': out.status = 'processing'; break;
    case 'requires_payment_method': out.status = 'failed'; break;
    default: out.status = s.payment_status === 'paid' ? 'paid' : 'processing';
  }
  return out;
}

/** สรุปสถานะการชำระของ rental จากแถวในสมุดบัญชี → ค่า paymentStatus ในชีต */
function stpRentalPaymentLabel(rows) {
  rows = rows || [];
  var parts = [];
  var rentRows = rows.filter(function (x) { return x.kind === 'rent' || x.kind === 'rent_plus_deposit'; });
  if (rentRows.some(function (x) { return x.status === 'paid'; })) parts.push('ชำระแล้ว');
  else if (rentRows.some(function (x) { return x.status === 'processing'; })) parts.push('รอยืนยันยอด');
  else if (rentRows.some(function (x) { return x.status === 'pending'; })) parts.push('รอชำระ');
  rows.forEach(function (x) {
    if (x.kind === 'deposit_hold') {
      if (x.status === 'hold') parts.push('กันวงเงินมัดจำ ' + x.amount);
      else if (x.status === 'released') parts.push('ปล่อยวงเงินแล้ว');
      else if (x.status === 'captured') parts.push('หักมัดจำ ' + x.capturedAmount);
      else if (x.status === 'pending') parts.push('รอกันวงเงิน');
    } else if ((x.kind === 'deposit_charge' || x.kind === 'rent_plus_deposit') && Number(x.depositAmount) > 0) {
      if (x.status === 'pending' && x.kind === 'deposit_charge') parts.push('รอชำระมัดจำ');
      if (x.status !== 'paid') return;
      if (!x.releasedAt) { parts.push('รับมัดจำแล้ว ' + x.depositAmount); return; }
      var refunded = Math.min(Number(x.refundedAmount) || 0, Number(x.depositAmount) || 0);
      var deducted = Number(x.depositDeducted) || 0;
      if (refunded > 0) parts.push('คืนมัดจำ ' + refunded);
      if (deducted > 0) parts.push('หักมัดจำ ' + deducted);
    }
  });
  var seen = {};
  parts = parts.filter(function (p) { if (seen[p]) return false; seen[p] = 1; return true; });
  return parts.length ? 'Stripe: ' + parts.join(' · ') : '';
}

/** วงเงินที่ยังกันอยู่ + อายุ (วัน) + วันหมดอายุ — เตือนเมื่อ ≥ 5 วัน */
function stpHoldWarnings(rows, nowMs) {
  return (rows || []).filter(function (x) { return x.kind === 'deposit_hold' && x.status === 'hold'; }).map(function (x) {
    var authMs = x.paidAt ? new Date(x.paidAt).getTime() : new Date(x.createdAt).getTime();
    var ageDays = Math.floor((nowMs - authMs) / 86400000);
    return { sessionId: x.sessionId, rentalId: x.rentalId, amount: x.amount, ageDays: ageDays,
      expiresAt: new Date(authMs + STP_HOLD_VALID_DAYS * 86400000).toISOString(), warn: ageDays >= STP_HOLD_WARN_DAYS };
  });
}

/** ตรวจคำสั่ง Ops กับวงเงิน/มัดจำ → แผนเรียก Stripe */
function stpDepositActionPlan(row, op, damage) {
  damage = stpRound2(damage);
  if (!(damage >= 0)) return { error: 'ยอดหักค่าเสียหายไม่ถูกต้อง' };
  if (row.kind === 'deposit_hold') {
    if (row.status !== 'hold') return { error: 'รายการนี้ไม่ได้กันวงเงินอยู่ (สถานะ ' + row.status + ')' };
    if (op === 'release' || damage === 0) return { call: 'cancel' };
    if (op !== 'capture') return { error: 'คำสั่งไม่ถูกต้อง' };
    if (damage > Number(row.amount)) return { error: 'หักได้ไม่เกินวงเงินที่กันไว้ ' + row.amount + ' บาท' };
    if (damage < 10) return { error: 'หักขั้นต่ำ 10 บาท (Stripe) — ถ้าน้อยกว่านี้ให้ปล่อยวงเงินแล้วเก็บเงินทางอื่น' };
    return { call: 'capture', amountToCapture: damage };
  }
  if (row.kind === 'deposit_charge' || row.kind === 'rent_plus_deposit') {
    if (op !== 'refund') return { error: 'มัดจำที่เก็บจริงต้องใช้ "คืนมัดจำ"' };
    if (row.status !== 'paid') return { error: 'ยังไม่ได้รับมัดจำ (สถานะ ' + row.status + ')' };
    if (row.releasedAt) return { error: 'คืน/ปิดมัดจำรายการนี้ไปแล้ว' };
    var dep = Number(row.depositAmount) || 0;
    if (damage > dep) return { error: 'หักได้ไม่เกินมัดจำ ' + dep + ' บาท' };
    var refund = stpRound2(dep - damage);
    var maxRefundable = stpRound2((Number(row.amount) || 0) - (Number(row.refundedAmount) || 0));
    if (refund > maxRefundable) return { error: 'ยอดคืนเกินยอดที่ยังคืนได้ (' + maxRefundable + ' บาท) — มีการคืนเงินใน Stripe ไปแล้ว ตรวจใน Dashboard' };
    return { call: refund > 0 ? 'refund' : 'none', refundAmount: refund, deducted: damage };
  }
  return { error: 'รายการนี้ไม่ใช่มัดจำ' };
}

/** form-encode แบบ Stripe: {a:{b:[1,2]}} → a[b][0]=1&a[b][1]=2 */
function stpFormEncode(obj) {
  var parts = [];
  function walk(prefix, v) {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) { v.forEach(function (x, i) { walk(prefix + '[' + i + ']', x); }); return; }
    if (typeof v === 'object') { Object.keys(v).forEach(function (k) { walk(prefix ? prefix + '[' + k + ']' : k, v[k]); }); return; }
    parts.push(encodeURIComponent(prefix) + '=' + encodeURIComponent(String(v)));
  }
  walk('', obj);
  return parts.join('&');
}

/** สร้าง params ของ Checkout Session (pure — ทดสอบได้) */
function stpBuildSessionParams(o) {
  var line_items = o.lines.map(function (l) {
    return { quantity: 1, price_data: { currency: 'thb', unit_amount: Math.round(l.amount * 100), product_data: { name: l.name } } };
  });
  var md = {};
  var attr = stpSanitizeAttribution(o.attribution || {});
  Object.keys(attr).forEach(function (k) { md[k] = attr[k]; });
  // คีย์หลักเขียนทีหลัง → attribution เขียนทับไม่ได้
  var base = { brand: STP_BRAND, rental_id: o.rentalId, kind: o.kind, entity: o.entity, channel: o.channel,
    start: o.start || '', end: o.end || '', product_ids: String(o.productIds || '').slice(0, 450),
    rent_amount: String(stpRound2(o.amount - (o.depositAmount || 0))), deposit_amount: String(o.depositAmount || 0) };
  if (o.guest) base.guest = '1';
  Object.keys(base).forEach(function (k) { md[k] = base[k]; });
  var p = {
    mode: 'payment', locale: 'th', line_items: line_items, payment_method_types: o.methods,
    success_url: o.baseUrl + '/paid.html?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: o.cancelUrl || (o.baseUrl + '/paid.html?session_id={CHECKOUT_SESSION_ID}&cancelled=1'),
    client_reference_id: o.rentalId, expires_at: o.expiresAtSec, metadata: md,
    payment_intent_data: { metadata: md, description: (o.kind === 'deposit_hold' ? 'กันวงเงินมัดจำ ' : 'ค่าเช่า ') + o.rentalId }
  };
  if (o.captureMethod === 'manual') p.payment_intent_data.capture_method = 'manual';
  if (o.branding) p.branding_settings = o.branding;
  return p;
}

// =====================================================================
// ส่วนที่ 2: Apps Script runtime (Sheets / Stripe / LINE)
// =====================================================================

function stpProps_() { return PropertiesService.getScriptProperties(); }
function stpProp_(k, def) { var v = stpProps_().getProperty(k); return (v === null || v === '') ? def : v; }
function stpKeyFor_(entity) { return stpProp_(entity === 'jia' ? 'STRIPE_SECRET_KEY_JIA' : 'STRIPE_SECRET_KEY_ROJRUNG', ''); }
function stpBaseUrl_() { return String(stpProp_('PUBLIC_BASE_URL', 'https://rent.jiacpr.com')).replace(/\/+$/, ''); }
function stpJiaName_() { return stpProp_('JIA_COMPANY_NAME', 'JIA'); }
function stpCompanyName_(entity) { return entity === 'jia' ? stpJiaName_() : STP_ROJRUNG_NAME; }
function stpEntityOf_(r) { return r.entity === 'jia' || (!r.entity && /^WEB-/.test(String(r.id || ''))) ? 'jia' : 'rojrung'; }
function stpTodayIso_() { return Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd'); }
function stpNowIso_() { return new Date().toISOString(); }

// LockService: กันเขียนชนกัน — นับชั้นเองเพื่อให้เรียกซ้อนในการทำงานเดียวกันได้
var STP_LOCK_DEPTH = 0;
function stpWithLock_(fn) {
  if (STP_LOCK_DEPTH > 0) return fn();
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  STP_LOCK_DEPTH++;
  try { return fn(); } finally { STP_LOCK_DEPTH--; lock.releaseLock(); }
}

function stpJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function stpCheckKey_(prop, given) {
  var want = stpProp_(prop, '');
  if (!want) return 'ยังไม่ได้ตั้ง ' + prop + ' ใน Script Properties';
  if (!given || String(given) !== want) return 'รหัสพนักงานไม่ถูกต้อง';
  return null;
}

function stpToIso_(v) {
  if (!v) return null;
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return null;
    return Utilities.formatDate(v, 'Asia/Bangkok', 'yyyy-MM-dd');
  }
  var s = String(v).trim();
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : Utilities.formatDate(d, 'Asia/Bangkok', 'yyyy-MM-dd');
}

// ---------- Sheets helpers (อ่าน/เขียนตาม header ทนต่อลำดับคอลัมน์) ----------
function stpSheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    if (!headers) return null;
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    return sh;
  }
  if (headers) stpEnsureColumns_(sh, headers);
  return sh;
}
/** เพิ่ม header ที่ขาดต่อท้าย (ไม่สลับคอลัมน์เดิม) */
function stpEnsureColumns_(sh, needed) {
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var missing = needed.filter(function (h) { return hdr.indexOf(h) === -1; });
  if (!missing.length) return;
  var startCol = hdr.filter(function (h) { return h !== ''; }).length ? lastCol + 1 : 1;
  sh.getRange(1, startCol, 1, missing.length).setValues([missing]);
}
function stpRead_(sh) {
  var values = sh.getDataRange().getValues();
  var headers = (values[0] || []).map(function (h) { return String(h).trim(); });
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var o = { _row: i + 1 };
    headers.forEach(function (h, j) { if (h) o[h] = values[i][j]; });
    rows.push(o);
  }
  return { headers: headers, rows: rows };
}
function stpAppend_(sh, obj) {
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  sh.appendRow(headers.map(function (h) { return obj[h] === undefined || obj[h] === null ? '' : obj[h]; }));
}
function stpPatch_(sh, headers, rowNum, patch) {
  Object.keys(patch).forEach(function (k) {
    var col = headers.indexOf(k);
    if (col === -1) return;
    sh.getRange(rowNum, col + 1).setValue(patch[k] === undefined || patch[k] === null ? '' : patch[k]);
  });
}

function stpLedger_() { return stpSheet_(STP_LEDGER_SHEET, STP_LEDGER_HEADERS); }
function stpLedgerRows_() {
  var t = stpRead_(stpLedger_());
  t.rows.forEach(function (r) {
    ['amount', 'capturedAmount', 'refundedAmount', 'depositAmount', 'depositDeducted'].forEach(function (k) { r[k] = Number(r[k]) || 0; });
    ['createdAt', 'paidAt', 'releasedAt', 'expiresAt'].forEach(function (k) {
      if (Object.prototype.toString.call(r[k]) === '[object Date]') r[k] = r[k].toISOString();
      else r[k] = r[k] ? String(r[k]) : '';
    });
    r.sessionId = String(r.sessionId || ''); r.rentalId = String(r.rentalId || '');
  });
  return t;
}
function stpRentalTable_() {
  var sh = stpSheet_(STP_RENTAL_SHEET, ['entity', 'channel']);
  var t = stpRead_(sh);
  t.sheet = sh;
  t.rows.forEach(function (r) {
    r.id = String(r.id || '');
    r.productIds = String(r.productIds || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    r.startIso = stpToIso_(r.start); r.dueIso = stpToIso_(r.due); r.deliverIso = stpToIso_(r.deliverDate);
    r.returnByIso = stpToIso_(r.returnBy);
    r.noDueDate = r.noDueDate === true || r.noDueDate === 'true' || r.noDueDate === 'TRUE';
    ['total', 'deposit', 'days', 'deliveryShippingCost', 'shippingCost', 'totalPricePerDay'].forEach(function (k) { r[k] = Number(r[k]) || 0; });
  });
  return t;
}
function stpProducts_() {
  var sh = stpSheet_(STP_PRODUCT_SHEET);
  return sh ? stpRead_(sh).rows.filter(function (p) { return p.id; }).map(function (p) {
    return { id: String(p.id), cat: String(p.cat || ''), name: String(p.name || p.id), price: Number(p.price) || 0, status: String(p.status || '') };
  }) : [];
}
function stpPendingRentalIds_(ledgerRows) {
  var now = Date.now(), out = {};
  ledgerRows.forEach(function (x) {
    if (x.status === 'pending' && (!x.expiresAt || new Date(x.expiresAt).getTime() > now)) out[x.rentalId] = true;
  });
  return out;
}

// ---------- Stripe ----------
function stpStripe_(entity, method, path, params, idemKey) {
  var key = stpKeyFor_(entity);
  if (!key) throw new Error(entity === 'jia' ? 'ยังไม่ได้ตั้งค่าบัญชี Stripe ของ JIA' : 'ยังไม่ได้ตั้งค่าบัญชี Stripe ของโรจน์รุ่ง');
  var url = 'https://api.stripe.com/v1' + path;
  var opts = { method: method, headers: { Authorization: 'Bearer ' + key }, muteHttpExceptions: true };
  if (params && method === 'get') url += (url.indexOf('?') === -1 ? '?' : '&') + stpFormEncode(params);
  else if (params) { opts.payload = stpFormEncode(params); opts.contentType = 'application/x-www-form-urlencoded'; }
  if (idemKey) opts.headers['Idempotency-Key'] = idemKey;
  var res = UrlFetchApp.fetch(url, opts);
  var code = res.getResponseCode();
  var json = {};
  try { json = JSON.parse(res.getContentText()); } catch (e) { /* ignore */ }
  if (code >= 300) {
    var msg = json && json.error && json.error.message ? json.error.message : ('HTTP ' + code);
    var err = new Error('Stripe: ' + msg); err.stripeCode = code; err.stripeParam = json && json.error && json.error.param;
    throw err;
  }
  return json;
}
function stpGetSession_(entity, sessionId) {
  return stpStripe_(entity, 'get', '/checkout/sessions/' + encodeURIComponent(sessionId), { expand: ['payment_intent.latest_charge'] });
}
/** สร้าง session — ลองใส่ชื่อแบรนด์บนหน้าจ่ายก่อน ถ้า Stripe ไม่รับ branding_settings สร้างใหม่แบบไม่มี */
function stpCreateSession_(entity, o) {
  o.branding = { display_name: entity === 'jia' ? stpJiaName_() : 'JIARAKSA', button_color: '#2563eb' };
  var idem = 'jr-' + o.rentalId + '-' + o.kind + '-' + Math.round(o.amount * 100) + '-' + o.nonce;
  try {
    return stpStripe_(entity, 'post', '/checkout/sessions', stpBuildSessionParams(o), idem + '-b');
  } catch (e) {
    if (e.stripeCode !== 400 || String(e.stripeParam || e.message).indexOf('branding') === -1) throw e;
    o.branding = null;
    return stpStripe_(entity, 'post', '/checkout/sessions', stpBuildSessionParams(o), idem);
  }
}

// ---------- LINE ----------
function stpLineText_(text) {
  try {
    var token = stpProp_('LINE_TOKEN', ''), to = stpProp_('LINE_TO', '');
    if (!token || !to) return;
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ to: to, messages: [{ type: 'text', text: text }] }), muteHttpExceptions: true
    });
  } catch (e) { console.error('LINE error: ' + e); }
}

// ---------- ซิงก์ session → สมุดบัญชี → แถวเช่า (idempotent: สถานะมาจาก Stripe เสมอ) ----------
function stpSyncSession_(sessionId) {
  var lt = stpLedgerRows_();
  var row = lt.rows.filter(function (x) { return x.sessionId === sessionId; })[0];
  if (!row) return { error: 'ไม่พบรายการชำระเงินนี้' };
  var s = stpGetSession_(row.entity || 'rojrung', sessionId);
  if (!s.metadata || s.metadata.brand !== STP_BRAND) return { error: 'session ไม่ใช่ของระบบเช่า' };
  var st = stpLedgerStateFromSession(s);
  var patch = {};
  if (st.status !== row.status) patch.status = st.status;
  if (st.paymentIntentId && st.paymentIntentId !== row.paymentIntentId) patch.paymentIntentId = st.paymentIntentId;
  if (st.capturedAmount !== row.capturedAmount) patch.capturedAmount = st.capturedAmount;
  if (st.refundedAmount !== row.refundedAmount) patch.refundedAmount = st.refundedAmount;
  if (st.paidAtSec && !row.paidAt) patch.paidAt = new Date(st.paidAtSec * 1000).toISOString();
  if (st.status === 'released' && !row.releasedAt) patch.releasedAt = stpNowIso_();
  if (s.payment_method_types && !row.method) patch.method = s.payment_method_types.join(',');
  stpWithLock_(function () {
    if (Object.keys(patch).length) stpPatch_(stpLedger_(), lt.headers, row._row, patch);
    Object.keys(patch).forEach(function (k) { row[k] = patch[k]; });
    var newly = patch.status && (patch.status === 'paid' || patch.status === 'hold');
    stpApplyRental_(row.rentalId, newly ? row : null);
  });
  return { ok: true, status: row.status, changed: Object.keys(patch) };
}

/** อัปเดต paymentStatus (+ สถานะของจองออนไลน์) ของ rental จากสมุดบัญชีทั้งหมด */
function stpApplyRental_(rentalId, newlyPaidRow) {
  var ledger = stpLedgerRows_().rows.filter(function (x) { return x.rentalId === rentalId; });
  var rt = stpRentalTable_();
  var r = rt.rows.filter(function (x) { return x.id === rentalId; })[0];
  if (!r) return;
  var patch = {};
  var label = stpRentalPaymentLabel(ledger);
  if (label && label !== String(r.paymentStatus || '')) patch.paymentStatus = label;
  var rentPaid = ledger.some(function (x) { return (x.kind === 'rent' || x.kind === 'rent_plus_deposit') && x.status === 'paid'; });
  if (r.status === 'รอชำระ') {
    if (rentPaid) {
      patch.status = 'จอง';
      patch.lastEditedDate = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm') + ' (Stripe)';
    } else if (ledger.length && ledger.every(function (x) { return x.status === 'expired' || x.status === 'failed' || x.status === 'canceled'; })) {
      patch.status = 'ยกเลิก';
      patch.note = (String(r.note || '') + ' [ไม่ได้ชำระภายในเวลา — ยกเลิกอัตโนมัติ]').trim();
    }
  }
  if (Object.keys(patch).length) stpPatch_(rt.sheet, rt.headers, r._row, patch);
  if (patch.status === 'จอง') {
    var data = { id: r.id, customer: r.customer, sales: 'จองออนไลน์ (JIA)', productNames: String(r.productNames || ''),
      start: stpIsoToSheet(r.startIso), due: stpIsoToSheet(r.dueIso), deliverDate: stpIsoToSheet(r.deliverIso),
      returnBy: stpIsoToSheet(r.returnByIso), note: 'ชำระผ่าน Stripe แล้ว ' + (patch.paymentStatus || label) };
    if (typeof notifyLine_ === 'function') { try { notifyLine_('newBooking', data); } catch (e) { console.error(e); } }
    else stpLineText_('🆕 จองออนไลน์ชำระแล้ว — รอยืนยันส่ง\nเลขที่: ' + r.id + '\nผู้เช่า: ' + r.customer);
  } else if (newlyPaidRow) {
    stpLineText_('💳 Stripe ' + (newlyPaidRow.status === 'hold' ? 'กันวงเงินมัดจำ' : 'รับชำระ') + ' ฿' + newlyPaidRow.amount +
      '\nเลขที่: ' + rentalId + '\nผู้เช่า: ' + r.customer + '\nสถานะ: ' + label);
  }
  try { CacheService.getScriptCache().remove('public_availability'); } catch (e) { /* ignore */ }
}

// =====================================================================
// ส่วนที่ 3: Actions
// =====================================================================

function stpConfig_() {
  return { ok: true, jiaReady: !!stpKeyFor_('jia'), rojrungReady: !!stpKeyFor_('rojrung'),
    staffKeySet: !!stpProp_('STAFF_PAY_KEY', ''), opsKeySet: !!stpProp_('OPS_PAY_KEY', ''),
    jiaCompanyName: stpJiaName_(), rojrungCompanyName: STP_ROJRUNG_NAME, maxHoldDays: STP_MAX_HOLD_DAYS,
    holdValidDays: STP_HOLD_VALID_DAYS, holdWarnDays: STP_HOLD_WARN_DAYS };
}

function stpPublicLedgerRow_(x) {
  return { sessionId: x.sessionId, rentalId: x.rentalId, kind: x.kind, amount: x.amount, status: x.status,
    captureMethod: x.captureMethod, createdAt: x.createdAt, paidAt: x.paidAt, capturedAmount: x.capturedAmount,
    refundedAmount: x.refundedAmount, releasedAt: x.releasedAt, note: x.note, entity: x.entity,
    depositAmount: x.depositAmount, depositDeducted: x.depositDeducted, method: x.method, url: x.url,
    expiresAt: x.expiresAt, createdBy: x.createdBy };
}

function stpPayments_(p) {
  var bad = stpCheckKey_('STAFF_PAY_KEY', p.key);
  if (bad) return { error: bad, needKey: true };
  var ids = p.rentalIds ? String(p.rentalIds).split(',') : null;
  var rows = stpLedgerRows_().rows.filter(function (x) { return x.sessionId && (!ids || ids.indexOf(x.rentalId) !== -1); });
  return { ok: true, payments: rows.map(stpPublicLedgerRow_), holds: stpHoldWarnings(rows, Date.now()), config: stpConfig_() };
}

function stpCreateLink_(p) {
  var bad = stpCheckKey_('STAFF_PAY_KEY', p.key);
  if (bad) return { error: bad, needKey: true };
  var rt = stpRentalTable_();
  var r = rt.rows.filter(function (x) { return x.id === String(p.rentalId || ''); })[0];
  if (!r) return { error: 'ไม่พบรายการเช่า ' + p.rentalId };
  if (r.status === 'ยกเลิก') return { error: 'รายการนี้ถูกยกเลิกแล้ว' };
  var entity = stpEntityOf_(r);
  if (!stpKeyFor_(entity)) return { error: entity === 'jia' ? 'ยังไม่ได้ตั้งค่าบัญชี Stripe ของ JIA' : 'ยังไม่ได้ตั้งค่าบัญชี Stripe ของโรจน์รุ่ง', notReady: true };
  var lt = stpLedgerRows_();
  var mine = lt.rows.filter(function (x) { return x.rentalId === r.id; });
  var plan = stpStaffPlan(r, mine, { purpose: p.purpose, method: p.method, todayIso: stpTodayIso_() });
  plan.entity = entity; plan.companyName = stpCompanyName_(entity);
  if (String(p.dryRun) === '1' || plan.errors.length) return { ok: !plan.errors.length, dryRun: true, plan: plan, error: plan.errors[0] };

  return stpWithLock_(function () {
    var out = [];
    plan.sessions.forEach(function (s) {
      // ลิงก์เดิมยังเปิดอยู่ ยอด/ชนิดเดียวกัน → ใช้ลิงก์เดิม (กดซ้ำไม่สร้างใหม่)
      var same = mine.filter(function (x) { return x.status === 'pending' && x.kind === s.kind && Math.abs(x.amount - s.amount) < 0.005 && new Date(x.expiresAt).getTime() > Date.now() + 600000; })[0];
      if (same) { out.push({ kind: s.kind, amount: s.amount, url: same.url, sessionId: same.sessionId, reused: true }); return; }
      // ลิงก์เก่าที่ยังเปิดและยอดทับกัน → ปิดก่อน กันลูกค้าจ่ายซ้ำ
      var overlap = { rent: ['rent', 'rent_plus_deposit'], rent_plus_deposit: ['rent', 'rent_plus_deposit', 'deposit_hold', 'deposit_charge'],
        deposit_hold: ['deposit_hold', 'deposit_charge', 'rent_plus_deposit'], deposit_charge: ['deposit_hold', 'deposit_charge', 'rent_plus_deposit'] }[s.kind];
      mine.filter(function (x) { return x.status === 'pending' && overlap.indexOf(x.kind) !== -1; }).forEach(function (x) {
        try { stpStripe_(entity, 'post', '/checkout/sessions/' + x.sessionId + '/expire', {}); } catch (e) { console.error(e); }
        stpSyncSession_(x.sessionId);
      });
      var expSec = Math.floor(Date.now() / 1000) + 23 * 3600;
      var sess = stpCreateSession_(entity, {
        rentalId: r.id, kind: s.kind, entity: entity, channel: r.channel || (entity === 'jia' ? 'online' : 'sales'),
        lines: s.lines, amount: s.amount, depositAmount: s.depositAmount, methods: s.methods, captureMethod: s.captureMethod,
        start: r.startIso, end: r.dueIso, productIds: r.productIds.join(','), baseUrl: stpBaseUrl_(), expiresAtSec: expSec,
        nonce: String(Date.now())
      });
      stpAppend_(stpLedger_(), { sessionId: sess.id, rentalId: r.id, kind: s.kind, amount: s.amount, status: 'pending',
        paymentIntentId: '', captureMethod: s.captureMethod, createdAt: stpNowIso_(), entity: entity,
        depositAmount: s.depositAmount, depositDeducted: 0, method: s.methods.join(','), url: sess.url,
        expiresAt: new Date(expSec * 1000).toISOString(), createdBy: String(p.by || '').slice(0, 50), capturedAmount: 0, refundedAmount: 0 });
      out.push({ kind: s.kind, amount: s.amount, url: sess.url, sessionId: sess.id });
    });
    stpApplyRental_(r.id, null);
    return { ok: true, plan: plan, links: out };
  });
}

function stpDepositAction_(p) {
  var bad = stpCheckKey_('OPS_PAY_KEY', p.opsKey);
  if (bad) return { error: bad, needOpsKey: true };
  var sid = String(p.sessionId || '');
  var sync = stpSyncSession_(sid); // สถานะล่าสุดจาก Stripe ก่อนทำอะไร
  if (sync.error) return sync;
  var res = stpWithLock_(function () {
    var lt = stpLedgerRows_();
    var row = lt.rows.filter(function (x) { return x.sessionId === sid; })[0];
    var plan = stpDepositActionPlan(row, p.op, Number(p.damage) || 0);
    if (plan.error) return { error: plan.error };
    var by = String(p.by || '').slice(0, 50);
    var entity = row.entity || 'rojrung';
    var note = String(row.note || '');
    var patch = {};
    if (plan.call === 'cancel') {
      stpStripe_(entity, 'post', '/payment_intents/' + row.paymentIntentId + '/cancel', { cancellation_reason: 'requested_by_customer' }, 'jr-cancel-' + sid);
      note += ' [ปล่อยวงเงินโดย ' + by + ' ' + stpTodayIso_() + ']';
    } else if (plan.call === 'capture') {
      stpStripe_(entity, 'post', '/payment_intents/' + row.paymentIntentId + '/capture', { amount_to_capture: Math.round(plan.amountToCapture * 100) }, 'jr-capture-' + sid);
      note += ' [หักค่าเสียหาย ' + plan.amountToCapture + ' โดย ' + by + ' ' + stpTodayIso_() + ']';
      patch.depositDeducted = plan.amountToCapture;
    } else {
      if (plan.call === 'refund') {
        stpStripe_(entity, 'post', '/refunds', { payment_intent: row.paymentIntentId, amount: Math.round(plan.refundAmount * 100), reason: 'requested_by_customer',
          metadata: { brand: STP_BRAND, rental_id: row.rentalId, kind: 'deposit_refund', by: by } }, 'jr-refund-' + sid + '-' + Math.round(plan.refundAmount * 100));
      }
      note += ' [คืนมัดจำ ' + plan.refundAmount + (plan.deducted ? ' หัก ' + plan.deducted : '') + ' โดย ' + by + ' ' + stpTodayIso_() + ']';
      patch.depositDeducted = plan.deducted;
      patch.releasedAt = stpNowIso_();
    }
    patch.note = note.trim();
    stpPatch_(stpLedger_(), lt.headers, row._row, patch);
    return null;
  });
  if (res) return res;
  var after = stpSyncSession_(sid);
  var lr = stpLedgerRows_().rows.filter(function (x) { return x.sessionId === sid; })[0];
  stpLineText_('💰 มัดจำ ' + lr.rentalId + ': ' + String(lr.note || '').split('[').pop().replace(']', '') + '\nสถานะ: ' + lr.status);
  return { ok: true, payment: stpPublicLedgerRow_(lr), sync: after };
}

function stpCatalog_() {
  var allowed = String(stpProp_('ONLINE_CATEGORIES', '')).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  var cats = {};
  stpProducts_().forEach(function (p) {
    if (STP_UNUSABLE_PRODUCT.indexOf(p.status) !== -1 || !p.cat) return;
    if (allowed.length && allowed.indexOf(p.cat) === -1) return;
    if (!cats[p.cat]) cats[p.cat] = { cat: p.cat, minPrice: p.price, maxPrice: p.price, plus: stpIsPlusCat(p.cat) };
    cats[p.cat].minPrice = Math.min(cats[p.cat].minPrice, p.price);
    cats[p.cat].maxPrice = Math.max(cats[p.cat].maxPrice, p.price);
  });
  return { ok: true, categories: Object.keys(cats).sort().map(function (k) { return cats[k]; }),
    plusNoMonitorPrice: STP_PLUS_NO_MONITOR_PRICE, depositPerItem: Number(stpProp_('ONLINE_DEPOSIT_PER_ITEM', 0)) || 0,
    limits: STP_ONLINE_LIMITS, provinces: STP_ALL_PROVINCES, companyName: stpJiaName_(), ready: !!stpKeyFor_('jia'),
    today: stpTodayIso_(), maxHoldDays: STP_MAX_HOLD_DAYS };
}

function stpQuoteCtx_(ledgerRows) {
  var allowed = String(stpProp_('ONLINE_CATEGORIES', '')).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  return { products: stpProducts_(), rentals: stpRentalTable_().rows, pendingRentalIds: stpPendingRentalIds_(ledgerRows),
    todayIso: stpTodayIso_(), depositPerItem: Number(stpProp_('ONLINE_DEPOSIT_PER_ITEM', 0)) || 0, allowedCats: allowed };
}
function stpPublicQuote_(b) {
  if (!stpRateLimit_('rl_quote_global', 120, 60)) return { ok: false, errors: ['มีผู้ใช้งานจำนวนมาก กรุณาลองใหม่ในอีกสักครู่'] };
  var q = stpOnlineQuote(b, stpQuoteCtx_(stpLedgerRows_().rows));
  if (!q.ok) return q;
  delete q.productIds; delete q.productNames; // ไม่เปิดเผยรหัส/ชื่อหุ่นรายตัวบนหน้าสาธารณะ
  return q;
}

function stpRateLimit_(key, max, seconds) {
  var c = CacheService.getScriptCache();
  var n = Number(c.get(key) || 0);
  if (n >= max) return false;
  c.put(key, String(n + 1), seconds);
  return true;
}

function stpPublicCreateBooking_(b) {
  if (!stpKeyFor_('jia')) return { error: 'ระบบจองออนไลน์ยังไม่เปิดใช้งาน กรุณาติดต่อเจ้าหน้าที่' };
  var errs = stpValidateBookingInput(b);
  if (errs.length) return { ok: false, errors: errs };
  if (b.website) return { ok: false, errors: ['ข้อมูลไม่ถูกต้อง'] }; // honeypot
  var phone = String(b.phone).replace(/[^0-9]/g, '');
  if (!stpRateLimit_('rl_book_phone_' + phone, 3, 3600)) return { ok: false, errors: ['เบอร์นี้สร้างการจองหลายครั้งแล้ว กรุณารอสักครู่ หรือติดต่อเจ้าหน้าที่'] };
  if (!stpRateLimit_('rl_book_global', 30, 600)) return { ok: false, errors: ['มีการจองจำนวนมากในขณะนี้ กรุณาลองใหม่ในอีกสักครู่'] };

  return stpWithLock_(function () {
    var rentalId = null, rt = null;
    var lt = stpLedgerRows_();
    var q = stpOnlineQuote(b, stpQuoteCtx_(lt.rows));
    if (!q.ok) return q;
    if (b.expectedTotal != null && Math.abs(Number(b.expectedTotal) - q.chargeNow) > 0.005) {
      return { ok: false, errors: ['ราคาเปลี่ยนแปลง กรุณาตรวจยอดใหม่ก่อนชำระ'], quote: q, priceChanged: true };
    }
    var cust = stpFindOrCreateCustomer_(String(b.name).trim(), phone, String(b.address).trim(), b.province);
    var props = stpProps_();
    var n = Number(props.getProperty('WEB_RENTAL_COUNTER') || 0) + 1;
    props.setProperty('WEB_RENTAL_COUNTER', String(n));
    var ym = stpTodayIso_().slice(0, 7).replace('-', '');
    rentalId = 'WEB-' + ym + '-' + String(n).padStart(4, '0') + '-' + Math.random().toString(36).substr(2, 3).toUpperCase();
    var noteParts = ['[จองออนไลน์ JIA]'];
    if (cust.name !== String(b.name).trim()) noteParts.push('ชื่อที่กรอก: ' + String(b.name).trim());
    if (b.taxName) noteParts.push('ออกใบเสร็จในนาม: ' + String(b.taxName).trim());
    if (b.note) noteParts.push(String(b.note).trim());
    if (q.bufferDays) noteParts.push('[เผื่อขนส่ง ' + q.bufferDays + ' วัน]');
    if (q.depositMode === 'hold') noteParts.push('[มัดจำ ' + q.deposit + ' บาท: ส่งลิงก์กันวงเงินบัตรใกล้วันส่งของ]');
    rt = stpRentalTable_();
    stpAppend_(rt.sheet, {
      id: rentalId, start: stpIsoToSheet(q.start), due: stpIsoToSheet(q.end), deliverDate: stpIsoToSheet(q.deliverIso), returnDate: '',
      productIds: q.productIds.join(','), productNames: q.productNames.join(','), totalPricePerDay: q.pricePerDay, days: q.days,
      total: q.rent, deposit: q.deposit, paymentStatus: 'Stripe: รอชำระ', customer: cust.name, sales: '', status: 'รอชำระ',
      note: noteParts.join(' '), isVIP: false, vipReason: '', noDueDate: false, rentalMode: 'daily',
      returnBy: q.returnByIso ? stpIsoToSheet(q.returnByIso) : '', bufferDays: q.bufferDays, entity: 'jia', channel: 'online',
      lastEditedDate: Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm') + ' (จองออนไลน์)'
    });
    var lines = q.summary.map(function (s) { return { name: s.label + ' ×' + s.qty + ' (' + q.days + ' วัน)', amount: stpRound2(s.pricePerDay * q.days) }; });
    if (q.depositMode === 'charge') lines.push({ name: 'มัดจำ (คืนเมื่อรับคืนสภาพดี)', amount: q.deposit });
    var expSec = Math.floor(Date.now() / 1000) + STP_ONLINE_LIMITS.sessionMinutes * 60;
    var methods = [b.method === 'promptpay' ? 'promptpay' : 'card'];
    var sess;
    try {
      sess = stpCreateSession_('jia', {
        rentalId: rentalId, kind: q.kind, entity: 'jia', channel: 'online', guest: true, lines: lines, amount: q.chargeNow,
        depositAmount: q.depositMode === 'charge' ? q.deposit : 0, methods: methods, captureMethod: 'automatic',
        start: q.start, end: q.end, productIds: q.productIds.join(','), baseUrl: stpBaseUrl_(),
        cancelUrl: stpBaseUrl_() + '/book.html?cancelled=1', expiresAtSec: expSec, attribution: b.attribution, nonce: rentalId
      });
    } catch (e) {
      var r0 = stpRentalTable_().rows.filter(function (x) { return x.id === rentalId; })[0];
      if (r0) stpPatch_(rt.sheet, rt.headers, r0._row, { status: 'ยกเลิก', note: noteParts.join(' ') + ' [สร้างลิงก์ชำระเงินไม่สำเร็จ]' });
      console.error(e);
      return { ok: false, errors: ['สร้างหน้าชำระเงินไม่สำเร็จ กรุณาลองใหม่ หรือติดต่อเจ้าหน้าที่'] };
    }
    stpAppend_(stpLedger_(), { sessionId: sess.id, rentalId: rentalId, kind: q.kind, amount: q.chargeNow, status: 'pending',
      captureMethod: 'automatic', createdAt: stpNowIso_(), entity: 'jia', depositAmount: q.depositMode === 'charge' ? q.deposit : 0,
      depositDeducted: 0, method: methods.join(','), url: sess.url, expiresAt: new Date(expSec * 1000).toISOString(),
      createdBy: 'online', capturedAmount: 0, refundedAmount: 0 });
    try { CacheService.getScriptCache().remove('public_availability'); } catch (e) { /* ignore */ }
    return { ok: true, rentalId: rentalId, url: sess.url, chargeNow: q.chargeNow };
  });
}

function stpFindOrCreateCustomer_(name, phone, address, province) {
  var sh = stpSheet_(STP_CUSTOMER_SHEET);
  var t = stpRead_(sh);
  var found = t.rows.filter(function (c) { return String(c.phone || '').replace(/[^0-9]/g, '') === phone; })[0];
  if (found) return { id: String(found.id), name: String(found.name), isNew: false };
  var ids = {};
  t.rows.forEach(function (c) { ids[String(c.id)] = true; });
  var n = t.rows.length + 1;
  while (ids['C-' + String(n).padStart(4, '0')]) n++;
  var id = 'C-' + String(n).padStart(4, '0');
  // ชื่อซ้ำกับลูกค้าเดิม (คนละเบอร์) → ต่อท้ายเบอร์ เพราะ index.html จับคู่ลูกค้ากับรายการเช่าด้วยชื่อ
  var nameTaken = t.rows.some(function (c) { return String(c.name) === name; });
  var finalName = nameTaken ? name + ' (' + phone.slice(-4) + ')' : name;
  stpAppend_(sh, { id: id, name: finalName, phone: phone, address: address, billingAddress: address, province: province, sales: '', rentCount: 1, total: 0 });
  return { id: id, name: finalName, isNew: true };
}

function stpPublicSessionStatus_(sessionId) {
  sessionId = String(sessionId || '');
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return { error: 'ไม่พบรายการ' };
  var c = CacheService.getScriptCache();
  if (!c.get('sync_' + sessionId)) { // ดึงจาก Stripe ใหม่ได้ไม่เกินทุก 10 วินาทีต่อ session
    c.put('sync_' + sessionId, '1', 10);
    try { stpSyncSession_(sessionId); } catch (e) { console.error(e); }
  }
  var row = stpLedgerRows_().rows.filter(function (x) { return x.sessionId === sessionId; })[0];
  if (!row) return { error: 'ไม่พบรายการ' };
  // ไม่ส่งข้อมูลส่วนตัว: แค่เลขที่ ชนิด ยอด สถานะ ชื่อบริษัทผู้รับเงิน
  return { ok: true, rentalId: row.rentalId, kind: row.kind, amount: row.amount, status: row.status,
    depositAmount: row.depositAmount, companyName: stpCompanyName_(row.entity), entity: row.entity === 'jia' ? 'jia' : 'rojrung' };
}

function stpHandleWebhook_(e) {
  var acct = e.parameter.acct === 'jia' ? 'jia' : e.parameter.acct === 'rojrung' ? 'rojrung' : null;
  if (!acct) return { ok: false };
  var id = '';
  try { id = String(JSON.parse(e.postData.contents).id || ''); } catch (err) { return { ok: false }; }
  if (!/^evt_[A-Za-z0-9]+$/.test(id)) return { ok: false };
  var c = CacheService.getScriptCache();
  if (c.get('evt_' + acct + id)) return { ok: true, duplicate: true };
  var ev = stpStripe_(acct, 'get', '/events/' + id); // ไม่เชื่อ body — ดึง event จริงจาก Stripe ด้วย key ของบัญชีนั้น
  var obj = ev && ev.data && ev.data.object || {};
  if (obj.object !== 'checkout.session') { c.put('evt_' + acct + id, '1', 21600); return { ok: true, ignored: true }; }
  if (!obj.metadata || obj.metadata.brand !== STP_BRAND) { c.put('evt_' + acct + id, '1', 21600); return { ok: true, ignored: 'other brand' }; }
  var mine = stpLedgerRows_().rows.filter(function (x) { return x.sessionId === obj.id; })[0];
  if (!mine || (mine.entity || 'rojrung') !== acct) return { ok: true, ignored: 'unknown session' };
  var res = stpSyncSession_(obj.id);
  c.put('evt_' + acct + id, '1', 21600);
  return res;
}

/** trigger ทุก 10 นาที: ไล่เช็ค session ที่ยังค้าง + วงเงินที่ใกล้หมดอายุ + เขียน paymentStatus ทับค่าที่ถูกแก้จาก browser */
function stripeReconcile() {
  var lt = stpLedgerRows_();
  var now = Date.now();
  var touched = {};
  lt.rows.forEach(function (x) {
    if (!x.sessionId) return;
    var open = x.status === 'pending' || x.status === 'processing' || x.status === 'hold';
    var recent = now - new Date(x.createdAt).getTime() < 60 * 86400000;
    if (open && recent) {
      try { stpSyncSession_(x.sessionId); } catch (e) { console.error('reconcile ' + x.sessionId + ': ' + e); }
      touched[x.rentalId] = true;
    }
  });
  // paymentStatus ในชีตอาจถูกเขียนทับด้วยข้อมูลเก่าจาก index.html → เขียนกลับให้ตรงสมุดบัญชี
  var fresh = stpLedgerRows_().rows;
  var byRental = {};
  fresh.forEach(function (x) { (byRental[x.rentalId] = byRental[x.rentalId] || []).push(x); });
  var rt = stpRentalTable_();
  rt.rows.forEach(function (r) {
    if (!byRental[r.id]) return;
    var want = stpRentalPaymentLabel(byRental[r.id]);
    if (want && want !== String(r.paymentStatus || '') && !touched[r.id]) stpApplyRental_(r.id, null);
  });
  // เตือน Ops วงเงินที่ค้าง ≥ 5 วัน (วันละครั้งต่อรายการ)
  var c = CacheService.getScriptCache();
  stpHoldWarnings(fresh, now).filter(function (h) { return h.warn; }).forEach(function (h) {
    var k = 'holdwarn_' + h.sessionId + '_' + stpTodayIso_();
    if (c.get(k)) return;
    c.put(k, '1', 90000);
    stpLineText_('⚠️ วงเงินมัดจำใกล้หมดอายุ\nเลขที่: ' + h.rentalId + '\nกันวงเงิน ฿' + h.amount + ' มาแล้ว ' + h.ageDays +
      ' วัน — หมดอายุประมาณ ' + Utilities.formatDate(new Date(h.expiresAt), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm') +
      '\nกด "ปล่อยวงเงิน" หรือ "หักค่าเสียหาย" ในระบบก่อนหมดอายุ (หมดอายุแล้ว = หักไม่ได้)');
  });
}

function stripeInstallTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'stripeReconcile') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('stripeReconcile').timeBased().everyMinutes(10).create();
  stpLedger_(); // สร้างชีต 'การชำระเงิน' ถ้ายังไม่มี
  stpSheet_(STP_RENTAL_SHEET, ['entity', 'channel']); // เพิ่มคอลัมน์ entity/channel ต่อท้ายถ้ายังไม่มี
  return 'ok';
}

// =====================================================================
// ส่วนที่ 4: Router — เรียกจาก doGet / doPost เดิม (ดูขั้นตอนติดตั้งด้านบน)
// =====================================================================

function stripeHandleGet_(e) {
  var p = (e && e.parameter) || {};
  var a = p.action;
  var map = {
    stripeConfig: function () { return stpConfig_(); },
    stripePayments: function () { return stpPayments_(p); },
    stripeCreateLink: function () { return stpCreateLink_(p); },
    stripeSync: function () {
      var bad = stpCheckKey_('STAFF_PAY_KEY', p.key); if (bad) return { error: bad, needKey: true };
      var ids = stpLedgerRows_().rows.filter(function (x) { return x.rentalId === String(p.rentalId || '') && x.sessionId; });
      ids.forEach(function (x) { try { stpSyncSession_(x.sessionId); } catch (err) { console.error(err); } });
      return stpPayments_({ key: p.key, rentalIds: p.rentalId });
    },
    stripeDepositAction: function () { return stpDepositAction_(p); },
    publicBookingCatalog: function () { return stpCatalog_(); },
    publicBookingQuote: function () { return stpPublicQuote_(JSON.parse(p.data || '{}')); },
    publicSessionStatus: function () { return stpPublicSessionStatus_(p.session_id); }
  };
  if (!map[a]) return null;
  try { return stpJson_(map[a]()); }
  catch (err) { console.error(a + ': ' + err); return stpJson_({ error: String(err.message || err) }); }
}

function stripeHandlePost_(e) {
  var a = e && e.parameter && e.parameter.action;
  try {
    if (a === 'stripeWebhook') return stpJson_(stpHandleWebhook_(e));
    if (a === 'publicCreateBooking') return stpJson_(stpPublicCreateBooking_(JSON.parse(e.postData.contents || '{}')));
  } catch (err) {
    console.error(a + ': ' + err);
    return stpJson_({ error: a === 'publicCreateBooking' ? 'ระบบขัดข้อง กรุณาลองใหม่ หรือติดต่อเจ้าหน้าที่' : String(err) });
  }
  return null;
}

// ให้ node ทดสอบ pure logic ได้ (Apps Script ไม่มี module → ข้าม)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    stpBufferDays: stpBufferDays, stpAddDaysIso: stpAddDaysIso, stpRentalDays: stpRentalDays, stpSanitizeAttribution: stpSanitizeAttribution,
    stpDecideDepositMode: stpDecideDepositMode, stpRentalCharges: stpRentalCharges, stpStaffPlan: stpStaffPlan,
    stpIsProductFree: stpIsProductFree, stpValidateBookingInput: stpValidateBookingInput, stpOnlineQuote: stpOnlineQuote,
    stpLedgerStateFromSession: stpLedgerStateFromSession, stpRentalPaymentLabel: stpRentalPaymentLabel,
    stpHoldWarnings: stpHoldWarnings, stpDepositActionPlan: stpDepositActionPlan, stpFormEncode: stpFormEncode,
    stpBuildSessionParams: stpBuildSessionParams, stpIsPlusCat: stpIsPlusCat
  };
}
