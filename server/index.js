const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST'],
  credentials: true
}));

const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 30000,
  pingInterval: 25000
});

const PORT = 3000;
const MAP_SIZE = 20;
let players = {};

// Generate a shared map (0 = floor, 1 = wall)
// This will be the single source of truth for all clients
const map = [];
const WALL_PROBABILITY = 0.2;

// Create deterministic map (optional: use a seed for true reproducibility)
// const seed = Math.floor(Math.random() * 1000000);
// console.log(`Map seed: ${seed}`); // Log the seed for debugging
// Math.random = () => { /* seeded random function */ };

// Create map with walls
for (let y = 0; y < MAP_SIZE; y++) {
  map[y] = [];
  for (let x = 0; x < MAP_SIZE; x++) {
    // Always make the player spawn area (1,1) and adjacent tiles floors
    if ((x <= 2 && y <= 2)) {
      map[y][x] = 0; // Floor
    } else {
      const isWall = Math.random() < WALL_PROBABILITY;
      map[y][x] = isWall ? 1 : 0;
    }
  }
}

// Ensure the spawn area (1,1) is always floor
map[1][1] = 0;

io.on('connection', (socket) => {
  console.log(`✅ Player connected: ${socket.id}`);
  
  // Set default spawn
  players[socket.id] = { x: 1, y: 1 };
  
  // Send map + players to the new player
  socket.emit("init", { map, players });
  
  // Also emit the current-players for backward compatibility
  socket.emit("current-players", players);
  
  // Notify others about new player
  socket.broadcast.emit("player-joined", { id: socket.id, x: 1, y: 1 });
  
  socket.on("move", ({ x, y }) => {
    if (players[socket.id]) {
      players[socket.id] = { x, y };
      socket.broadcast.emit("player-moved", { id: socket.id, x, y });
    }
  });
  
  socket.on('disconnect', () => {
    console.log(`❌ Player disconnected: ${socket.id}`);
    delete players[socket.id];
    socket.broadcast.emit("player-left", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});