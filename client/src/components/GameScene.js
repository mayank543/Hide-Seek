export default class GameScene extends Phaser.Scene {
  constructor() {
    super("GameScene");
  }

  preload() {
    // Load tile spritesheet and player spritesheet
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
    this.tileSize = 64; // Increased size for better visibility

    // Create map and tiles
    this.map = [];
    this.tiles = [];
    for (let y = 0; y < this.mapSize; y++) {
      this.map[y] = [];
      for (let x = 0; x < this.mapSize; x++) {
        const isWall = Math.random() < 0.2; // 20% chance of wall
        this.map[y][x] = isWall ? 1 : 0;

        const frame = isWall ? 1 : 0; // frame 1 = wall, 0 = floor
        const tile = this.add
          .sprite(x * this.tileSize, y * this.tileSize, "tiles", frame)
          .setOrigin(0)
          .setDisplaySize(this.tileSize, this.tileSize);
        this.tiles.push(tile);
      }
    }

    // Create fog overlay on top of tiles
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

    // Add animated player sprite
    this.player = this.add
      .sprite(0, 0, "player", 0)
      .setDisplaySize(this.tileSize, this.tileSize); // match tile size

    this.anims.create({
      key: "idle",
      frames: this.anims.generateFrameNumbers("player", { start: 0, end: 3 }),
      frameRate: 6,
      repeat: -1,
    });

    this.player.play("idle");

    // Controls
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys("W,A,S,D");

    // Camera follows player
    this.cameras.main.startFollow(this.player);

    this.playerTileX = 1;
    this.playerTileY = 1;
    this.updatePlayerPosition();
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

    // Check bounds and wall collision
    if (
      moved &&
      nextX >= 0 &&
      nextX < this.mapSize &&
      nextY >= 0 &&
      nextY < this.mapSize &&
      this.map[nextY][nextX] === 0 // not a wall
    ) {
      this.playerTileX = nextX;
      this.playerTileY = nextY;
      this.updatePlayerPosition();
      this.updateFog();
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
          this.fogTiles[index].setAlpha(0); // Clear fog
        }
      }
    }
  }
}