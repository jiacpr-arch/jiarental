# JIARAKSA Rental System v4 — Project Context

## ภาพรวม
ระบบเช่า-ยืมอุปกรณ์ฝึกสอน CPR/AED ของบริษัท **โรจน์รุ่ง ธุรกิจ จำกัด** (เจี๋ยรักษา)
- **Single HTML file** (`index.html`) ~5,700 บรรทัด
- **Vanilla JavaScript** ไม่ใช้ framework
- **CSS มือเขียนล้วน** (ไม่มี Tailwind) + inline styles ในบางจุด + ฟอนต์ Sarabun (Google Fonts)
- **Google Sheets backend** ผ่าน Google Apps Script
- **ภาษาไทย** ทั้งหมด — UI, ข้อความ, toast, label

## โครงสร้างไฟล์
```
jiarental/
├── index.html                  # ไฟล์หลัก (single-page app, ต้อง login เซลล์/Ops)
├── availability.html           # ปฏิทินว่างสาธารณะ ไม่ต้อง login ลูกค้าดูวันว่างได้เอง
├── apps_script_v4.js           # Apps Script backend หลัก (paste in Google Apps Script)
├── apps_script_additions.js    # ส่วนเพิ่ม: แจ้งเตือน LINE + API ปฏิทินสาธารณะ (วางเพิ่มใน Apps Script project เดิม — ดูคำแนะนำในไฟล์)
├── CLAUDE.md                   # ไฟล์นี้
└── README.md                   # (optional)
```

## Hosting & Deployment
- **GitHub Pages**: `jiacpr-arch.github.io/jiarental/`
- **Repo**: `jiacpr-arch/jiarental`
- **Deploy**: ลากไฟล์ `index.html` ไป Add file → Upload files (ห้าม edit ใน browser จะตัดโค้ด)
- **HTTPS จำเป็น** สำหรับกล้องสแกน QR

## Google Apps Script
- ใช้ไฟล์ `apps_script_v4.js`
- เมื่อแก้ Apps Script ต้อง **Deploy → New version** ทุกครั้ง
- ทุก API call ใช้ `gsAPI()` function

## บทบาทผู้ใช้
| บทบาท | สิทธิ์ |
|-------|--------|
| **เซลล์ (Sales)** | สร้างจอง, แก้ไข, ดูราคา/มัดจำ/ยอดขาย, ใบยืนยัน; เห็นเฉพาะข้อมูลของตัวเอง |
| **คนทำหน้างาน (Ops)** | ทุกอย่างของ Sales + ยืนยันจอง/ส่ง, รับคืน, สแกน QR, คอมมิชชั่น |

## สถานะสินค้า (9 แบบ)
| สถานะ | Badge | หมายเหตุ |
|-------|-------|----------|
| ว่าง | badge-green | พร้อมให้เช่า |
| ถูกเช่า | badge-blue | กำลังถูกเช่า (คลิก badge ดูผู้เช่า) |
| จอง | badge-orange | จองแล้ว รอจัดส่ง (คลิกได้) |
| ซ่อม | badge-gray | อยู่ระหว่างซ่อม |
| ไม่พร้อมใช้งาน | badge-slate | ต้องกรอกหมายเหตุ |
| ออกสอน | badge-slate | ต้องกรอก หมายเหตุ + วันที่ไป/กลับ |
| ออกบูธ | badge-slate | ต้องกรอก หมายเหตุ + วันที่ไป/กลับ |
| ทดแทน | badge-purple | ต้องกรอกหมายเหตุ |

## เกณฑ์เผื่อวันขนส่งตามจังหวัด
| พื้นที่ | วัน | จังหวัด |
|---------|-----|---------|
| กรุงเทพ+ปริมณฑล | **0** | กทม, นนทบุรี, ปทุมธานี, สมุทรปราการ, นครปฐม, สมุทรสาคร, สมุทรสงคราม |
| ภาคใต้ | **4** | 14 จังหวัดภาคใต้ |
| อื่นๆ ทั้งหมด | **3** | ภาคเหนือ, อีสาน, ภาคกลาง, ตะวันออก ฯลฯ |

**สูตรคำนวณ:**
- วันส่งของ = **วันเช่า - buffer - 1** (ไม่นับวันเช่า)
- ของถึงออฟฟิศ = **กำหนดคืน + buffer**

## 6 หน้าหลัก + เมนู
1. **Dashboard** — KPI สินค้าว่าง/เช่า/จอง, ยอดขาย, กราฟ
2. **สินค้าทั้งหมด** — ตาราง + ปฏิทิน Gantt, badge แสดงวันเช่าใต้สถานะ
3. **บันทึกเช่า-ยืม** — ตารางรายการเช่า เรียงตามวันส่งล่าสุด, sortable columns
4. **ลูกค้า** — คอลัมน์ จังหวัด/ที่อยู่/เซลล์, ดูประวัติ
5. **ปฏิทิน** — รวมกำหนดคืน+คืนจริงเป็นช่องเดียว
6. **แจ้งเตือน** — ใกล้กำหนดคืน + เกินกำหนด + ซ่อม + ไม่พร้อม + ยืมไม่กำหนด

