// ทดสอบ pure logic ของ apps_script_stripe.js — รัน: node --test tests/
// ไม่ต้องติดตั้งอะไรเพิ่ม (ใช้ node:test ที่มากับ Node 18+)
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../apps_script_stripe.js');

test('buffer days ตามจังหวัด', () => {
  assert.equal(S.stpBufferDays('กรุงเทพมหานคร'), 0);
  assert.equal(S.stpBufferDays('ภูเก็ต'), 4);
  assert.equal(S.stpBufferDays('เชียงใหม่'), 3);
  assert.equal(S.stpBufferDays(''), 0);
});

test('จำนวนวันเช่า = สูตรเดียวกับ index.html', () => {
  assert.equal(S.stpRentalDays('2026-12-01', '2026-12-01'), 1);
  assert.equal(S.stpRentalDays('2026-12-01', '2026-12-04'), 3);
  assert.equal(S.stpAddDaysIso('2026-12-01', -5), '2026-11-26');
});

test('กรอง attribution ตาม playbook', () => {
  const out = S.stpSanitizeAttribution({
    utm_source: 'facebook', utm_campaign: 'แคมเปญไทย', fbclid: 'IwAR0abc-_.', gclid: 'x'.repeat(201),
    user_id: 'hack', utm_medium: 123, fbc: 'fb.1.1700000000.IwAR', utm_term: 'a b'
  });
  assert.deepEqual(out, { utm_source: 'facebook', fbclid: 'IwAR0abc-_.', fbc: 'fb.1.1700000000.IwAR' });
});

test('attribution เขียนทับ metadata หลักไม่ได้', () => {
  const p = S.stpBuildSessionParams({ rentalId: 'WEB-1', kind: 'rent', entity: 'jia', channel: 'online', guest: true,
    lines: [{ name: 'x', amount: 500 }], amount: 500, depositAmount: 0, methods: ['card'], captureMethod: 'automatic',
    baseUrl: 'https://rent.jiacpr.com', expiresAtSec: 1, attribution: { utm_source: 'ig', brand: 'other' } });
  assert.equal(p.metadata.brand, 'jiarental');
  assert.equal(p.metadata.guest, '1');
  assert.equal(p.metadata.utm_source, 'ig');
  assert.equal(p.line_items[0].price_data.unit_amount, 50000);
  assert.equal(p.payment_intent_data.capture_method, undefined);
  assert.match(p.success_url, /paid\.html\?session_id=\{CHECKOUT_SESSION_ID\}$/);
});

test('session กันวงเงินใช้ capture_method=manual', () => {
  const p = S.stpBuildSessionParams({ rentalId: 'RN-1', kind: 'deposit_hold', entity: 'rojrung', channel: 'sales',
    lines: [{ name: 'มัดจำ', amount: 2000 }], amount: 2000, depositAmount: 2000, methods: ['card'], captureMethod: 'manual',
    baseUrl: 'https://x', expiresAtSec: 1 });
  assert.equal(p.payment_intent_data.capture_method, 'manual');
  assert.equal(p.metadata.guest, undefined);
  const enc = S.stpFormEncode(p);
  assert.ok(enc.includes('payment_intent_data%5Bcapture_method%5D=manual'));
  assert.ok(enc.includes('line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=200000'));
  assert.ok(enc.includes('payment_method_types%5B0%5D=card'));
});

test('ตัดสินวิธีเก็บมัดจำ', () => {
  assert.equal(S.stpDecideDepositMode({ deposit: 0, rentalDays: 3, method: 'card' }).mode, 'none');
  assert.equal(S.stpDecideDepositMode({ deposit: 1000, rentalDays: 6, method: 'card' }).mode, 'hold');
  assert.equal(S.stpDecideDepositMode({ deposit: 1000, rentalDays: 7, method: 'card' }).mode, 'charge');
  assert.equal(S.stpDecideDepositMode({ deposit: 1000, rentalDays: 3, method: 'promptpay' }).mode, 'charge');
  assert.equal(S.stpDecideDepositMode({ deposit: 1000, rentalDays: 3, method: 'card', noDueDate: true }).mode, 'charge');
  assert.equal(S.stpDecideDepositMode({ deposit: 1000, rentalDays: 3, method: 'card', holdSpanDays: 9 }).mode, 'charge');
  assert.equal(S.stpDecideDepositMode({ deposit: 1000, rentalDays: 3, method: 'card', holdSpanDays: 6 }).mode, 'hold');
});

const baseRental = { id: 'RN-202612-0001-AAA', total: 1500, deposit: 2000, days: 3, deliveryShippingCost: 300,
  deliveryPayer: 'ลูกค้าออกเอง', shippingCost: 250, payer: 'บริษัทสำรองจ่าย', dueIso: '2026-12-04', returnByIso: null };

