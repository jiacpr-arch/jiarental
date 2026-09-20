/**
 * apps_script_additions.js
 * ============================================================
 * ไฟล์นี้เป็น "ส่วนเพิ่ม" สำหรับ apps_script_v4.js (Apps Script backend เดิม)
 * ไม่ใช่ไฟล์แทนที่ทั้งหมด — ให้คัดลอกเนื้อหาทั้งไฟล์นี้ไปวางเป็นไฟล์ใหม่
 * ในโปรเจกต์ Apps Script เดิม (Extensions > Apps Script) แล้วทำตามขั้นตอนด้านล่าง
 *
 * ฟีเจอร์ที่เพิ่ม:
 *   1) แจ้งเตือน LINE กลุ่ม Ops เมื่อมีจองใหม่ / ยืนยันส่งแล้ว / ยกเลิกจอง
 *   2) API สาธารณะสำหรับหน้า availability.html (เช็ควันว่างอุปกรณ์ — ไม่ต้อง login)
 *
 * ------------------------------------------------------------
 * วิธีติดตั้ง (ทำทีละขั้น):
 * ------------------------------------------------------------
 * 1. เปิด Google Sheets ต้นทาง > Extensions > Apps Script
 * 2. คลิก "+" ข้าง Files > Script > ตั้งชื่อ "apps_script_additions"
 *    แล้ววางโค้ดทั้งหมดในไฟล์นี้ลงไป
 * 3. เปิดไฟล์ apps_script_v4.js (ไฟล์เดิม) หาฟังก์ชัน doGet(e) แล้วหา
 *    switch (e.parameter.action) { ... } หรือ if/else ที่ต่อ action ต่าง ๆ
 *    เพิ่ม 2 case นี้เข้าไปในบล็อกเดิม (ชื่อ action ต้องตรงกับที่ index.html
 *    และ availability.html เรียก):
 *
 *      case 'notifyLine':
 *        return jsonOut_(notifyLine_(e.parameter.event, JSON.parse(e.parameter.data || '{}')));
 *      case 'getPublicAvailability':
 *        return jsonOut_(getPublicAvailability_());
 *
 *    ถ้า doGet(e) เดิมใช้ if/else แทน switch ให้ปรับรูปแบบให้เข้ากับของเดิม
 *    เช่น:
 *      if (e.parameter.action === 'notifyLine') return jsonOut_(notifyLine_(e.parameter.event, JSON.parse(e.parameter.data || '{}')));
 *      if (e.parameter.action === 'getPublicAvailability') return jsonOut_(getPublicAvailability_());
 *
 *    (ถ้า apps_script_v4.js มีฟังก์ชันชื่อ jsonOut_ หรือคล้ายกันอยู่แล้วสำหรับ
 *    ห่อ ContentService.createTextOutput(...) ให้ใช้ของเดิมแทนแล้วลบฟังก์ชัน
 *    jsonOut_ ท้ายไฟล์นี้ทิ้งเพื่อไม่ให้ชื่อชนกัน)
 *
 * 4. ตั้งค่า LINE Official Account (ถ้ายังไม่มี):
 *    - สมัคร/ใช้ LINE Official Account เดิมของบริษัท ที่ https://manager.line.biz
 *    - เปิดใช้ Messaging API ใน LINE Official Account Manager
 *      (Settings > Messaging API > Enable Messaging API)
 *    - ไปที่ LINE Developers Console (https://developers.line.biz) เลือก
 *      Provider/Channel ของ OA นั้น > Messaging API > คัดลอก
 *      "Channel access token" (Long-lived) — กดสร้างถ้ายังไม่มี
 *    - เชิญ OA เข้ากลุ่ม LINE ที่ Ops ใช้คุยงาน
 *
 * 5. ตั้งค่า Script Properties (เก็บ token ให้ปลอดภัย ไม่ hardcode ในโค้ด):
 *    Apps Script > Project Settings (รูปเฟือง) > Script Properties > Add script property
 *      LINE_TOKEN = <Channel access token จากขั้นตอน 4>
 *      LINE_TO    = <group ID ของกลุ่ม LINE Ops>  (ดูวิธีหาที่ขั้นตอน 6)
 *
 * 6. วิธีหา group ID ของกลุ่ม LINE:
 *    - ไปที่ Apps Script > Deploy > New deployment > เลือกประเภท "Web app"
 *      Execute as: Me, Who has access: Anyone — Deploy แล้วคัดลอก URL ที่ได้
 *      (ใช้ URL เดียวกับ Web app เดิมของระบบได้เลยถ้า deploy ร่วมกัน)
 *    - ไปที่ LINE Developers Console > Messaging API > Webhook settings
 *      ใส่ Webhook URL เป็น URL เดียวกัน (ต้องเป็น URL ของ "Web app" ไม่ใช่
 *      URL ของสเปรดชีต) แล้วเปิด "Use webhook"
 *    - เข้ากลุ่ม LINE ที่เชิญ OA เข้าไปแล้ว พิมพ์ข้อความอะไรก็ได้ 1 ข้อความ
 *      (ทำให้ LINE ส่ง event เข้า webhook — ฟังก์ชัน doPost ด้านล่างจะเก็บ
 *      groupId ล่าสุดไว้ให้อัตโนมัติ)
 *    - กลับมาที่ Script Properties เปิดดูค่า LINE_LAST_GROUP_ID ที่ถูกเก็บไว้
 *      แล้วคัดลอกมาใส่เป็นค่า LINE_TO ตามขั้นตอน 5
 *    - หมายเหตุ: ถ้า apps_script_v4.js มีฟังก์ชัน doPost(e) อยู่แล้ว (เช่น
 *      รับ webhook อื่น) ให้ "รวม" โค้ดในฟังก์ชัน doPost ด้านล่างเข้ากับของเดิม
 *      แทนที่จะมี doPost ซ้ำ 2 ตัว (Apps Script อนุญาตแค่ doPost เดียวต่อโปรเจกต์)
 *
 * 7. Deploy > Manage deployments > แก้ไข (ไอคอนดินสอ) deployment เดิม >
 *    Version: New version > Deploy
 *    (ต้อง Deploy ใหม่ทุกครั้งที่แก้ไข Apps Script โค้ดถึงจะมีผล)
 *
 * 8. ทดสอบ: สร้างจองทดสอบในระบบ (index.html) ข้อความควรเข้ากลุ่ม LINE ภายในไม่กี่วินาที
 *    ถ้าไม่มี LINE_TOKEN/LINE_TO ตั้งไว้ ฟังก์ชัน notifyLine_ จะข้ามการส่งเงียบ ๆ
 *    (ไม่ error) ระบบหลักจึงใช้งานได้ปกติแม้ยังไม่ได้ตั้งค่า LINE
 *
 * หมายเหตุสำคัญ: LINE Notify (notify-bot.line.me) ปิดให้บริการแล้วตั้งแต่ปี 2025
 * ไฟล์นี้จึงใช้ LINE Messaging API (push message) แทน ซึ่งต้องมี LINE OA
 * ============================================================
 */

