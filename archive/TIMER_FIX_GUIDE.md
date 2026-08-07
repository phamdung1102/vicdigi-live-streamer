# 🔧 Hướng dẫn kiểm tra Fix Timer - VICdigi Live Streamer

## 🐛 Vấn đề đã Fix

**Bug**: Timer hẹn giờ tắt chỉ hoạt động ở luồng 1, không hoạt động ở luồng 2, 3.

**Nguyên nhân**:
1. ❌ Form HTML có **2 bộ timer settings trùng lặp**
2. ❌ Form không reset đúng sau khi thêm stream
3. ❌ Thiếu logging để debug

**Giải pháp đã áp dụng**:
1. ✅ Xóa phần timer trùng lặp (`enableAutoStop`, `autoStopHours`, `autoStopMinutes`)
2. ✅ Cải thiện logic reset form
3. ✅ Thêm logging chi tiết để debug

---

## 📝 Files đã sửa

### 1. `src/renderer/pages/index.html`
- ✅ Xóa dòng 468-487 (Timer settings trùng lặp)
- ✅ Giữ lại chỉ 1 bộ timer (dòng 434-458)

### 2. `src/renderer/js/app.js`
- ✅ Thêm logging chi tiết khi submit form (dòng 665-693)
- ✅ Cải thiện form reset (dòng 721-734)
- ✅ Thêm notification với tên stream (dòng 740-747)

### 3. `src/services/streamManager.js`
- ✅ Thêm logging khi setup timer (dòng 77-137)
- ✅ Log chi tiết: thời gian stop, delay, timer type

---

## 🧪 CÁCH KIỂM TRA

### Bước 1: Chạy app
```bash
npm start
```

### Bước 2: Tạo 3 luồng stream với timer

#### **Stream 1**: Timer theo thời lượng (5 phút)
1. Click "Thêm luồng"
2. Nhập thông tin:
   - Tên: `Stream 1 - Timer 5m`
   - Platform: Facebook
   - RTMP URL & Key: (nhập thông tin của bạn)
   - Chọn video
3. **Hẹn giờ tắt**:
   - Chọn radio: `Sau khoảng thời gian`
   - Nhập: `0` giờ, `5` phút
4. Click "Thêm luồng"
5. ✅ **Kiểm tra console**:
   ```
   📝 Timer settings from form: {timerType: 'duration', timerHours: '0', timerMinutes: '5'}
   ⏱️ Timer duration set: 0h 5m = 5 minutes
   🚀 Final stream config: {stopAfterMinutes: 5, hasTimer: true}
   ✅ Timer DURATION set for stream stream_xxx: Will stop after 5 minutes (300000ms)
   ```

#### **Stream 2**: Timer theo giờ cụ thể (ví dụ: 14:30)
1. Click "Thêm luồng" (lần 2)
2. Nhập thông tin:
   - Tên: `Stream 2 - Timer 14:30`
   - Chọn video khác
3. **Hẹn giờ tắt**:
   - Chọn radio: `Vào lúc`
   - Nhập giờ: `14:30` (hoặc giờ nào đó trong tương lai)
4. Click "Thêm luồng"
5. ✅ **Kiểm tra console**:
   ```
   📝 Timer settings from form: {timerType: 'specific', timerTime: '14:30'}
   ⏰ Timer specific time set: 14:30
   🚀 Final stream config: {stopAtTime: '14:30', hasTimer: true}
   ✅ Timer SPECIFIC set for stream stream_yyy: Will stop at 14:30
   ```

#### **Stream 3**: Timer theo thời lượng (10 phút)
1. Click "Thêm luồng" (lần 3)
2. Nhập thông tin:
   - Tên: `Stream 3 - Timer 10m`
3. **Hẹn giờ tắt**:
   - Chọn radio: `Sau khoảng thời gian`
   - Nhập: `0` giờ, `10` phút
4. Click "Thêm luồng"
5. ✅ **Kiểm tra console**:
   ```
   📝 Timer settings from form: {timerType: 'duration', timerHours: '0', timerMinutes: '10'}
   ⏱️ Timer duration set: 0h 10m = 10 minutes
   🚀 Final stream config: {stopAfterMinutes: 10, hasTimer: true}
   ✅ Timer DURATION set for stream stream_zzz: Will stop after 10 minutes (600000ms)
   ```

---

## ✅ TIÊU CHÍ PASS

### 1. **Logging đúng**
- Console hiển thị đầy đủ thông tin timer cho **TẤT CẢ 3 luồng**
- Mỗi stream có log riêng với streamId khác nhau
- `hasTimer: true` cho các stream có timer