test('แผนลิงก์พนักงาน: บัตร + เช่าสั้น = ค่าเช่า + กันวงเงินแยก session', () => {
  const plan = S.stpStaffPlan(baseRental, [], { purpose: 'all', method: 'card', todayIso: '2026-12-01' });
  assert.equal(plan.rentDue, 1800); // ค่าเช่า + ค่าส่งที่ลูกค้าออกเอง (ไม่รวมค่าส่งกลับที่บริษัทจ่าย)
  assert.equal(plan.depositMode, 'hold');
  assert.deepEqual(plan.sessions.map(s => s.kind), ['rent', 'deposit_hold']);
  assert.deepEqual(plan.sessions[1].methods, ['card']);
  assert.equal(plan.sessions[0].lines.length, 2);
  assert.equal(plan.errors.length, 0);
});

test('แผนลิงก์พนักงาน: PromptPay = session เดียว ค่าเช่า + มัดจำแยกบรรทัด', () => {
  const plan = S.stpStaffPlan(baseRental, [], { purpose: 'all', method: 'promptpay', todayIso: '2026-12-01' });
  assert.equal(plan.sessions.length, 1);
  const s = plan.sessions[0];
  assert.equal(s.kind, 'rent_plus_deposit');
  assert.equal(s.amount, 3800);
  assert.equal(s.depositAmount, 2000);
  assert.deepEqual(s.methods, ['promptpay']);
  assert.equal(s.lines.length, 3);
});

test('แผนลิงก์พนักงาน: ลิงก์ล่วงหน้านาน วงเงินจะหมดอายุ → เก็บมัดจำจริง', () => {
  const plan = S.stpStaffPlan(baseRental, [], { purpose: 'deposit', method: 'card', todayIso: '2026-11-20' });
  assert.equal(plan.depositMode, 'charge');
  assert.equal(plan.sessions[0].kind, 'deposit_charge');
});

test('แผนลิงก์พนักงาน: หักยอดที่จ่ายแล้ว ไม่สร้างซ้ำ', () => {
  const ledger = [{ kind: 'rent', status: 'paid', amount: 1800, depositAmount: 0 }, { kind: 'deposit_hold', status: 'hold', amount: 2000, depositAmount: 2000 }];
  const plan = S.stpStaffPlan(baseRental, ledger, { purpose: 'all', method: 'card', todayIso: '2026-12-01' });
  assert.equal(plan.sessions.length, 0);
  assert.ok(plan.errors[0].includes('ไม่มียอดค้าง'));
  const partial = S.stpStaffPlan(baseRental, [{ kind: 'rent', status: 'paid', amount: 1000, depositAmount: 0 }], { purpose: 'rent', method: 'card', todayIso: '2026-12-01' });
  assert.equal(partial.rentDue, 800);
});

const products = [
  { id: 'M1', cat: 'CPR Man Plus', name: 'M1', price: 500, status: 'ว่าง' },
  { id: 'M2', cat: 'CPR Man Plus', name: 'M2', price: 500, status: 'ว่าง' },
  { id: 'M3', cat: 'CPR Man Plus', name: 'M3', price: 500, status: 'ซ่อม' },
  { id: 'A1', cat: 'AED Trainer', name: 'A1', price: 150, status: 'ว่าง' }
];

test('ใบเสนอราคาออนไลน์: ราคาคิดฝั่ง server + toggle มอนิเตอร์', () => {
  const q = S.stpOnlineQuote({ items: [{ cat: 'CPR Man Plus', qty: 2, monitor: false }, { cat: 'AED Trainer', qty: 1 }], start: '2026-12-10', end: '2026-12-13', province: 'เชียงใหม่', method: 'card' },
    { products, rentals: [], pendingRentalIds: {}, todayIso: '2026-11-16', depositPerItem: 1000 });
  assert.equal(q.ok, true);
  assert.equal(q.days, 3);
  assert.equal(q.pricePerDay, 200 * 2 + 150);
  assert.equal(q.rent, 1650);
  assert.equal(q.deposit, 3000);
  assert.equal(q.depositMode, 'hold');
  assert.equal(q.chargeNow, 1650); // กันวงเงินทีหลัง ไม่เก็บตอนจอง
  assert.equal(q.deliverIso, '2026-12-06');
  assert.equal(q.returnByIso, '2026-12-16');
  assert.deepEqual(q.productIds, ['M1', 'M2', 'A1']);
});