เมนูเพิ่ม:
- **สรุปเงินรายเดือน** — คอมมิชชั่น 5% + **Export PDF**
- **QR Code สินค้า**
- **เพิ่มสินค้า**

## ฟีเจอร์สำคัญ

### โหมดการเช่า (6 แบบ)
- รายวัน / รายสัปดาห์ / รายเดือน / รายปี / 2ปี / 4ปี

### สร้างจอง — 2 แท็บ
1. **🎯 เลือกตามชนิด+จำนวน (default)** — ไม่โชว์ชื่อหุ่น
   - **CPR Man Plus / Baby Plus** → toggle "รวมมอนิเตอร์"
     - ☑ รวม → ฿500/วัน, ชื่อในใบจอง: "ตัวX + มอนิเตอร์"
     - ☐ ไม่รวม → ฿200/วัน
   - ป้องกันเลือกชนิดซ้ำ
2. **📋 เลือกสินค้าเอง** — เห็นชื่อหุ่นทุกตัว

### Auto Features ตอนสร้างจอง
- เลือกผู้เช่า → แสดงข้อมูล (เบอร์, จังหวัด, ที่อยู่จัดส่ง, ที่อยู่ใบประกัน)
- ดึงจังหวัด → กรอก "เผื่อวันขนส่ง" อัตโนมัติ
- คำนวณวันส่งของอัตโนมัติ (วันเช่า - buffer - 1)
- เช็คสินค้าว่างจาก **ช่วงเวลา** (สินค้าตัวเดียวจองหลายช่วงได้)

### ยืนยันจอง (Auto-detect Category)
- เซลล์จอง "CPR Man ×2" → Ops สแกน "M(พี่ปู)" → ระบบ assign ตาม category
- ปุ่ม "เปลี่ยน" สลับสินค้าได้
- ผู้จ่ายเงิน "ลูกค้ามารับเอง" → ซ่อนช่องค่าส่ง
- จัดส่งโดย: ลาล่ามูฟ / เคอรี่ / ลูกค้ามารับเอง / นำไปส่งเอง (เฝ้า)

### สำคัญ
สินค้าไม่ถูกล็อคเป็น "จอง" ตอนสร้างใบจอง — ล็อคเป็น "ถูกเช่า" ตอน Ops ยืนยันส่งเท่านั้น

### ที่อยู่ลูกค้า (2 แบบ)
- **ที่อยู่จัดส่ง** = ใช้ในใบจอง/ใบคืน
- **ที่อยู่ใบประกัน** = ใช้ในใบรับเงินค่าประกัน
- checkbox "เหมือนกัน" — ติ๊กไว้ default

### Rental ID Format
- `RN-202506-0063-A3F` (มี random 3 ตัวกัน ID ชน)
- VIP: `VIP-202506-0064-B2K`

### ใบยืนยัน (3 แบบ)
1. **📄 ใบจอง** — ที่อยู่จัดส่ง + ของถึงออฟฟิศ (คาดการณ์)
2. **📋 ใบคืน** — 4 ส่วน + สรุปค่าใช้จ่าย
3. **🧾 ใบประกัน** — ที่อยู่ใบประกัน (fallback ที่อยู่จัดส่ง)

### หมายเหตุพิเศษ — แสดงเด่น
- ตัวหนา 16px สีแดง พื้นหลังชมพู กรอบแดง
- หมายเหตุสถานะในตารางสินค้าตัวหนาแดง พร้อมไอคอน ⚠

### คอมมิชชั่น
- 5% ของค่าเช่า ต่อเที่ยวส่ง + รับ
- VIP/ยืมด่วน ไม่คิดคอมฯ
- **Export PDF** สรุปรายเดือน + แยกคน + รายละเอียดทุกรายการ

