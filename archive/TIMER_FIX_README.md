# 🔧 FIX: Lỗi Timer Đa Luồng - Multi-Stream Timer Fix

## 🐛 Vấn đề gặp phải

Khi live nhiều luồng cùng lúc với timer hẹn giờ tắt:
- ✅ Luồng 1 hẹn giờ hoạt động OK
- ❌ Các luồng 2, 3, 4... hẹn giờ KHÔNG chạy hoặc bị conflict

## 🔍 Nguyên nhân

1. **Timer References bị mất**: Timers được lưu trong `streamInfo` object, dễ bị overwrite hoặc lost reference
2. **Clear Timer không đúng**: Khi restart stream, timers không được clear và setup lại đúng cách
3. **Map quản lý không độc lập**: Thiếu cơ chế quản lý riêng biệt cho từng loại timer

## ✅ Giải pháp

### 1. Tách riêng Maps để quản lý timers

```javascript
class StreamManager extends EventEmitter {
    constructor(database) {
        super();
        this.activeStreams = new Map();
        
        // ✨ NEW: Tách riêng Map để quản lý timers
        this.stopTimers = new Map();           // Quản lý setTimeout để tắt stream
        this.countdownIntervals = new Map();   // Quản lý setInterval để đếm ngược
        
        this.streamHealthChecks = new Map();
    }
}
```

### 2. Hàm riêng để setup timer theo duration

```javascript
setupDurationTimer(streamId, minutes) {
    const streamInfo = this.activeStreams.get(streamId);
    if (!streamInfo) return;

    const stopTimeMs = minutes * 60 * 1000;
    const stopTime = Date.now() + stopTimeMs;
    
    // Set timer info
    streamInfo.timerInfo = {
        type: 'duration',
        stopTime: stopTime,
        duration: minutes,
        originalMinutes: minutes
    };

    // ✨ Clear existing timer nếu có (tránh duplicate)
    this.clearStreamTimers(streamId);

    // Set new timer
    const timer = setTimeout(() => {
        console.log(`⏰ Auto-stopping stream ${streamId} after ${minutes} minutes`);
        this.stopStream(streamId);
    }, stopTimeMs);

    // ✨ Store timer reference trong Map riêng
    this.stopTimers.set(streamId, timer);
    
    // Setup countdown update interval
    const interval = setInterval(() => {
        this.updateTimerCountdown(streamId);
    }, 1000);

    // ✨ Store interval reference trong Map riêng
    this.countdownIntervals.set(streamId, interval);
    
    console.log(`✅ [${streamId}] Timer set: Stream will stop after ${minutes} minutes`);
}
```

### 3. Hàm riêng để clear tất cả timers

```javascript
clearStreamTimers(streamId) {
    // Clear stop timer
    const timer = this.stopTimers.get(streamId);
    if (timer) {
        clearTimeout(timer);
        this.stopTimers.delete(streamId);
        console.log(`🧹 [${streamId}] Stop timer cleared`);
    }

    // Clear countdown interval
    const interval = this.countdownIntervals.get(streamId);
    if (interval) {
        clearInterval(interval);
        this.countdownIntervals.delete(streamId);
        console.log(`🧹 [${streamId}] Countdown interval cleared`);
    }
}
```

### 4. Cải thiện scheduleRestart - KHÔNG clear timers khi restart

```javascript
async scheduleRestart(streamId) {
    // ... existing code ...
    
    setTimeout(async () => {
        if (this.activeStreams.has(streamId)) {
            try {
                // Kill old command
                if (streamInfo.command) {
                    streamInfo.command.kill();
                }

                // ✨ IMPORTANT: KHÔNG clear timers khi restart
                // Timer sẽ tiếp tục chạy từ lúc start ban đầu
                // Điều này đảm bảo stream vẫn tắt đúng giờ dù có restart

                // Create new command
                const newCommand = this.createOptimizedFFmpegCommand(...);
                
                // ... rest of code ...
            }
        }
    }, delay);
}
```

### 5. Cải thiện stopAllStreams

```javascript
async stopAllStreams() {
    const promises = [];
    
    for (const streamId of this.activeStreams.keys()) {
        promises.push(this.stopStream(streamId));
    }

    await Promise.all(promises);
    
    // ✨ Double-check to clear all timers
    this.stopTimers.clear();
    this.countdownIntervals.clear();
    
    console.log('✅ All streams stopped');
}
```

## 📋 Cách sử dụng

### Bước 1: Backup file cũ

```bash
# Rename file cũ để backup
move "D:\VICdigi Live\src\services\streamManager.js" "D:\VICdigi Live\src\services\streamManager-OLD.js"
```

