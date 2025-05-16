// server/index.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173', // React frontend port
    methods: ['GET', 'POST'],
  },
});

app.use(cors());

const PORT = 3000;

// Handle socket connection
io.on('connection', (socket) => {
  console.log(`✅ Player connected: ${socket.id}`);
  
  socket.on("player-join", ({ name }) => {
    console.log(`🧍 Player joined: ${name}`);
    socket.emit("welcome", `Welcome to the game, ${name}!`);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`❌ Player disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});