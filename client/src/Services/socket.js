import { io } from "socket.io-client";

const socketUrl =
  process.env.REACT_APP_API_URL ||
  "http://localhost:5000";

export const createTrackingSocket = () => io(socketUrl, {
  autoConnect: false,
  transports: [
    "websocket",
    "polling",
  ],
  withCredentials: true,
});

const socket = createTrackingSocket();

export default socket;
