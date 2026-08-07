# Quick Start

## 1. Mo thu muc du an

```bat
cd /d "D:\VIC Live pro"
```

## 2. Cai dependencies

```bat
npm install
```

## 3. Chay kiem tra

```bat
node check-system.js
npm audit --omit=dev
```

## 4. Chay app

```bat
npm start
```

## 5. Tao stream

1. Chon video hoac playlist.
2. Chon nen tang.
3. Nhap RTMP URL va Stream Key.
4. Chon chat luong.
5. Bam start.

## 6. Tao lich phat

1. Tao va chay it nhat mot stream de app luu cau hinh.
2. Mo tab Schedule.
3. Bam Tao lich phat.
4. Chon stream, gio bat dau, lap lai va thoi luong tu dong tat.

## 7. Build installer

```bat
build-windows.bat
```

Installer se duoc tao trong `dist/`.

## 8. Auto Live tu Google Sheet

1. Tao Google Sheet co cac cot: `title`, `date`, `time`, `videoPath`, `duration`.
2. Share Sheet o che do xem bang link.
3. Mo Settings trong app.
4. Dan link vao `Auto Live tu Google Sheet`, hoac dan Apps Script Web App URL.
5. De mac dinh Chrome profile rieng cua app: `%APPDATA%\VICdigi Live Streamer\ChromeProfile`.
6. Bam `Mo Chrome dang nhap`, dang nhap Facebook trong cua so Chrome rieng nay neu chua login.
7. Bam `Quet Page`, chon page can live.
8. Bam `Xem lich Google`, sau do `Dong bo hen gio`.

Mau cot Google Sheet:

```text
title,date,time,videoPath,description,duration,quality,bitrate,fps,pageUrl,liveUrl
MAU 1 - Tieu de live luc 20h30,08/08/2026,20:30,E:\Videos\live-01.mp4,Mo ta live,60,1080p,4000,30,https://www.facebook.com/ten-page-cua-ban,
```

Nen de `date` va `time` dang text: `08/08/2026`, `20:30`.
