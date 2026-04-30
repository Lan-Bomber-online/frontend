# LAN Bomber Frontend

정적 웹 프론트엔드입니다. 로컬에서는 Rust Axum 백엔드(`http://localhost:8080`)와 직접 연결됩니다.

## 실행

백엔드를 먼저 실행합니다.

```powershell
cd C:\Users\1454\lan-bomber-online\backend
docker compose up -d --build app
```

프론트엔드를 실행합니다.

```powershell
cd C:\Users\1454\lan-bomber-online\frontend
npm run serve
```

브라우저에서 접속합니다.

```text
http://localhost:5173
```

## 연결된 백엔드 API

- `GET /health`
- `GET /api/status`
- `GET /api/auth/config`
- `POST /api/auth/google`
- `GET /api/auth/me`
- `PATCH /api/users/me`
- `POST /api/access-codes/verify`
- `GET /api/rooms`
- `POST /api/rooms`
- `POST /api/rooms/{roomId}/join`
- `POST /api/rooms/join-by-code`
- `GET /api/rooms/{roomId}`
- `PATCH /api/rooms/{roomId}/ready`
- `POST /api/rooms/{roomId}/start`

## API 주소 변경

기본 API 주소는 현재 호스트의 `8080` 포트입니다.

```js
window.LAN_BOMBER_API_BASE = 'http://localhost:8080';
```

기본 로컬 실행에서는 따로 설정하지 않아도 됩니다.
