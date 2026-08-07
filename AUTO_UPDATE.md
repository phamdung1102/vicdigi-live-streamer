# Auto Update

App dung `electron-updater` voi provider `generic`, tro toi GitHub Releases:

```text
https://github.com/phamdung1102/vicdigi-live-streamer/releases/latest/download/
```

## Cach phat hanh ban moi

1. Tang version trong `package.json`, vi du `1.0.3`.
2. Build installer:

```bat
npm run dist
```

3. Upload cac file sau trong `dist/` len GitHub Release moi:

```text
latest.yml
VICdigi Live Streamer Setup x.y.z.exe
VICdigi Live Streamer Setup x.y.z.exe.blockmap
```

4. Trong app, vao Settings -> Tu dong cap nhat.
5. Update URL co the de mac dinh theo ban build, hoac nhap tay:

```text
https://github.com/phamdung1102/vicdigi-live-streamer/releases/latest/download/
```

6. Bat `Tu kiem tra khi mo app` neu muon app tu check moi lan khoi dong.

## Luu y

- Update URL nen dung HTTPS.
- GitHub repo/release phai public neu may khach khong co token GitHub.
- Ban da cai dat se check `latest.yml`; neu version moi hon thi tai installer va cai sau khi bam `Cai va khoi dong lai`.
