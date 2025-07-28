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
  pingTimeout: 10000, // Lower timeout for faster cleanup of inactive connections
  pingInterval: 5000   // More frequent pings to detect disconnects faster
});

const PORT = 3000;
const MAP_SIZE = 20;
let players = {};

// Add seeker variable - will be set once and never changed
let currentSeekerId = null;

// Generate a shared map (0 = floor, 1 = wall)
const map = [];
const WALL_PROBABILITY = 0.2;

// Create map with walls
for (let y = 0; y < MAP_SIZE; y++) {
  map[y] = [];
  for (let x = 0; x < MAP_SIZE; x++) {
    if ((x <= 2 && y <= 2)) {
      map[y][x] = 0; // Floor
    } else {
      const isWall = Math.random() < WALL_PROBABILITY;
      map[y][x] = isWall ? 1 : 0;
    }
  }
}

map[1][1] = 0;

// Force disconnect all clients and clean up players
function forceCleanupAllConnections() {
  console.log('Forcing cleanup of all connections');
  // Clear all players
  players = {};
  currentSeekerId = null;
  
  // Force disconnect all sockets
  io.sockets.sockets.forEach(socket => {
    socket.disconnect(true);
  });
  
  console.log('All connections have been cleaned up');
}

// Periodic cleanup of inactive connections (every 30 seconds)
setInterval(() => {
  console.log('Running connection cleanup...');
  const connectedSockets = Array.from(io.sockets.sockets.keys());
  
  // Log all tracked sockets for debugging
  console.log('Currently tracked players:', Object.keys(players));
  console.log('Active connections in Socket.IO:', connectedSockets);
  
  // Clean up any players that don't have a corresponding socket
  Object.keys(players).forEach(id => {
    if (!connectedSockets.includes(id)) {
      console.log(`Cleaning up disconnected player: ${id}`);
      delete players[id];
      io.emit("player-left", id);
      
      // If this was the seeker, assign a new one
      if (id === currentSeekerId) {
        currentSeekerId = null;
        assignRandomSeeker();
      }
    }
  });

  // Also check for any sockets that don't have a player entry
  connectedSockets.forEach(socketId => {
    if (!players[socketId]) {
      console.log(`Found socket ${socketId} without player entry, forcing disconnect`);
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.disconnect(true);
      }
    }
  });
  
  // Log player count after cleanup
  console.log(`After cleanup: ${Object.keys(players).length} players remaining`);
}, 30000);

// Helper function to pick a random seeker from connected players
function assignRandomSeeker() {
  const playerIds = Object.keys(players);
  if (playerIds.length > 0) {
    // Pick a random player as seeker
    const randomIndex = Math.floor(Math.random() * playerIds.length);
    currentSeekerId = playerIds[randomIndex];
    console.log(`Randomly selected player ${currentSeekerId} as the seeker (out of ${playerIds.length} players)`);
    
    // Inform all clients about the seeker
    io.emit("seeker-changed", currentSeekerId);
    return true;
  } else {
    currentSeekerId = null;
    return false;
  }
}

// Add an endpoint to reset the server state (for debugging)
app.get('/reset', (req, res) => {
  forceCleanupAllConnections();
  res.send('Server reset complete');
});

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);
  console.log(`Total connections: ${io.engine.clientsCount}`);
  
  // First, check if this socket ID is already in the players list
  // This happens if a client reconnects but the server didn't detect the disconnect
  if (players[socket.id]) {
    console.log(`Player ${socket.id} is reconnecting, updating connection`);
  } else {
    // Add player to the players object
    console.log(`Adding new player: ${socket.id}`);
    players[socket.id] = { 
      x: 1, 
      y: 1,
      lastActive: Date.now() 
    };
  }
  
  // Check if we need to assign a seeker
  if (currentSeekerId === null || !players[currentSeekerId]) {
    // Only assign seeker if we have players and more than one player connected
    const playerCount = Object.keys(players).length;
    
    if (playerCount > 1) {
      assignRandomSeeker();
    } else if (playerCount === 1) {
      // If only one player (current player), don't assign seeker yet
      currentSeekerId = null;
      console.log("Only one player connected. Waiting for more players before assigning seeker.");
    }
  }

  // Debug log to verify seeker is assigned
  console.log(`Current seeker: ${currentSeekerId}, Player count: ${Object.keys(players).length}`);

  // Send initial game state to the newly connected player
  socket.emit("init", {
    map,
    players,  // This includes ALL players including the current one
    seekerId: currentSeekerId
  });
  
  // Notify other players about the new player
  socket.broadcast.emit("player-joined", { 
    id: socket.id, 
    x: players[socket.id].x, 
    y: players[socket.id].y 
  });
  
  // If we have a seeker, make sure this new connection knows about it
  if (currentSeekerId) {
    socket.emit("seeker-changed", currentSeekerId);
  }
  
  // Heartbeat to keep connection active and verify client is still there
  socket.on("heartbeat", () => {
    // Update last activity time
    if (players[socket.id]) {
      players[socket.id].lastActive = Date.now();
    }
  });
  
  socket.on("move", ({ x, y }) => {
    if (players[socket.id]) {
      players[socket.id].x = x;
      players[socket.id].y = y;
      players[socket.id].lastActive = Date.now(); // Update activity timestamp
      socket.broadcast.emit("player-moved", { id: socket.id, x, y });
    }
  });
  
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    
    // Check if the seeker is leaving
    const seekerDisconnected = socket.id === currentSeekerId;
    
    // Remove the player
    delete players[socket.id];
    socket.broadcast.emit("player-left", socket.id);
    
    console.log(`Remaining players after disconnect: ${Object.keys(players).length}`);
    
    // If the seeker disconnected, we need to assign a new one
    if (seekerDisconnected && Object.keys(players).length > 1) {
      console.log("The seeker disconnected! Assigning a new seeker...");
      assignRandomSeeker();
    } else if (Object.keys(players).length <= 1) {
      // Reset seeker if only 0 or 1 player left
      currentSeekerId = null;
      console.log("Fewer than 2 players left. Will assign a new seeker when more players connect.");
    }
  });
  
  // Force disconnect - for manual testing
  socket.on("force-disconnect", () => {
    console.log(`Forcing disconnect for player: ${socket.id}`);
    socket.disconnect(true);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});