test('ใบเสนอราคาออนไลน์: PromptPay รวมมัดจำ, ของไม่พอ, รอชำระกันคิว', () => {
  const ctx = { products, rentals: [], pendingRentalIds: {}, todayIso: '2026-11-16', depositPerItem: 500 };
  const pp = S.stpOnlineQuote({ items: [{ cat: 'AED Trainer', qty: 1 }], start: '2026-12-10', end: '2026-12-11', province: 'กรุงเทพมหานคร', method: 'promptpay' }, ctx);
  assert.equal(pp.kind, 'rent_plus_deposit');
  assert.equal(pp.chargeNow, 650);
  const none = S.stpOnlineQuote({ items: [{ cat: 'CPR Man Plus', qty: 3 }], start: '2026-12-10', end: '2026-12-11', province: 'กรุงเทพมหานคร', method: 'card' }, ctx);
  assert.equal(none.ok, false);
  const pendingCtx = { ...ctx, rentals: [{ id: 'WEB-1', status: 'รอชำระ', productIds: ['A1'], startIso: '2026-12-09', dueIso: '2026-12-12', deliverIso: '2026-12-08' }], pendingRentalIds: { 'WEB-1': true } };
  assert.equal(S.stpOnlineQuote({ items: [{ cat: 'AED Trainer', qty: 1 }], start: '2026-12-10', end: '2026-12-11', province: 'กรุงเทพมหานคร', method: 'card' }, pendingCtx).ok, false);
  const expiredCtx = { ...pendingCtx, pendingRentalIds: {} };
  assert.equal(S.stpOnlineQuote({ items: [{ cat: 'AED Trainer', qty: 1 }], start: '2026-12-10', end: '2026-12-11', province: 'กรุงเทพมหานคร', method: 'card' }, expiredCtx).ok, true);
});

test('ใบเสนอราคาออนไลน์: ขีดจำกัด', () => {
  const ctx = { products, rentals: [], pendingRentalIds: {}, todayIso: '2026-11-16', depositPerItem: 0 };
  const tooSoon = S.stpOnlineQuote({ items: [{ cat: 'AED Trainer', qty: 1 }], start: '2026-11-18', end: '2026-11-19', province: 'ภูเก็ต', method: 'card' }, ctx);
  assert.equal(tooSoon.ok, false);
  const tooLong = S.stpOnlineQuote({ items: [{ cat: 'AED Trainer', qty: 1 }], start: '2026-12-01', end: '2027-01-15', province: 'กรุงเทพมหานคร', method: 'card' }, ctx);
  assert.equal(tooLong.ok, false);
  const tooMany = S.stpOnlineQuote({ items: [{ cat: 'AED Trainer', qty: 11 }], start: '2026-12-01', end: '2026-12-02', province: 'กรุงเทพมหานคร', method: 'card' }, ctx);
  assert.equal(tooMany.ok, false);
  const notAllowed = S.stpOnlineQuote({ items: [{ cat: 'AED Trainer', qty: 1 }], start: '2026-12-01', end: '2026-12-02', province: 'กรุงเทพมหานคร', method: 'card' }, { ...ctx, allowedCats: ['CPR Man Plus'] });
  assert.equal(notAllowed.ok, false);
});

test('ตรวจข้อมูลผู้จอง', () => {
  assert.deepEqual(S.stpValidateBookingInput({ name: 'รพ.ตัวอย่าง', phone: '081-234-5678', address: '123 ถนนสุขุมวิท แขวงคลองเตย', province: 'กรุงเทพมหานคร', method: 'card' }), []);
  assert.ok(S.stpValidateBookingInput({ name: 'a', phone: '12', address: '', province: 'x', method: 'cash' }).length >= 5);
});

test('สถานะ session → สมุดบัญชี', () => {
  assert.equal(S.stpLedgerStateFromSession({ status: 'open' }).status, 'pending');
  assert.equal(S.stpLedgerStateFromSession({ status: 'expired' }).status, 'expired');
  const paid = S.stpLedgerStateFromSession({ status: 'complete', payment_status: 'paid', payment_intent: { id: 'pi_1', status: 'succeeded', capture_method: 'automatic', amount_received: 380000, latest_charge: { amount_refunded: 150000, created: 1700000000 } } });
  assert.deepEqual([paid.status, paid.capturedAmount, paid.refundedAmount, paid.paymentIntentId], ['paid', 3800, 1500, 'pi_1']);
  const hold = S.stpLedgerStateFromSession({ status: 'complete', payment_status: 'unpaid', payment_intent: { id: 'pi_2', status: 'requires_capture', capture_method: 'manual', amount_received: 0, latest_charge: { amount_refunded: 0, created: 1 } } });
  assert.equal(hold.status, 'hold');
  assert.equal(S.stpLedgerStateFromSession({ status: 'complete', payment_intent: { id: 'p', status: 'canceled', capture_method: 'manual', amount_received: 0 } }).status, 'released');
  assert.equal(S.stpLedgerStateFromSession({ status: 'complete', payment_intent: { id: 'p', status: 'succeeded', capture_method: 'manual', amount_received: 50000 } }).status, 'captured');
  assert.equal(S.stpLedgerStateFromSession({ status: 'complete', payment_status: 'unpaid', payment_intent: { id: 'p', status: 'processing' } }).status, 'processing');
});