// ========== 1) แจ้งเตือน LINE ==========

/**
 * ส่งข้อความแจ้งเตือนเข้ากลุ่ม LINE ของ Ops
 * @param {string} event  'newBooking' | 'confirmed' | 'cancelled'
 * @param {object} data   ข้อมูลย่อของรายการเช่า (ส่งมาจาก index.html: gsNotifyLine)
 */
function notifyLine_(event, data) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('LINE_TOKEN');
  const to = props.getProperty('LINE_TO');
  if (!token || !to) {
    // ยังไม่ได้ตั้งค่า LINE — ข้ามการแจ้งเตือนแบบเงียบ ๆ ไม่ทำให้ระบบหลักพัง
    return { skipped: true, reason: 'LINE_TOKEN หรือ LINE_TO ยังไม่ได้ตั้งค่าใน Script Properties' };
  }

  const text = buildLineMessage_(event, data || {});
  if (!text) return { skipped: true, reason: 'ไม่รู้จัก event: ' + event };

  const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({ to: to, messages: [{ type: 'text', text: text }] }),
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  if (code >= 300) {
    console.error('LINE push error ' + code + ': ' + res.getContentText());
  }
  return { ok: code < 300, code: code };
}

function buildLineMessage_(event, r) {
  const prodNames = Array.isArray(r.productNames) ? r.productNames.join(', ') : (r.productNames || '');
  const lines = [];
  if (event === 'newBooking') {
    lines.push('🆕 มีจองใหม่ — รอยืนยันส่ง');
  } else if (event === 'confirmed') {
    lines.push('✅ ยืนยันส่งแล้ว — เปลี่ยนเป็นกำลังเช่า');
  } else if (event === 'cancelled') {
    lines.push('❌ ยกเลิกการจอง');
  } else {
    return null;
  }
  lines.push('เลขที่: ' + (r.id || '—'));
  lines.push('ผู้เช่า: ' + (r.customer || '—'));
  lines.push('เซลล์: ' + (r.sales || '—'));
  if (prodNames) lines.push('สินค้า: ' + prodNames);
  if (r.start || r.due) lines.push('วันเช่า: ' + (r.start || '—') + ' - ' + (r.due || '—'));
  if (r.deliverDate) lines.push('🚚 วันส่งของ: ' + r.deliverDate);
  if (r.returnBy) lines.push('ของถึงออฟฟิศ: ' + r.returnBy);
  if (r.note) lines.push('หมายเหตุ: ' + r.note);
  return lines.join('\n');
}

