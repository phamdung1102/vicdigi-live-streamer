# 📊 PHÂN TÍCH CHẾ ĐỘ PLAYLIST - VICdigi Live Streamer

**Ngày kiểm tra**: 2025-12-28

---

## ✅ TỔNG QUAN

Chế độ live cả thư mục (playlist mode) **HOẠT ĐỘNG TỐT** nhưng có **3 vấn đề** cần lưu ý.

---

## 🎯 CÁCH HOẠT ĐỘNG

### 1. **Tạo Playlist**
- User chọn thư mục video
- App quét tất cả video trong thư mục
- Lưu danh sách video paths vào playlist config

### 2. **Stream với Playlist**
- Khi tạo stream, chọn "Playlist" thay vì "File video"
- App lấy video đầu tiên hoặc random (tùy mode)
- Khi video kết thúc → auto play video tiếp theo

### 3. **Playlist Modes**
- **Sequential**: Phát tuần tự từ đầu đến cuối
- **Random**: Phát ngẫu nhiên
- **Loop**: Lặp lại video hiện tại mãi mãi

---

## ✅ ĐIỂM MẠNH

### 1. **Playlist Manager tốt** (`playlist-manager.js`)
✅ **Multi-playlist support**: Có thể tạo nhiều playlist
✅ **Persistent storage**: Lưu playlist vào settings
✅ **Auto-skip errors**: Tự động bỏ qua video lỗi
✅ **Hot reload**: Tự động nhận video mới (tính năng chưa implement đầy đủ)
✅ **Video metadata**: Hiển thị size, duration, format

### 2. **Stream Manager xử lý playlist tốt** (`streamManager.js`)
✅ **Auto next video**: Tự động chuyển video khi kết thúc (dòng 694-721)
✅ **Skip error files**: Nếu file lỗi → remove khỏi list và lấy file khác (dòng 685-687)
✅ **Mode support**: Hỗ trợ sequential/random/loop

### 3. **Integration tốt**
✅ Playlist config được truyền đúng từ UI → Main → StreamManager
✅ Event `stream:next-video` được emit khi chuyển video

---

## ⚠️ VẤN ĐỀ PHÁT HIỆN

### ❌ **Bug #1: Loop Mode vô hạn**

**File**: `streamManager.js:663-675`

```javascript
switch (playlist.mode) {
    case 'random':
        const randomIndex = Math.floor(Math.random() * playlist.videos.length);
        videoPath = playlist.videos[randomIndex];
        break;

    case 'sequential':
    default:
        const currentIndex = playlist.currentIndex || 0;
        videoPath = playlist.videos[currentIndex];
        playlist.currentIndex = (currentIndex + 1) % playlist.videos.length;
        break;
}
```

**VẤN ĐỀ**:
- Không có case cho `'loop'` mode
- Loop mode sẽ rơi vào `default` → chạy sequential
- Nếu user chọn "Lặp lại" → video vẫn chạy tuần tự thay vì lặp 1 video

**IMPACT**: ⚠️ Medium - Feature không hoạt động như mong đợi

**FIX**:
```javascript
switch (playlist.mode) {
    case 'random':
        const randomIndex = Math.floor(Math.random() * playlist.videos.length);
        videoPath = playlist.videos[randomIndex];
        break;

    case 'loop':
        // Keep current index, don't increment
        const loopIndex = playlist.currentIndex || 0;
        videoPath = playlist.videos[loopIndex];
        break;

    case 'sequential':
    default:
        const currentIndex = playlist.currentIndex || 0;
        videoPath = playlist.videos[currentIndex];
        playlist.currentIndex = (currentIndex + 1) % playlist.videos.length;
        break;
}
```

---

### ⚠️ **Bug #2: Playlist videos bị mutate**

**File**: `streamManager.js:685-687`

```javascript
if (playlist.skipErrors && playlist.videos.length > 1) {
    playlist.videos = playlist.videos.filter(v => v !== videoPath);
    return this.getPlaylistInput(playlist);
}
```

**VẤN ĐỀ**:
- Khi video lỗi, code **xóa video khỏi mảng gốc**
- Nếu có 2 streams dùng cùng 1 playlist → stream 1 xóa video → stream 2 bị ảnh hưởng
- Playlist bị thay đổi vĩnh viễn, không restore được