### แจ้งเตือน
- 🆕 จองใหม่ รอ Ops ยืนยันส่ง — การ์ดแรกในหน้าแจ้งเตือน (เฉพาะ Ops), มี tag "ใหม่" ถ้าเพิ่งเข้ามาระหว่าง auto-refresh
- ⏰ ใกล้ถึงกำหนดคืน (3 วัน) — สีตามความเร่งด่วน
- เกินกำหนด — auto-detect
- Badge ตัวเลขที่ sidebar (รวมจองใหม่ + ใกล้คืน + เกินกำหนด สำหรับ Ops)
- ฝั่งเซลล์: การ์ด "สถานะการจองของฉัน" ใน Dashboard (เซลล์เข้าหน้าแจ้งเตือนไม่ได้) แสดงรายการที่รอ Ops ยืนยัน + ที่เพิ่งยืนยันส่งใน 7 วันล่าสุด
- **Auto-refresh**: ดึงข้อมูลจาก Sheets ทุก 90 วินาที (เงียบ ไม่มี toast โหลด) + refresh ทันทีเมื่อสลับกลับมาที่แท็บ ข้ามการ refresh ถ้ามี modal เปิดอยู่หรือกำลังบันทึกข้อมูล
- **LINE แจ้งเตือนกลุ่ม Ops**: ส่งข้อความเข้า LINE OA เมื่อมีจองใหม่ / ยืนยันส่งแล้ว / ยกเลิกจอง (ต้องตั้งค่าตาม `apps_script_additions.js` ก่อนถึงจะทำงาน — ถ้ายังไม่ตั้งค่า ระบบหลักยังใช้งานได้ปกติ แค่ไม่มีข้อความเข้า LINE)

### ปฏิทินสาธารณะ (`availability.html`)
- หน้าแยกต่างหาก ไม่ต้อง login ให้ลูกค้าดูวันว่างอุปกรณ์เองได้ก่อนติดต่อจอง
- แสดงเฉพาะ ชนิดอุปกรณ์ + จำนวนว่าง/ทั้งหมด รายวัน — **ไม่มีชื่อลูกค้า ราคา หรือเลขที่จอง**
- อัปเดตทุก 1 นาที, ข้อมูลมาจาก `getPublicAvailability` action ใน `apps_script_additions.js`
- เป็นหน้า read-only ไม่มีปุ่มจองออนไลน์ — ลูกค้าต้องติดต่อเจ้าหน้าที่เพื่อจองจริง

### Data Isolation (เซลล์)
- เห็นเฉพาะรายการ/ลูกค้า/ปฏิทิน/ยอดขาย ของตัวเอง

## Google Sheets Schema
```
'สินค้า':      [id, cat, name, desc, unit, price, status, statusNote]
'ลูกค้า':      [id, name, phone, address, billingAddress, province, sales, rentCount, total]
'รายการเช่า':  [id, start, due, deliverDate, returnDate, productIds, productNames,
                totalPricePerDay, days, total, deposit, paymentStatus, customer, sales,
                sender, deliveryShippingCost, deliveryPayer, deliveryBy,
                receiver, shippingCost, payer, status,
                senderCommission, receiverCommission, confirmedDate,
                isVIP, vipReason, noDueDate, rentalMode,
                returnBy, bufferDays, returnCondition, returnDamageNote, returnNote, note,
                installments, monthlyAmount]
'พนักงาน':    [name, role]
'ตัวนับ':     [key, value]
```

## ชื่อบริษัท
- ใช้ **"บริษัท โรจน์รุ่ง ธุรกิจ จำกัด"** ทุกจุด
- Brand: **JIARAKSA**

## สิ่งที่ต้องระวังเวลาแก้ไข
1. **ไฟล์เดียว** — ทุกอย่างอยู่ใน `index.html`
2. **ภาษาไทย** — รักษาไว้เสมอ
3. **โครงสร้างเดิม** — อย่าเปลี่ยน naming
4. **Google Sheets** — เก็บข้อมูลหลัก
5. **html5-qrcode CDN**: `https://unpkg.com/html5-qrcode@2.3.8`
6. **HTTPS required** — กล้องสแกน
7. **Apps Script Deploy** — แก้ทุกครั้งต้อง New version

## CSS Variables
```css
--primary: #2563eb    --success: #059669
--danger: #dc2626     --warning: #f59e0b
--vip: #7c3aed        --text: #1e293b
--muted: #64748b      --border: #e2e8f0
```

## Functions สำคัญ
- `gsAPI(params)` — เรียก Apps Script
- `getBufferDays(province)` — คำนวณเผื่อวันขนส่ง
- `isProductAvailableForDates(p, deliverDate, startDate, endDate, excludeIds)`
- `checkOverdue()` — auto-detect เกินกำหนด
- `showReceipt/ReturnReceipt/GuaranteeReceipt(id)`
- `autoSelectSmartProducts()` — smart select
- `onSmartCatChange(row)` — handle toggle มอนิเตอร์
- `exportCommissionPDF()` — Export PDF สรุปเงิน
- `refreshFromSheets()` — auto-refresh เงียบทุก 90 วิ + แจ้งเตือนถ้ามีจองใหม่/สถานะเปลี่ยน (`index.html`)
- `gsNotifyLine(event, r)` — ยิงแจ้งเตือน LINE กลุ่ม Ops แบบ fire-and-forget (`index.html`)
- `notifyLine_(event, data)` / `getPublicAvailability_()` — ฝั่ง Apps Script (`apps_script_additions.js`)
