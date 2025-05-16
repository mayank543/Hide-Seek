// client/src/JoinScreen.jsx

import React, { useState, useEffect } from "react";
import { useSocket } from "../hooks/useSocket";

function JoinScreen({ onJoin }) {
  const { socket, isConnected } = useSocket();
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);

  const handleJoin = () => {
    if (name.trim() && socket.current) {
  socket.current.emit("player-join", { name });
      onJoin(name);
      setJoined(true);
    }
  };

  useEffect(() => {
    if (!socket.current) return;

socket.current.on("welcome", (data) => {
  console.log("📩 Server says:", data);
});

    return () => {
      if (socket.current) {
  socket.current.off("welcome");
}
    };
  }, [socket]);

  return (
    <div className="h-screen flex items-center justify-center bg-gray-900 text-white">
      {!joined ? (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg space-y-4">
          <h1 className="text-2xl font-bold">Join Game</h1>
          <input
            type="text"
            placeholder="Enter your name"
            className="p-2 w-full rounded text-black"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            onClick={handleJoin}
            className={`w-full ${
              isConnected ? "bg-green-500 hover:bg-green-600" : "bg-gray-500"
            } text-white font-bold py-2 px-4 rounded`}
            disabled={!isConnected}
          >
            {isConnected ? "Join" : "Connecting..."}
          </button>
        </div>
      ) : (
        <div>
          <h2 className="text-xl font-bold">Hello, {name}!</h2>
          <p>You're connected to the game server.</p>
        </div>
      )}
    </div>
  );
}

export default JoinScreen;