### Bước 2: Sử dụng file mới

```bash
# Rename file fix thành tên chính thức
move "D:\VICdigi Live\src\services\streamManager-FIXED.js" "D:\VICdigi Live\src\services\streamManager.js"
```

### Bước 3: Restart app

```bash
# Stop app nếu đang chạy
# Restart lại app
npm start
```

## 🧪 Test Case

### Test 1: Multiple Streams với Duration Timer
```javascript
// Stream 1: Tắt sau 5 phút
startStream({
    name: "Stream 1",
    platform: "facebook",
    stopAfterMinutes: 5,
    ...
});

// Stream 2: Tắt sau 10 phút
startStream({
    name: "Stream 2", 
    platform: "youtube",
    stopAfterMinutes: 10,
    ...
});

// Stream 3: Tắt sau 15 phút
startStream({
    name: "Stream 3",
    platform: "facebook",
    stopAfterMinutes: 15,
    ...
});

// ✅ Expected: Tất cả 3 streams sẽ tắt đúng giờ đã hẹn
```

### Test 2: Multiple Streams với Specific Time Timer
```javascript
// Stream 1: Tắt lúc 14:00
startStream({
    name: "Stream 1",
    platform: "facebook",
    stopAtTime: "14:00",
    ...
});

// Stream 2: Tắt lúc 15:00
startStream({
    name: "Stream 2",
    platform: "youtube",
    stopAtTime: "15:00",
    ...
});

// ✅ Expected: Cả 2 streams sẽ tắt đúng giờ
```

### Test 3: Stream Restart với Timer
```javascript
// Stream với timer 30 phút
startStream({
    name: "Test Stream",
    stopAfterMinutes: 30,
    autoRestart: true,  // Tự động restart khi có lỗi
    ...
});

// Giả lập lỗi mạng sau 10 phút -> Stream auto restart
// ✅ Expected: Timer vẫn tiếp tục, stream vẫn tắt sau 30 phút kể từ lúc start đầu tiên
```

## 🎯 Điểm cải thiện chính

| Trước | Sau |
|-------|-----|
| ❌ Timers lưu trong streamInfo → dễ bị mất | ✅ Timers lưu trong Map riêng → độc lập |
| ❌ Clear timer không đầy đủ | ✅ Hàm clearStreamTimers() chuyên dụng |
| ❌ Restart stream clear timer → mất hẹn giờ | ✅ Restart KHÔNG clear timer → giữ nguyên hẹn giờ |
| ❌ Không log chi tiết | ✅ Log rõ ràng với streamId |
| ❌ Khó debug khi nhiều stream | ✅ Dễ dàng trace từng stream |

## 📊 Monitoring

Sau khi áp dụng fix, bạn sẽ thấy log như sau:

```
✅ [stream_1756283121931_ohtjth7op] Timer set: Stream will stop after 5 minutes
✅ [stream_1756283276382_srq78wfyw] Timer set: Stream will stop after 10 minutes
✅ [stream_1756283462033_iq3rje6m2] Timer set: Stream will stop after 15 minutes

🧹 [stream_1756283121931_ohtjth7op] Stop timer cleared
🧹 [stream_1756283121931_ohtjth7op] Countdown interval cleared
⏰ Auto-stopping stream stream_1756283121931_ohtjth7op after 5 minutes
✅ Stream stream_1756283121931_ohtjth7op stopped successfully

⏰ Auto-stopping stream stream_1756283276382_srq78wfyw after 10 minutes
✅ Stream stream_1756283276382_srq78wfyw stopped successfully

⏰ Auto-stopping stream stream_1756283462033_iq3rje6m2 after 15 minutes
✅ Stream stream_1756283462033_iq3rje6m2 stopped successfully
```

## 🐛 Debug Tips

Nếu vẫn gặp vấn đề:

1. **Check console logs** - Xem có thông báo timer set không
2. **Check Maps size** - In ra `this.stopTimers.size` và `this.countdownIntervals.size`
3. **Check timer info** - In ra `streamInfo.timerInfo` của từng stream
4. **Test từng stream riêng** - Start 1 stream, đợi tắt xong, mới start stream tiếp theo

## 📞 Support

Nếu cần hỗ trợ thêm, hãy cung cấp:
- Console logs khi start streams
- Số lượng streams đang chạy
- Timer config của từng stream
- Thời gian streams bắt đầu và kết thúc

---
**Updated:** 2024-12-27  
**Version:** 1.1.0-timer-fix  
**Author:** VICdigi Team
