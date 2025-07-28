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

    // Add debug text to display connection status
    this.debugText = this.add.text(10, 40, '', { 
      fontSize: '16px', 
      fill: '#ffffff',
      backgroundColor: '#00000080',
      padding: { x: 10, y: 5 }
    }).setScrollFactor(0).setDepth(100);

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

    // Track if the player is a seeker
    this.isSeeker = false;
    this.seekerId = null; // Store the current seeker ID

    this.anims.create({
      key: "idle",
      frames: this.anims.generateFrameNumbers("player", { start: 0, end: 3 }),
      frameRate: 6,
      repeat: -1,
    });
    this.player.play("idle");

    // Add game state text
    this.gameStateText = this.add.text(10, 10, '', { 
      fontSize: '24px', 
      fill: '#ffffff',
      backgroundColor: '#00000080',
      padding: { x: 10, y: 5 }
    }).setScrollFactor(0).setDepth(100);

    this.cameras.main.startFollow(this.player);
    this.updatePlayerPosition();
    this.updateFog();

    // Movement controls
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys("W,A,S,D");

    // Multiplayer Setup
    this.setupMultiplayer();
    
    // Setup player counter display
    this.playerCountText = this.add.text(10, 70, '', { 
      fontSize: '16px', 
      fill: '#ffffff',
      backgroundColor: '#00000080',
      padding: { x: 10, y: 5 }
    }).setScrollFactor(0).setDepth(100);
  }

  setupMultiplayer() {
    // Check if we already have a socket connection - prevent duplicate connections
    if (this.socket && this.socket.connected) {
      console.log("Already connected to server, not creating a new connection");
      return;
    }
    
    // Disconnect any existing socket before creating a new one
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    this.socket = io("http://localhost:3000", {
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      transports: ['websocket', 'polling'],
      withCredentials: true,
      autoConnect: true
    });

    this.otherPlayers = {};
    this.heartbeatInterval = null;

    this.socket.on("connect", () => {
      console.log("Connected to server with ID:", this.socket.id);
      this.debugText.setText(`Connected: ${this.socket.id}`);
      
      // Start sending heartbeats
      this.startHeartbeat();
    });

    this.socket.on("connect_error", (error) => {
      console.error("Connection error:", error);
      this.debugText.setText(`Connection error: ${error.message}`);
    });
    
    this.socket.on("disconnect", (reason) => {
      console.log("Disconnected:", reason);
      this.debugText.setText(`Disconnected: ${reason}`);
      
      // Clear heartbeat on disconnect
      this.stopHeartbeat();
      
      // Clear other players
      Object.values(this.otherPlayers).forEach(sprite => sprite.destroy());
      this.otherPlayers = {};
      
      // Reset seeker status
      this.updateGameState(false, null);
    });

    // Listen for the initial data from server
    this.socket.on("init", ({ map, players, seekerId }) => {
      console.log("Received initial game state:", { 
        mapLength: map?.length, 
        playerCount: Object.keys(players || {}).length,
        seekerId
      });
      
      // Use the server's map instead of client-generated one
      this.loadServerMap(map);
      
      // Store seeker ID and update status
      this.seekerId = seekerId;
      this.updateGameState(seekerId === this.socket.id, seekerId);
      
      // Log player count for debugging
      const playerIds = Object.keys(players || {});
      console.log(`Total players: ${playerIds.length}, Player IDs:`, playerIds);
      
      // First clear any existing players (in case of reconnect)
      Object.values(this.otherPlayers).forEach(sprite => sprite.destroy());
      this.otherPlayers = {};
      
      // Handle existing players (excluding ourselves)
      if (players) {
        Object.entries(players).forEach(([id, data]) => {
          if (id !== this.socket.id && data?.x != null && data?.y != null) {
            console.log(`Adding other player: ${id} at ${data.x},${data.y}`);
            this.addOtherPlayer(id, data.x, data.y, id === seekerId);
          }
        });
      }
      
      // Update visibility after all players are added
      this.updatePlayerVisibility();
      
      // Update player count display
      this.updatePlayerCount(players);
    });

    this.socket.on("player-joined", ({ id, x, y }) => {
      if (id && x != null && y != null) {
        console.log("Player joined:", id, "at", x, y);
        // Add the new player with correct seeker status
        this.addOtherPlayer(id, x, y, id === this.seekerId);
        
        // Update player count
        const playerCount = Object.keys(this.otherPlayers).length + 1; // +1 for local player
        this.playerCountText.setText(`Players: ${playerCount}`);
      }
    });

    this.socket.on("player-moved", ({ id, x, y }) => {
      const other = this.otherPlayers[id];
      if (other && x != null && y != null) {
        other.setPosition(x * this.tileSize, y * this.tileSize);
        // Update visibility based on current seeker status
        this.updatePlayerVisibility();
      }
    });

    this.socket.on("player-left", (id) => {
      console.log("Player left:", id);
      if (this.otherPlayers[id]) {
        this.otherPlayers[id].destroy();
        delete this.otherPlayers[id];
        
        // Update player count
        const playerCount = Object.keys(this.otherPlayers).length + 1; // +1 for local player
        this.playerCountText.setText(`Players: ${playerCount}`);
      }
    });

    // Handle seeker changes
    this.socket.on("seeker-changed", (seekerId) => {
      console.log("Seeker changed to:", seekerId);
      this.seekerId = seekerId;
      this.updateGameState(seekerId === this.socket.id, seekerId);
      
      // Update the visuals for other players
      Object.entries(this.otherPlayers).forEach(([id, sprite]) => {
        const isSeeker = id === seekerId;
        sprite.setTint(isSeeker ? 0xff0000 : 0x00ff00);
      });
      
      // Update player visibility based on new seeker status
      this.updatePlayerVisibility();
    });
  }
  
  // Heartbeat methods to keep connection active
  startHeartbeat() {
    // Clear any existing interval
    this.stopHeartbeat();
    
    // Send heartbeats every 5 seconds
    this.heartbeatInterval = setInterval(() => {
      if (this.socket && this.socket.connected) {
        this.socket.emit("heartbeat");
      }
    }, 5000);
  }
  
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
  
  // Update player count display
  updatePlayerCount(players) {
    if (!players) return;
    
    const playerCount = Object.keys(players).length;
    this.playerCountText.setText(`Players: ${playerCount}`);
    
    // Update the game state text based on player count
    if (playerCount < 2) {
      if (this.seekerId) {
        this.gameStateText.setText('WAITING FOR MORE PLAYERS');
        this.gameStateText.setFill('#ffff00');
      }
    }
  }

  // Method to update seeker status and UI
  updateGameState(isSeeker, seekerId) {
    this.isSeeker = isSeeker;
    this.seekerId = seekerId;
    
    // Update player appearance
    if (this.isSeeker) {
      // I am the seeker
      this.player.setTint(0xff0000); // Red for seeker
      this.gameStateText.setText('YOU ARE THE SEEKER');
      this.gameStateText.setFill('#ff0000');
    } else if (seekerId) {
      // Someone else is the seeker
      this.player.setTint(0x00ff00); // Green for hider
      this.gameStateText.setText('HIDE FROM THE SEEKER');
      this.gameStateText.setFill('#00ff00');
    } else {
      // No seeker assigned yet
      this.player.setTint(0xffff00); // Yellow for waiting
      this.gameStateText.setText('WAITING FOR MORE PLAYERS');
      this.gameStateText.setFill('#ffff00');
    }
    
    console.log(`Game state updated: Am I seeker: ${this.isSeeker}, Current seeker: ${this.seekerId}`);
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
      this.updatePlayerVisibility();

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

  // Method to handle player visibility based on seeker status
  updatePlayerVisibility() {
    if (!this.otherPlayers) return;
    
    Object.entries(this.otherPlayers).forEach(([id, otherPlayer]) => {
      if (!otherPlayer) return;
      
      if (this.isSeeker) {
        // Seeker can only see players within their visibility radius (matching fog of war)
        const otherX = Math.floor(otherPlayer.x / this.tileSize);
        const otherY = Math.floor(otherPlayer.y / this.tileSize);
        
        const distance = Math.sqrt(
          Math.pow(this.playerTileX - otherX, 2) + 
          Math.pow(this.playerTileY - otherY, 2)
        );
        
        // Match the fog of war radius (2)
        const visibilityRadius = 2;
        
        if (distance <= visibilityRadius) {
          otherPlayer.setVisible(true);
        } else {
          otherPlayer.setVisible(false);
        }
      } else {
        // Non-seekers can see all other players
        otherPlayer.setVisible(true);
      }
    });
  }

  addOtherPlayer(id, x, y, isSeeker = false) {
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
      .setTint(isSeeker ? 0xff0000 : 0x00ff00); // Red for seeker, green for hider
    
    other.play("idle");
    this.otherPlayers[id] = other;
    
    // Set initial visibility
    this.updatePlayerVisibility();
  }
}