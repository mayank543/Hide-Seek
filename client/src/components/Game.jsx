import React, { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import GameScene from './GameScene'; // 🧠 Import the external fog-of-war scene

function Game() {
  const gameRef = useRef(null);

  useEffect(() => {
    const config = {
      type: Phaser.AUTO,
      width: 800,
      height: 600,
      parent: gameRef.current,
      backgroundColor: '#1e1e1e',
      scene: [GameScene], // ✅ Use your fog-of-war scene here
    };

    const game = new Phaser.Game(config);

    return () => {
      game.destroy(true);
    };
  }, []);

  return <div ref={gameRef} className="flex justify-center items-center h-full" />;
}

export default Game;