**IMPACT**: ⚠️ High - Data integrity issue

**FIX**:
```javascript
if (playlist.skipErrors && playlist.videos.length > 1) {
    // Create new array instead of mutating
    const newVideos = playlist.videos.filter(v => v !== videoPath);

    // Update playlist with new array
    const newPlaylist = {
        ...playlist,
        videos: newVideos
    };

    return this.getPlaylistInput(newPlaylist);
}
```

HOẶC: Lưu list videos lỗi riêng, không xóa khỏi mảng gốc.

---

### ⚠️ **Bug #3: Hot Reload không hoạt động**

**File**: `playlist-manager.js:575-577`

```javascript
startWatching() {
    // Implementation remains the same  ← COMMENT ONLY, NO CODE
}
```

**VẤN ĐỀ**:
- Checkbox "Tự động nhận video mới" có trong UI
- Nhưng function `startWatching()` **CHƯA ĐƯỢC IMPLEMENT**
- User bật checkbox → không có gì xảy ra

**IMPACT**: ⚠️ Low - Feature chưa hoàn thiện

**FIX**: Cần implement file watcher:
```javascript
startWatching() {
    if (this.watchInterval) return; // Already watching

    this.watchInterval = setInterval(async () => {
        const playlist = this.getCurrentPlaylist();
        if (playlist) {
            await this.refreshPlaylist(playlist.id);
        }
    }, 30000); // Check every 30 seconds
}
```

---

### ⚠️ **Vấn đề #4: Playlist currentIndex không sync giữa nhiều streams**

**File**: `streamManager.js:671-673`

```javascript
const currentIndex = playlist.currentIndex || 0;
videoPath = playlist.videos[currentIndex];
playlist.currentIndex = (currentIndex + 1) % playlist.videos.length;
```

**VẤN ĐỀ**:
- Nếu có 2 streams dùng cùng playlist object
- Stream 1 tăng `currentIndex` → Stream 2 bắt đầu từ index khác
- **Không phải bug** nếu mỗi stream có playlist copy riêng
- **LÀ BUG** nếu share cùng object

**KIỂM TRA**: Cần xem `getPlaylistForStream()` có clone object không?

**File**: `playlist-manager.js:532-543`

```javascript
getPlaylistForStream(playlistId = null) {
    const playlist = playlistId ? this.playlists.get(playlistId) : this.getCurrentPlaylist();

    if (!playlist || !playlist.videos) return null;

    return {
        videos: playlist.videos.map(v => v.path),  // ✅ NEW ARRAY
        mode: playlist.mode || this.playbackMode,
        currentIndex: this.currentIndex,          // ❌ SHARED currentIndex
        skipErrors: playlist.skipErrors !== false
    };
}
```

**KẾT LUẬN**:
- `videos` được clone → ✅ OK
- `currentIndex` dùng shared value `this.currentIndex` → ⚠️ POTENTIAL BUG

**IMPACT**: ⚠️ Medium - Nhiều streams cùng playlist sẽ conflict

**FIX**:
```javascript
getPlaylistForStream(playlistId = null) {
    const playlist = playlistId ? this.playlists.get(playlistId) : this.getCurrentPlaylist();

    if (!playlist || !playlist.videos) return null;

    return {
        videos: playlist.videos.map(v => v.path),
        mode: playlist.mode || this.playbackMode,
        currentIndex: 0,  // ✅ Always start from 0 for each stream
        skipErrors: playlist.skipErrors !== false
    };
}
```

---

## 🧪 CÁCH TEST PLAYLIST MODE

### Test 1: Sequential Mode

1. Tạo playlist với 3 video (A.mp4, B.mp4, C.mp4)
2. Chọn mode: **Tuần tự**
3. Tạo stream với playlist này
4. **Kỳ vọng**: Phát A → B → C → A → B → C (lặp lại)
5. **Kiểm tra**: Xem console log `📹 Playing next video in playlist`

### Test 2: Random Mode

