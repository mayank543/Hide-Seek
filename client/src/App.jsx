import React, { useState } from 'react';
import JoinScreen from './components/JoinScreen';
import Game from './components/Game';

function App() {
  const [joined, setJoined] = useState(false);
  const [playerName, setPlayerName] = useState('');

  return (
    <>
      {!joined ? (
        <JoinScreen onJoin={(name) => {
          setPlayerName(name);
          setJoined(true);
        }} />
      ) : (
        <Game playerName={playerName} />
      )}
    </>
  );
}

export default App;