### 2. **UI hiển thị đúng**
- Dashboard hiển thị 3 stream cards
- Mỗi card có badge timer:
  - Stream 1: `⏱️ Tự tắt sau: 5m`
  - Stream 2: `⏰ Tự tắt lúc: 14:30`
  - Stream 3: `⏱️ Tự tắt sau: 10m`

### 3. **Countdown hoạt động**
- Mỗi giây, timer countdown giảm dần
- Hiển thị trong stream card: `⏱️ Còn lại: 4m 59s` → `4m 58s` → ...

### 4. **Auto-stop hoạt động**
- Stream 1 tự động dừng sau 5 phút
- Stream 2 tự động dừng vào 14:30
- Stream 3 tự động dừng sau 10 phút
- Console log: `⏰ Auto-stopping stream...`

### 5. **Form reset đúng**
- Sau khi thêm stream 1 → mở modal lại → radio "Không hẹn" được chọn
- Không còn giá trị cũ trong input giờ/phút

---

## 🔍 DEBUG NẾU VẪN LỖI

### Nếu timer không hoạt động ở stream 2, 3:

1. **Mở DevTools** (F12 hoặc Ctrl+Shift+I)
2. Vào tab **Console**
3. Khi thêm stream thứ 2, tìm log:
   ```
   📝 Timer settings from form: {...}
   ```

4. **Kiểm tra**:
   - `timerType` có đúng không? (`'duration'` hoặc `'specific'`)
   - `timerHours` / `timerMinutes` có giá trị không?
   - `hasTimer` có phải `true` không?

5. **Nếu `hasTimer: false`**:
   - Radio button chưa được chọn đúng
   - Hoặc input trống

6. **Nếu `hasTimer: true` nhưng không dừng**:
   - Kiểm tra log `✅ Timer DURATION set...`
   - Xem `stopTimeMs` có đúng không (5 phút = 300000ms)

---

## 📊 LOG MẪU THÀNH CÔNG

```
=== STREAM 1 ===
📝 Timer settings from form: {timerType: 'duration', timerHours: '0', timerMinutes: '5', timerTime: ''}
⏱️ Timer duration set: 0h 5m = 5 minutes
🚀 Final stream config: {name: 'Stream 1 - Timer 5m', stopAfterMinutes: 5, hasTimer: true}
⏱️ Setting up timer for stream stream_1735393200123_abc123: {stopAfterMinutes: 5, stopAtTime: undefined}
✅ Timer DURATION set for stream stream_1735393200123_abc123: Will stop after 5 minutes (300000ms)
   Stop time: 12/28/2025, 9:05:00 PM

=== STREAM 2 ===
📝 Timer settings from form: {timerType: 'specific', timerHours: '', timerMinutes: '', timerTime: '14:30'}
⏰ Timer specific time set: 14:30
🚀 Final stream config: {name: 'Stream 2 - Timer 14:30', stopAtTime: '14:30', hasTimer: true}
⏱️ Setting up timer for stream stream_1735393210456_def456: {stopAfterMinutes: undefined, stopAtTime: '14:30'}
✅ Timer SPECIFIC set for stream stream_1735393210456_def456: Will stop at 14:30
   Stop time: 12/29/2025, 2:30:00 PM, Delay: 62100s

=== STREAM 3 ===
📝 Timer settings from form: {timerType: 'duration', timerHours: '0', timerMinutes: '10', timerTime: ''}
⏱️ Timer duration set: 0h 10m = 10 minutes
🚀 Final stream config: {name: 'Stream 3 - Timer 10m', stopAfterMinutes: 10, hasTimer: true}
⏱️ Setting up timer for stream stream_1735393220789_ghi789: {stopAfterMinutes: 10, stopAtTime: undefined}
✅ Timer DURATION set for stream stream_1735393220789_ghi789: Will stop after 10 minutes (600000ms)
   Stop time: 12/28/2025, 9:10:00 PM
```

---

## 🎯 KẾT QUẢ MONG ĐỢI

✅ **TẤT CẢ 3 luồng** đều có timer hoạt động độc lập
✅ Countdown hiển thị chính xác
✅ Auto-stop đúng thời gian
✅ Form reset sạch sau mỗi lần thêm
✅ Log đầy đủ để debug

---

## 📞 BÁO CÁO KẾT QUẢ

Sau khi test, báo cáo kết quả:
- ✅ Hoạt động hoàn hảo
- ⚠️ Có vấn đề nhỏ (ghi rõ)
- ❌ Vẫn lỗi (attach console log)

---

**Chúc may mắn!** 🚀