/**
 * รับ webhook จาก LINE — ใช้ตอนตั้งค่าครั้งแรกเพื่อหา group ID ของกลุ่ม Ops
 * (พิมพ์ข้อความอะไรก็ได้ในกลุ่มที่เชิญ OA เข้าไปแล้ว 1 ครั้ง แล้วมาดูค่า
 *  LINE_LAST_GROUP_ID ใน Script Properties)
 *
 * ถ้า apps_script_v4.js มี doPost(e) อยู่แล้ว ให้รวมโค้ดในนี้เข้ากับของเดิม
 * แทนที่จะมีฟังก์ชัน doPost ซ้ำสองตัว
 */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const events = body.events || [];
    events.forEach(function (ev) {
      if (ev.source && ev.source.type === 'group' && ev.source.groupId) {
        PropertiesService.getScriptProperties().setProperty('LINE_LAST_GROUP_ID', ev.source.groupId);
      }
    });
  } catch (err) {
    console.error('doPost (LINE webhook) error: ' + err);
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}

// ========== 2) ปฏิทินว่างสาธารณะ (availability.html) ==========

// สถานะสินค้าที่ถือว่า "ใช้เช่าไม่ได้" ไม่ว่าจะมีวันว่างหรือไม่
const UNAVAILABLE_PRODUCT_STATUSES_ = ['ซ่อม', 'ไม่พร้อมใช้งาน', 'ออกสอน', 'ออกบูธ', 'ทดแทน'];
// สถานะรายการเช่าที่ถือว่า "จองครองคิวอยู่" (กันวันไว้ในปฏิทินว่าง)
const BUSY_RENTAL_STATUSES_ = ['จอง', 'กำลังเช่า', 'เกินกำหนด', 'ยืมด่วน'];

/**
 * คืนข้อมูลว่าง/ไม่ว่างของสินค้าแบบไม่ระบุตัวตนลูกค้า สำหรับหน้า availability.html
 * (ไม่มีชื่อลูกค้า/ราคา/เซลล์/เลขที่จอง — ปลอดภัยสำหรับเปิดสาธารณะ)
 * cache 60 วินาทีเพื่อลดโหลด Sheets ตอนมีคนเข้าดูพร้อมกันหลายคน
 */
function getPublicAvailability_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('public_availability');
  if (cached) return JSON.parse(cached);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const productSheet = ss.getSheetByName('สินค้า');
  const rentalSheet = ss.getSheetByName('รายการเช่า');

  const products = sheetRowsAsObjects_(productSheet).map(function (row) {
    return { id: row.id, cat: row.cat, status: row.status };
  }).filter(function (p) { return p.id; });

  const busy = [];
  sheetRowsAsObjects_(rentalSheet).forEach(function (row) {
    if (!row.id) return;
    if (BUSY_RENTAL_STATUSES_.indexOf(row.status) === -1) return;
    const productIds = String(row.productIds || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (!productIds.length) return;
    const from = toIsoDate_(row.deliverDate) || toIsoDate_(row.start);
    const noDue = row.noDueDate === true || row.noDueDate === 'true';
    const to = noDue ? null : (toIsoDate_(row.returnBy) || toIsoDate_(row.due));
    if (!from) return;
    busy.push({ productIds: productIds, from: from, to: to });
  });

  const result = { products: products, busy: busy, updatedAt: new Date().toISOString() };
  cache.put('public_availability', JSON.stringify(result), 60);
  return result;
}

// อ่านชีตเป็น array ของ object ตาม header แถวแรก (ทนต่อลำดับคอลัมน์ที่อาจเปลี่ยน)
function sheetRowsAsObjects_(sheet) {
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(function (h) { return String(h).trim(); });
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const obj = {};
    headers.forEach(function (h, j) { obj[h] = row[j]; });
    rows.push(obj);
  }
  return rows;
}

// แปลงค่าจาก Sheets (Date object หรือ string dd/mm/yyyy) เป็น ISO yyyy-mm-dd
function toIsoDate_(v) {
  if (!v) return null;
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return null;
    return Utilities.formatDate(v, Session.getScriptTimeZone() || 'Asia/Bangkok', 'yyyy-MM-dd');
  }
  const s = String(v).trim();
  if (!s) return null;
  // รูปแบบ dd/mm/yyyy (ที่ dateToSheets() ใน index.html ใช้)
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  // ลอง parse ตรง ๆ (เผื่อเป็น ISO string อยู่แล้ว)
  const d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, Session.getScriptTimeZone() || 'Asia/Bangkok', 'yyyy-MM-dd');
  return null;
}

// ========== helper: ห่อผลลัพธ์เป็น JSON response ==========
// ถ้า apps_script_v4.js มี helper ชื่อนี้ (หรือคล้ายกัน) อยู่แล้ว ให้ลบอันนี้ทิ้ง
// แล้วใช้ของเดิมแทนในขั้นตอนที่ 3 ด้านบน เพื่อไม่ให้ชื่อฟังก์ชันชนกัน
function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
