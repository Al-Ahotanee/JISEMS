import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useSelector } from 'react-redux';
import { RootState } from '../store';

let socket: Socket | null = null;
let socketAuthToken: string | null = null;

export const useSocket = () => {
  const accessToken = useSelector((state: RootState) => state.auth.accessToken);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const nextToken = accessToken || null;

    if (!socket) {
      socketAuthToken = nextToken;
      socket = io(window.location.origin, {
        auth: { token: nextToken || undefined },
        transports: ['websocket', 'polling'],
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
      });
    } else if (socketAuthToken !== nextToken) {
      socketAuthToken = nextToken;
      socket.auth = { token: nextToken || undefined };
      if (socket.connected) socket.disconnect();
      socket.connect();
    }

    socketRef.current = socket;

    return () => {
      // Keep the shared connection alive while mounted components change.
    };
  }, [accessToken]);

  const joinElection = useCallback((electionId: number) => {
    socket?.emit('join:election', electionId);
  }, []);

  const leaveElection = useCallback((electionId: number) => {
    socket?.emit('leave:election', electionId);
  }, []);

  const joinLGA = useCallback((lgaId: number) => {
    socket?.emit('join:lga', lgaId);
  }, []);

  const joinWard = useCallback((wardId: number) => {
    socket?.emit('join:ward', wardId);
  }, []);

  const onEvent = useCallback((event: string, handler: (...args: unknown[]) => void) => {
    socket?.on(event, handler);
    return () => {
      socket?.off(event, handler);
    };
  }, []);

  return {
    socket: socketRef.current,
    joinElection,
    leaveElection,
    joinLGA,
    joinWard,
    onEvent,
    isConnected: socket?.connected ?? false,
  };
};
