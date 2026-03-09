/**
 * FriendsCall Remote Control Agent
 *
 * Runs on the machine to be controlled. Connects to the FriendsCall server
 * and executes OS-level mouse/keyboard commands via robotjs.
 *
 * Usage:
 *   node remote-agent.js <roomId> [yourName] [serverUrl]
 *
 * Example:
 *   node remote-agent.js ABC123
 *   node remote-agent.js ABC123 "Sam's Mac" https://your-ngrok-url.ngrok-free.app
 *
 * Requirements:
 *   npm install
 *   macOS : Xcode Command Line Tools  (xcode-select --install)
 *   Windows: npm install -g windows-build-tools  (run as admin)
 *   Linux  : sudo apt-get install build-essential libxtst-dev
 */

const robot = require('robotjs');
const { io }  = require('socket.io-client');
const readline = require('readline');
const os = require('os');

// ---- Config ----------------------------------------------------------------

const ROOM_ID    = process.argv[2];
const NAME       = process.argv[3] || os.hostname();
const SERVER_URL = process.argv[4] || process.env.SERVER_URL || 'http://localhost:3000';

if (!ROOM_ID) {
  console.error('\nUsage: node remote-agent.js <roomId> [yourName] [serverUrl]');
  console.error('Example: node remote-agent.js ABC123 "Sam\'s Mac"\n');
  process.exit(1);
}

// ---- Key map (browser KeyboardEvent.key → robotjs key name) ----------------

const KEY_MAP = {
  'Enter':'enter','Backspace':'backspace','Delete':'delete','Tab':'tab',
  'Escape':'escape','CapsLock':'caps_lock',' ':'space',
  'ArrowLeft':'left','ArrowRight':'right','ArrowUp':'up','ArrowDown':'down',
  'Home':'home','End':'end','PageUp':'pageup','PageDown':'pagedown','Insert':'insert',
  'F1':'f1','F2':'f2','F3':'f3','F4':'f4','F5':'f5','F6':'f6',
  'F7':'f7','F8':'f8','F9':'f9','F10':'f10','F11':'f11','F12':'f12',
};

function mapKey(key) {
  return KEY_MAP[key] || (key.length === 1 ? key.toLowerCase() : null);
}

// ---- Setup -----------------------------------------------------------------

robot.setMouseDelay(0);  // no delay — smooth real-time movement
robot.setKeyboardDelay(0);

const screen = robot.getScreenSize();
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log('\n╔══════════════════════════════════════╗');
console.log('║   FriendsCall Remote Control Agent   ║');
console.log('╚══════════════════════════════════════╝');
console.log(`  Server : ${SERVER_URL}`);
console.log(`  Room   : ${ROOM_ID}`);
console.log(`  Name   : ${NAME}`);
console.log(`  Screen : ${screen.width} × ${screen.height}\n`);

// ---- Socket connection -----------------------------------------------------

const socket = io(SERVER_URL, { reconnection: true, reconnectionDelay: 2000 });
let activeControllerId = null;
let activeControllerName = null;

socket.on('connect', () => {
  console.log(`✅ Connected to server (${socket.id.slice(0, 8)}...)`);
  socket.emit('agent-join', {
    roomId: ROOM_ID,
    displayName: NAME,
    screenWidth: screen.width,
    screenHeight: screen.height
  });
  console.log('⏳ Waiting for a control request...\n');
});

socket.on('disconnect', (reason) => {
  console.log(`\n⚠  Disconnected: ${reason}`);
  activeControllerId = null;
});

socket.on('connect_error', (err) => {
  console.error(`❌ Cannot reach server: ${err.message}`);
});

// ---- Control request -------------------------------------------------------

socket.on('control-request', ({ fromId, fromName }) => {
  console.log(`\n╔═══════════════════════════════════════╗`);
  console.log(`║  ⚠  Control request from: ${fromName.padEnd(12)}║`);
  console.log(`╚═══════════════════════════════════════╝`);
  rl.question('  Grant control? (yes / no): ', (answer) => {
    if (answer.trim().toLowerCase().startsWith('y')) {
      activeControllerId = fromId;
      activeControllerName = fromName;
      socket.emit('control-grant', { controllerId: fromId, controllerName: fromName });
      console.log(`\n✅ Control granted to ${fromName}`);
      console.log('   They can now move your mouse and type.');
      console.log('   Press Ctrl+C to revoke at any time.\n');
    } else {
      socket.emit('control-deny', { controllerId: fromId });
      console.log('\n❌ Control denied\n');
    }
  });
});

socket.on('control-revoked-by-controller', () => {
  activeControllerId = null;
  activeControllerName = null;
  console.log('\n🛑 Controller ended the session. Waiting for new requests...\n');
});

// ---- Execute control events ------------------------------------------------

socket.on('control-event', ({ type, x, y, button, key, modifiers }) => {
  if (!activeControllerId) return;

  try {
    switch (type) {
      case 'mousemove':
        robot.moveMouse(clamp(x, screen.width), clamp(y, screen.height));
        break;

      case 'click': {
        const btn = button === 'right' ? 'right' : 'left';
        robot.moveMouse(clamp(x, screen.width), clamp(y, screen.height));
        robot.mouseClick(btn);
        break;
      }

      case 'dblclick':
        robot.moveMouse(clamp(x, screen.width), clamp(y, screen.height));
        robot.mouseClick('left', true);
        break;

      case 'rightclick':
        robot.moveMouse(clamp(x, screen.width), clamp(y, screen.height));
        robot.mouseClick('right');
        break;

      case 'scroll':
        // deltaX/Y from browser wheel event (pixels) → robotjs scroll units
        robot.scrollMouse(Math.round(x / 50), Math.round(y / 50));
        break;

      case 'keypress': {
        const mapped = mapKey(key);
        if (!mapped) break;
        const mods = (modifiers || []).filter(m =>
          ['control','shift','alt','command'].includes(m));
        mods.length ? robot.keyTap(mapped, mods) : robot.keyTap(mapped);
        break;
      }

      case 'typestring':
        if (key && key.length === 1) robot.typeString(key);
        break;
    }
  } catch (err) {
    // Silently ignore unknown keys / out-of-bounds coords
  }
});

// ---- Helpers ---------------------------------------------------------------

function clamp(val, max) {
  return Math.max(0, Math.min(max - 1, Math.round(val)));
}

// ---- Graceful shutdown -----------------------------------------------------

process.on('SIGINT', () => {
  if (activeControllerId) {
    socket.emit('control-revoke', { agentId: socket.id });
    console.log('\n🛑 Control revoked');
  }
  console.log('👋 Agent stopped.\n');
  socket.disconnect();
  rl.close();
  process.exit(0);
});
