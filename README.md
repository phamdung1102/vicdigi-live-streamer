# VICdigi Live Streamer

Ung dung Electron de livestream video/playlist len Facebook, YouTube, TikTok hoac RTMP tuy chinh bang FFmpeg.

## Tinh nang chinh

- Stream mot video hoac playlist.
- Ho tro nhieu nen tang RTMP.
- Hen gio tu dong dung stream.
- Tao, sua, bat/tat va xoa lich phat.
- Theo doi FPS, bitrate, health va thoi gian chay.
- Luu lich su stream local.
- Xuat/nhap cau hinh stream khong kem stream key.
- Stream key duoc bao ve trong database local khi app khoi dong.
- Auto Live co the doc lich tu Google Sheet/CSV, mo Chrome da dang nhap Facebook, quet RTMP URL/Stream Key va bat dau live.

## Yeu cau

- Windows 10/11 64-bit.
- Node.js LTS.
- Ket noi Internet on dinh.
- FFmpeg va FFprobe nam trong thu muc `ffmpeg/`.

## Cai dat

```bat
cd /d "D:\VIC Live pro"
npm install
```

## Chay app

```bat
npm start
```

## Kiem tra he thong

```bat
node check-system.js
npm audit --omit=dev
```

## Build

Build thu muc unpacked:

```bat
npm run dist -- --dir
```

Build installer `.exe`:

```bat
npm run dist
```

Hoac chay:

```bat
build-windows.bat
```

Ket qua build nam trong `dist/`.

## Auto Update

App da co auto-update qua `electron-updater`. Xem `AUTO_UPDATE.md` de biet cach upload `latest.yml`, installer va blockmap len server update.

## Auto Live tu Google Sheet

Trong tab Settings, cau hinh muc `Auto Live tu Google Sheet`.

Google Sheet nen share o che do `Anyone with the link can view` hoac dung link CSV/published CSV. App tu chuyen link Google Sheets sang CSV. Neu muon dung Google Apps Script Web App tra JSON, xem `GOOGLE_APPS_SCRIPT.md`.

Cac cot ho tro:

```text
title        Bat buoc. Tieu de live.
date         Ngay dang, uu tien dd/mm/yyyy.
time         Gio dang, vi du 20:30.
videoPath    Duong dan video tren may. Neu bo trong, app dung video mac dinh trong Settings.
description  Mo ta live.
duration     So phut tu dong tat.
quality      720p, 1080p, 480p, 360p.
bitrate      Kbps.
fps          30 hoac 60.
liveUrl      Link Facebook Live Producer neu muon override mac dinh.
```

Chrome automation dung Chrome profile da dang nhap san. App khong luu mat khau Facebook. Neu Facebook yeu cau 2FA, CAPTCHA hoac checkpoint, Chrome se mo ra de thao tac tay, sau do app tiep tuc quet key.

Trong Settings co cac nut:

```text
Mo Chrome dang nhap  Mo Chrome dung profile da cau hinh de login Facebook.
Quet Page           Quet cac Facebook Page trong profile dang login de chon page.
Xem lich Google     Doc thu Google Sheet/Apps Script.
Dong bo hen gio     Tao job tu cac dong lich sap toi.
```

## Bao mat stream key

- Stream key khong duoc tra ve renderer khi hien thi danh sach stream da luu.
- Stream key bi mask trong log RTMP.
- Stream key cu trong `config/database.json` se duoc migrate sang dang protected khi app khoi dong.
- Neu da chia se thu muc du an hoac file database, hay tao lai stream key tren nen tang livestream.

## Cau truc chinh

```text
src/main/          Main process va IPC
src/renderer/      Giao dien
src/services/      StreamManager va ScheduleService
src/database/      JSON database service
ffmpeg/            ffmpeg.exe va ffprobe.exe
config/            Du lieu local khi chay source
archive/           File backup/tai lieu cu da tach khoi duong chay chinh
```

Khi chay ban da cai dat, database duoc luu trong thu muc userData cua Electron thay vi thu muc cai dat.
