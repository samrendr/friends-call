const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const MAX_PARTICIPANTS = 10;

// Map: roomId -> Map(socketId -> { displayName, socketId })
const rooms = new Map();

app.use(cors());
app.use(express.static(path.join(__dirname, '../client')));

// Serve client for any room URL
app.get('/room/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

io.on('connection', (socket) => {
  console.log(`[+] Socket connected: ${socket.id}`);

  // JOIN ROOM
  socket.on('join-room', ({ roomId, displayName }) => {
    if (!roomId || !displayName) return;

    const room = rooms.get(roomId) || new Map();

    if (room.size >= MAX_PARTICIPANTS) {
      socket.emit('room-full', { max: MAX_PARTICIPANTS });
      return;
    }

    room.set(socket.id, { displayName, socketId: socket.id });
    rooms.set(roomId, room);

    socket.join(roomId);
    socket.roomId = roomId;
    socket.displayName = displayName;

    // Send existing participants to the new joiner
    const existing = [...room.entries()]
      .filter(([id]) => id !== socket.id)
      .map(([id, data]) => ({ socketId: id, displayName: data.displayName }));

    socket.emit('room-joined', {
      socketId: socket.id,
      participants: existing,
      roomId
    });

    // Notify existing participants about the new joiner
    socket.to(roomId).emit('user-joined', {
      socketId: socket.id,
      displayName
    });

    console.log(`[Room ${roomId}] ${displayName} joined (${room.size}/${MAX_PARTICIPANTS})`);
  });

  // RELAY: offer
  socket.on('offer', ({ targetId, sdp }) => {
    io.to(targetId).emit('offer', {
      fromId: socket.id,
      displayName: socket.displayName,
      sdp
    });
  });

  // RELAY: answer
  socket.on('answer', ({ targetId, sdp }) => {
    io.to(targetId).emit('answer', {
      fromId: socket.id,
      sdp
    });
  });

  // RELAY: ICE candidate
  socket.on('ice-candidate', ({ targetId, candidate }) => {
    io.to(targetId).emit('ice-candidate', {
      fromId: socket.id,
      candidate
    });
  });

  // CHAT: broadcast to room
  socket.on('chat-message', ({ roomId, message }) => {
    if (!roomId || !message) return;
    io.to(roomId).emit('chat-message', {
      fromId: socket.id,
      displayName: socket.displayName,
      message,
      timestamp: Date.now()
    });
  });

  // TOGGLE STATE: broadcast mute/camera state
  socket.on('toggle-state', ({ roomId, kind, enabled }) => {
    socket.to(roomId).emit('peer-toggle-state', {
      fromId: socket.id,
      kind,
      enabled
    });
  });

  // DISCONNECT
  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (room) {
      room.delete(socket.id);
      if (room.size === 0) {
        rooms.delete(roomId);
        console.log(`[Room ${roomId}] Empty, removed`);
      }
    }

    io.to(roomId).emit('user-left', { socketId: socket.id });
    console.log(`[-] ${socket.displayName || socket.id} left room ${roomId}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`FriendsCall server running on http://localhost:${PORT}`);
});