1. Tạo playlist với 5 video
2. Chọn mode: **Ngẫu nhiên**
3. Tạo stream
4. **Kỳ vọng**: Video phát ngẫu nhiên, không theo thứ tự
5. **Kiểm tra**: Log console, mỗi lần khác nhau

### Test 3: Loop Mode ❌ (BUG)

1. Tạo playlist với 3 video
2. Chọn mode: **Lặp lại**
3. Tạo stream
4. **Kỳ vọng**: Video đầu tiên lặp lại mãi mãi
5. **THỰC TẾ**: Sẽ chạy tuần tự A → B → C (do bug #1)

### Test 4: Skip Error Files

1. Tạo playlist với 3 video, trong đó 1 file bị corrupt
2. Bật "Tự động bỏ qua file lỗi"
3. Tạo stream
4. **Kỳ vọng**: File lỗi bị skip, chuyển sang file khác
5. **Kiểm tra**: Console log `Video file not accessible`

### Test 5: Multiple Streams cùng Playlist ⚠️ (CONFLICT)

1. Tạo 1 playlist với 5 video
2. Tạo stream 1 với playlist này
3. Tạo stream 2 với cùng playlist
4. **HIỆN TẠI**: Stream 2 có thể bắt đầu từ video khác do shared `currentIndex`
5. **NÊN**: Mỗi stream bắt đầu từ video đầu tiên

---

## 📊 ĐÁNH GIÁ TỔNG QUAN

| Tiêu chí | Điểm (0-10) | Nhận xét |
|----------|-------------|----------|
| **Core Functionality** | 8/10 | Sequential & Random hoạt động tốt |
| **Code Quality** | 7/10 | Cấu trúc tốt, có vài bug nhỏ |
| **Error Handling** | 7/10 | Skip errors OK, nhưng mutate playlist |
| **UX** | 6/10 | UI đẹp, nhưng Loop mode không hoạt động |
| **Edge Cases** | 5/10 | Multi-stream conflict, hot reload chưa có |

**Điểm tổng**: **6.6/10** ⭐

---

## ✅ KHUYẾN NGHỊ

### Must Fix (Ưu tiên cao):
1. ✅ **Fix Loop Mode** - Thêm case cho loop trong switch
2. ✅ **Fix playlist mutation** - Không xóa video khỏi mảng gốc
3. ✅ **Fix currentIndex conflict** - Mỗi stream bắt đầu từ 0

### Should Fix (Ưu tiên vừa):
4. ⚠️ **Implement Hot Reload** - File watcher để tự động cập nhật playlist
5. ⚠️ **Add logging** - Log khi switch video, khi skip error

### Nice to Have:
6. 📝 **UI improvement** - Highlight video đang phát trong playlist
7. 📝 **Playlist preview** - Xem trước video trước khi tạo stream
8. 📝 **Shuffle mode** - Ngẫu nhiên nhưng không lặp lại cho đến hết playlist

---

## 🔍 CONSOLE LOG MẪU (Playlist Mode)

### Khi stream với playlist bắt đầu:
```
Starting stream with config: {
  name: 'Stream Playlist Test',
  platform: 'youtube',
  playlist: {
    videos: ['D:\\Videos\\A.mp4', 'D:\\Videos\\B.mp4', 'D:\\Videos\\C.mp4'],
    mode: 'sequential',
    currentIndex: 0,
    skipErrors: true
  }
}

Input source: D:\Videos\A.mp4
Stream started successfully
```

### Khi chuyển video:
```
Stream stream_xxx ended
📹 Playing next video in playlist for stream stream_xxx
Next video: D:\Videos\B.mp4
```

### Khi skip error file:
```
Video file not accessible: D:\Videos\B.mp4
Skipping to next video...
Next video: D:\Videos\C.mp4
```

---

## 🎯 KẾT LUẬN

**Playlist mode CƠ BẢN HOẠT ĐỘNG TỐT** cho Sequential và Random mode.

**CẦN FIX** trước khi release:
- ❌ Loop mode không hoạt động
- ⚠️ Playlist bị mutate khi skip errors
- ⚠️ Multi-stream conflict khi dùng cùng playlist

**Bạn có muốn tôi fix các bugs này không?**
