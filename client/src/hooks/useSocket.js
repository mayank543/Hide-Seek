import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

// Create a singleton socket instance outside of React's lifecycle
let globalSocket = null;

const SOCKET_URL = "http://localhost:3000";

export const useSocket = () => {
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Create the socket only once across all components
    if (!globalSocket) {
      console.log("Creating new global socket connection");
      globalSocket = io(SOCKET_URL, {
        transports: ["websocket"],
        reconnectionAttempts: 3,
      });
    }
    
    // Use the global socket
    socketRef.current = globalSocket;

    // Set up event listeners for this component instance
    const onConnect = () => {
      console.log("🟢 Connected:", socketRef.current?.id ?? "(no id yet)");
      setIsConnected(true);
    };

    const onDisconnect = () => {
      console.log("🔴 Disconnected");
      setIsConnected(false);
    };

    // Register event handlers
    socketRef.current.on("connect", onConnect);
    socketRef.current.on("disconnect", onDisconnect);
    
    // If already connected, update state accordingly
    if (socketRef.current.connected) {
      console.log("Socket already connected:", socketRef.current.id);
      setIsConnected(true);
    }

    // Cleanup function - only remove event listeners, DON'T disconnect
    return () => {
      console.log("Cleaning up event listeners only");
      if (socketRef.current) {
        socketRef.current.off("connect", onConnect);
        socketRef.current.off("disconnect", onDisconnect);
        // DO NOT disconnect here
      }
    };
  }, []);

  return { socket: socketRef, isConnected };
};