# FriendsCall — Project Document

## Overview
A browser-based video calling app for up to 10 participants. No accounts, no installs — share a link and join. Built with vanilla JS + WebRTC on the frontend and Node.js + Socket.io on the backend.

**Live deployment:** Railway (`railway.json` configured)

---

## Architecture

```
friendscall/
├── server/
│   ├── index.js          # Express + Socket.io signaling server
│   └── package.json      # deps: express, socket.io, cors
├── client/
│   ├── index.html        # Single HTML shell (lobby + room views)
│   ├── styles/
│   │   └── main.css      # Dark theme, responsive layout
│   └── src/
│       ├── signaling.js  # Socket.IO wrapper (emit/on helpers)
│       ├── peer.js       # RTCPeerConnection class (one per remote peer)
│       ├── media.js      # getUserMedia, screen share, track management
│       ├── ui.js         # DOM: video tiles, chat, toasts, grid layout
│       ├── room.js       # Orchestrator: connects signaling/peers/media/UI
│       └── main.js       # Entry: lobby form, URL routing, control bindings
├── Dockerfile            # node:20-alpine, serves everything on port 3000
├── docker-compose.yml
└── railway.json
```

---

## How It Works

### Signaling (server)
- Rooms stored in-memory as `Map<roomId, Map<socketId, {displayName, socketId}>>`
- Max 10 participants per room
- Events relayed: `join-room`, `room-joined`, `user-joined`, `user-left`, `offer`, `answer`, `ice-candidate`, `chat-message`, `toggle-state`, `room-full`

### WebRTC Flow
1. New joiner receives `room-joined` with existing participant list → sends `offer` to each
2. Existing participants receive `user-joined` → wait for incoming `offer`, respond with `answer`
3. ICE candidates exchanged via `ice-candidate` events
4. STUN servers: `stun.l.google.com:19302`, `stun1.l.google.com:19302`

### URL Routing
- `/` → lobby
- `/room/:roomId` → lobby pre-filled with room name (served same `index.html`)
- Room ID auto-generated (6-char alphanumeric) if left blank

### State Management
- `Room` module holds: `peers Map`, `mySocketId`, `audioEnabled`, `videoEnabled`, `currentRoomId`
- `Media` module holds: `localStream`, `screenStream`, `originalVideoTrack`
- Display name persisted in `localStorage` (`fc_displayName`)

---

## Features (Built)

| Feature | Status | Notes |
|---|---|---|
| Video/audio calls | ✅ | Up to 10 participants |
| Mute toggle | ✅ | Broadcasts state to peers |
| Camera toggle | ✅ | Broadcasts state to peers |
| Screen sharing | ✅ | Replaces video track on all peers |
| In-room chat | ✅ | Broadcast via Socket.io |
| Copy invite link | ✅ | Clipboard API |
| Mute/cam indicators on tiles | ✅ | Icons on video tiles |
| Participant count | ✅ | Live in header |
| Responsive layout | ✅ | Mobile breakpoint at 700px |
| Dark theme | ✅ | CSS custom properties |
| Persistent display name | ✅ | localStorage |
| Railway deployment | ✅ | Docker + railway.json |

---

## Known Gaps / Potential Next Steps

- **No TURN server** — calls may fail behind symmetric NAT (most home/corporate networks fine with STUN only, but can break)
- **No reconnection logic** — if socket drops, user must rejoin manually
- **Participant count bug** — `user-joined` optimistically increments before peer connection; could be off by 1
- **No avatar fallback rendering** — `.avatar-fallback` class exists in CSS but not wired in JS when camera is off
- **No speaking indicator** — `.video-tile.speaking` CSS class exists but AudioContext/analyser not implemented
- **Screen share local preview** — self tile doesn't update to show screen share
- **No room persistence** — rooms vanish on server restart
- **Single server** — no horizontal scaling (in-memory state)
- **No end-to-end encryption UI** — WebRTC DTLS is encrypted by spec, but no key verification

---

## Running Locally

```bash
cd server
npm install
npm run dev    # nodemon, port 3000
# visit http://localhost:3000
```

## Deployment

```bash
# Docker
docker-compose up --build

# Railway
# push to GitHub, connect repo in Railway dashboard
# uses Dockerfile automatically
```

---

## CSS Theme Tokens

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#0f1117` | Page background |
| `--bg2` | `#1a1d27` | Header/footer/chat bg |
| `--bg3` | `#23273a` | Input/button/tile bg |
| `--accent` | `#5b6af0` | Primary blue/purple |
| `--danger` | `#e05555` | Leave button, muted state |
| `--text` | `#e8eaf6` | Primary text |
| `--text2` | `#9ea3c0` | Secondary/muted text |
| `--border` | `#2e3250` | All borders |
