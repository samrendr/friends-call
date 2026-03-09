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

// Map: agentSocketId -> { roomId, displayName, screenWidth, screenHeight, controllerId }
const agents = new Map();

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

  // AGENT: remote-agent.js joins room
  socket.on('agent-join', ({ roomId, displayName, screenWidth, screenHeight }) => {
    if (!roomId) return;
    agents.set(socket.id, { roomId, displayName, screenWidth, screenHeight, controllerId: null });
    socket.join(roomId);
    socket.roomId = roomId;
    socket.isAgent = true;
    socket.displayName = displayName;
    // Tell browsers in the room an agent is ready
    socket.to(roomId).emit('agent-ready', { agentId: socket.id, displayName, screenWidth, screenHeight });
    console.log(`[Agent] ${displayName} ready in room ${roomId} (${screenWidth}x${screenHeight})`);
  });

  // CONTROL: browser requests control
  socket.on('control-request', ({ agentId, requesterName }) => {
    if (!agentId) return;
    io.to(agentId).emit('control-request', { fromId: socket.id, fromName: requesterName || socket.displayName });
  });

  // CONTROL: agent grants
  socket.on('control-grant', ({ controllerId, controllerName }) => {
    const agent = agents.get(socket.id);
    if (!agent) return;
    if (agent.controllerId && agent.controllerId !== controllerId) {
      io.to(agent.controllerId).emit('control-revoked');
    }
    agent.controllerId = controllerId;
    io.to(controllerId).emit('control-granted', {
      agentId: socket.id, agentName: agent.displayName,
      screenWidth: agent.screenWidth, screenHeight: agent.screenHeight
    });
    io.to(agent.roomId).emit('control-status', { agentId: socket.id, active: true, controllerName });
    console.log(`[Control] ${controllerName} → agent ${agent.displayName}`);
  });

  // CONTROL: agent denies
  socket.on('control-deny', ({ controllerId }) => {
    io.to(controllerId).emit('control-denied', { agentId: socket.id });
  });

  // CONTROL: relay mouse/keyboard events (security: only the granted controller)
  socket.on('control-event', ({ agentId, type, x, y, button, key, modifiers }) => {
    const agent = agents.get(agentId);
    if (!agent || agent.controllerId !== socket.id) return;
    io.to(agentId).emit('control-event', { type, x, y, button, key, modifiers });
  });

  // CONTROL: revoke (from either side)
  socket.on('control-revoke', ({ agentId }) => {
    const agent = agents.get(agentId);
    if (!agent) return;
    if (agent.controllerId) io.to(agent.controllerId).emit('control-revoked');
    io.to(agent.roomId).emit('control-status', { agentId, active: false });
    agent.controllerId = null;
  });

  // RELAY: laser pointer position
  socket.on('pointer-move', ({ roomId, targetSocketId, x, y }) => {
    if (!roomId) return;
    socket.to(roomId).emit('pointer-move', {
      fromId: socket.id,
      displayName: socket.displayName,
      targetSocketId,
      x, y
    });
  });

  // RELAY: laser pointer left
  socket.on('pointer-end', ({ roomId }) => {
    if (!roomId) return;
    socket.to(roomId).emit('pointer-end', { fromId: socket.id });
  });

  // RELAY: emoji reaction
  socket.on('emoji-reaction', ({ roomId, emoji }) => {
    if (!roomId || !emoji) return;
    io.to(roomId).emit('emoji-reaction', {
      fromId: socket.id,
      displayName: socket.displayName,
      emoji
    });
  });

  // DISCONNECT
  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (!roomId) return;

    // Agent disconnect
    if (socket.isAgent) {
      const agent = agents.get(socket.id);
      if (agent) {
        if (agent.controllerId) io.to(agent.controllerId).emit('control-revoked');
        socket.to(roomId).emit('agent-left', { agentId: socket.id });
        agents.delete(socket.id);
        console.log(`[Agent] ${socket.displayName} left room ${roomId}`);
      }
      return;
    }

    // Regular participant disconnect
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
