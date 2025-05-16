// GameScene.js

import { io } from "socket.io-client";

export default class GameScene extends Phaser.Scene {
  constructor() {
    super("GameScene");
  }

  preload() {
    this.load.spritesheet("tiles", "assets/tiles.png", {
      frameWidth: 32,
      frameHeight: 32,
    });

    this.load.spritesheet("player", "assets/player.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
  }

  create() {
    this.mapSize = 20;
    this.tileSize = 64;

    // Initialize empty map that will be filled from server data
    this.map = Array(this.mapSize).fill().map(() => Array(this.mapSize).fill(0));
    this.tiles = [];
    
    // Create map tiles (visuals only - actual map data will come from server)
    for (let y = 0; y < this.mapSize; y++) {
      for (let x = 0; x < this.mapSize; x++) {
        // Default to floor tiles (will be updated with server data)
        const tile = this.add
          .sprite(x * this.tileSize, y * this.tileSize, "tiles", 0)
          .setOrigin(0)
          .setDisplaySize(this.tileSize, this.tileSize);
        this.tiles.push(tile);
      }
    }

    // Fog of war layer
    this.fogTiles = [];
    for (let y = 0; y < this.mapSize; y++) {
      for (let x = 0; x < this.mapSize; x++) {
        const fog = this.add
          .rectangle(
            x * this.tileSize,
            y * this.tileSize,
            this.tileSize,
            this.tileSize,
            0x000000,
            0.8
          )
          .setOrigin(0);
        this.fogTiles.push(fog);
      }
    }

    // Setup local player
    this.playerTileX = 1;
    this.playerTileY = 1;
    this.player = this.add
      .sprite(0, 0, "player", 0)
      .setDisplaySize(this.tileSize, this.tileSize);

    this.anims.create({
      key: "idle",
      frames: this.anims.generateFrameNumbers("player", { start: 0, end: 3 }),
      frameRate: 6,
      repeat: -1,
    });
    this.player.play("idle");

    this.cameras.main.startFollow(this.player);
    this.updatePlayerPosition();
    this.updateFog();

    // Movement controls
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys("W,A,S,D");

    // ✅ Multiplayer Setup
    this.setupMultiplayer();
  }

  setupMultiplayer() {
    this.socket = io("http://localhost:3000", {
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      transports: ['websocket', 'polling'],
      withCredentials: true,
      autoConnect: true
    });

    this.otherPlayers = {};

    this.socket.on("connect", () => {
      console.log("Connected to server with ID:", this.socket.id);
    });

    this.socket.on("connect_error", (error) => {
      console.error("Connection error:", error);
    });

    // Listen for the initial data from server
    this.socket.on("init", ({ map, players }) => {
      console.log("Received initial game state:", { mapLength: map?.length, playerCount: Object.keys(players).length });
      
      // Use the server's map instead of client-generated one
      this.loadServerMap(map);
      
      // Handle existing players (excluding ourselves)
      Object.entries(players).forEach(([id, data]) => {
        if (id !== this.socket.id && data?.x != null && data?.y != null) {
          this.addOtherPlayer(id, data.x, data.y);
        }
      });
    });

    // For backward compatibility - keep this listener too
    this.socket.on("current-players", (players) => {
      console.log("Received current players:", players);
      Object.entries(players).forEach(([id, data]) => {
        if (id !== this.socket.id && data?.x != null && data?.y != null) {
          this.addOtherPlayer(id, data.x, data.y);
        }
      });
    });

    this.socket.on("player-joined", ({ id, x, y }) => {
      if (id && x != null && y != null) {
        console.log("Player joined:", id, "at", x, y);
        this.addOtherPlayer(id, x, y);
      }
    });

    this.socket.on("player-moved", ({ id, x, y }) => {
      const other = this.otherPlayers[id];
      if (other && x != null && y != null) {
        other.setPosition(x * this.tileSize, y * this.tileSize);
      }
    });

    this.socket.on("player-left", (id) => {
      console.log("Player left:", id);
      if (this.otherPlayers[id]) {
        this.otherPlayers[id].destroy();
        delete this.otherPlayers[id];
      }
    });
  }

  // Load map data from server
  loadServerMap(serverMap) {
    if (!serverMap || !Array.isArray(serverMap) || serverMap.length === 0) {
      console.warn("Invalid server map data, using default map");
      return;
    }

    console.log("Loading map from server...");

    // Update tiles based on server map
    for (let y = 0; y < Math.min(this.mapSize, serverMap.length); y++) {
      for (let x = 0; x < Math.min(this.mapSize, serverMap[y].length); x++) {
        const tileType = serverMap[y][x];
        const index = y * this.mapSize + x;
        
        // Update internal map data
        this.map[y][x] = tileType;
        
        // Update visual tile
        if (index < this.tiles.length) {
          this.tiles[index].setFrame(tileType === 1 ? 1 : 0);
        }
      }
    }

    console.log("Map loaded from server successfully");
    // Update fog after loading map
    this.updateFog();
  }

  update() {
    let moved = false;
    let nextX = this.playerTileX;
    let nextY = this.playerTileY;

    if (Phaser.Input.Keyboard.JustDown(this.wasd.W)) {
      nextY--;
      moved = true;
    } else if (Phaser.Input.Keyboard.JustDown(this.wasd.S)) {
      nextY++;
      moved = true;
    } else if (Phaser.Input.Keyboard.JustDown(this.wasd.A)) {
      nextX--;
      moved = true;
    } else if (Phaser.Input.Keyboard.JustDown(this.wasd.D)) {
      nextX++;
      moved = true;
    }

    if (
      moved &&
      nextX >= 0 &&
      nextX < this.mapSize &&
      nextY >= 0 &&
      nextY < this.mapSize &&
      this.map[nextY][nextX] === 0
    ) {
      this.playerTileX = nextX;
      this.playerTileY = nextY;
      this.updatePlayerPosition();
      this.updateFog();

      if (this.socket && this.socket.connected) {
        this.socket.emit("move", { x: nextX, y: nextY });
      }
    }
  }

  updatePlayerPosition() {
    this.player.x = this.playerTileX * this.tileSize;
    this.player.y = this.playerTileY * this.tileSize;
  }

  updateFog() {
    this.fogTiles.forEach((fog) => fog.setAlpha(0.8));

    const radius = 2;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const tx = this.playerTileX + dx;
        const ty = this.playerTileY + dy;
        if (
          tx >= 0 &&
          tx < this.mapSize &&
          ty >= 0 &&
          ty < this.mapSize
        ) {
          const index = ty * this.mapSize + tx;
          this.fogTiles[index].setAlpha(0);
        }
      }
    }
  }

  addOtherPlayer(id, x, y) {
    if (x == null || y == null) {
      console.warn(`Invalid player position for id: ${id}`, { x, y });
      return;
    }

    // Don't add duplicate players
    if (this.otherPlayers[id]) {
      console.log(`Player ${id} already exists, updating position`);
      this.otherPlayers[id].setPosition(x * this.tileSize, y * this.tileSize);
      return;
    }

    const other = this.add
      .sprite(x * this.tileSize, y * this.tileSize, "player", 0)
      .setDisplaySize(this.tileSize, this.tileSize)
      .setTint(0xff0000);
    other.play("idle");
    this.otherPlayers[id] = other;
  }
}