test('ป้ายสถานะการชำระของรายการเช่า', () => {
  assert.equal(S.stpRentalPaymentLabel([]), '');
  assert.equal(S.stpRentalPaymentLabel([{ kind: 'rent', status: 'pending' }]), 'Stripe: รอชำระ');
  assert.equal(S.stpRentalPaymentLabel([{ kind: 'rent', status: 'expired' }, { kind: 'rent', status: 'paid' }, { kind: 'deposit_hold', status: 'hold', amount: 2000 }]), 'Stripe: ชำระแล้ว · กันวงเงินมัดจำ 2000');
  assert.equal(S.stpRentalPaymentLabel([{ kind: 'rent', status: 'paid' }, { kind: 'deposit_hold', status: 'released', amount: 2000 }]), 'Stripe: ชำระแล้ว · ปล่อยวงเงินแล้ว');
  assert.equal(S.stpRentalPaymentLabel([{ kind: 'deposit_hold', status: 'captured', amount: 2000, capturedAmount: 500 }]), 'Stripe: หักมัดจำ 500');
  assert.equal(S.stpRentalPaymentLabel([{ kind: 'rent_plus_deposit', status: 'paid', amount: 3800, depositAmount: 2000 }]), 'Stripe: ชำระแล้ว · รับมัดจำแล้ว 2000');
  assert.equal(S.stpRentalPaymentLabel([{ kind: 'rent_plus_deposit', status: 'paid', amount: 3800, depositAmount: 2000, refundedAmount: 1500, depositDeducted: 500, releasedAt: 'x' }]), 'Stripe: ชำระแล้ว · คืนมัดจำ 1500 · หักมัดจำ 500');
});

test('เตือนวงเงินค้าง ≥ 5 วัน', () => {
  const now = Date.parse('2026-12-10T00:00:00Z');
  const w = S.stpHoldWarnings([
    { kind: 'deposit_hold', status: 'hold', sessionId: 'a', rentalId: 'R1', amount: 1000, paidAt: '2026-12-05T00:00:00Z', createdAt: '2026-12-04T00:00:00Z' },
    { kind: 'deposit_hold', status: 'hold', sessionId: 'b', rentalId: 'R2', amount: 1000, paidAt: '2026-12-08T00:00:00Z', createdAt: '2026-12-08T00:00:00Z' },
    { kind: 'deposit_hold', status: 'released', sessionId: 'c', paidAt: '2026-12-01T00:00:00Z' }
  ], now);
  assert.equal(w.length, 2);
  assert.deepEqual(w.map(x => [x.ageDays, x.warn]), [[5, true], [2, false]]);
  assert.equal(w[0].expiresAt, '2026-12-12T00:00:00.000Z');
});

test('แผนคำสั่ง Ops กับมัดจำ', () => {
  const hold = { kind: 'deposit_hold', status: 'hold', amount: 2000 };
  assert.deepEqual(S.stpDepositActionPlan(hold, 'release', 0), { call: 'cancel' });
  assert.deepEqual(S.stpDepositActionPlan(hold, 'capture', 0), { call: 'cancel' });
  assert.deepEqual(S.stpDepositActionPlan(hold, 'capture', 700), { call: 'capture', amountToCapture: 700 });
  assert.ok(S.stpDepositActionPlan(hold, 'capture', 2500).error);
  assert.ok(S.stpDepositActionPlan({ ...hold, status: 'released' }, 'release', 0).error);
  const ch = { kind: 'rent_plus_deposit', status: 'paid', amount: 3800, depositAmount: 2000, refundedAmount: 0 };
  assert.deepEqual(S.stpDepositActionPlan(ch, 'refund', 0), { call: 'refund', refundAmount: 2000, deducted: 0 });
  assert.deepEqual(S.stpDepositActionPlan(ch, 'refund', 2000), { call: 'none', refundAmount: 0, deducted: 2000 });
  assert.ok(S.stpDepositActionPlan({ ...ch, releasedAt: 'x' }, 'refund', 0).error);
  assert.ok(S.stpDepositActionPlan({ ...ch, refundedAmount: 3000 }, 'refund', 0).error);
  assert.ok(S.stpDepositActionPlan({ kind: 'rent', status: 'paid' }, 'refund', 0).error);
});
