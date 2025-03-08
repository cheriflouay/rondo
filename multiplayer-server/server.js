// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const rooms = {}; // Object to store active rooms and their players

// Serve static files (assuming your client is in the "public" folder)
app.use(express.static('public'));

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Create a new room
  socket.on('createRoom', () => {
    const roomCode = Math.random().toString(36).substr(2, 6).toUpperCase();
    rooms[roomCode] = { players: [socket.id] };
    socket.join(roomCode);
    console.log(`Room created: ${roomCode}`);
    socket.emit('roomCreated', { room: roomCode });
  });
  

  socket.on("joinRoom", ({ room }) => {
    if (rooms[room] && rooms[room].players.length < 2) {
        rooms[room].players.push(socket.id);
        socket.join(room);
        console.log(`Player joined room: ${room}`);
        io.to(room).emit("roomJoined", { room });

        // Start the game when both players join
        if (rooms[room].players.length === 2) {
            io.to(room).emit("startGame", { room });
            console.log(`Game started in room: ${room}`);
        }
    } else {
        socket.emit("error", { message: "Room is full or does not exist." });
    }
});

  

  // Handle player moves
  socket.on('playerMove', (data) => {
    // Broadcast the move to other players in the same room
    socket.to(data.room).emit('playerMove', data);
  });

  // Handle disconnects and clean up rooms
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    // Remove the disconnected player from any room they were in
    for (const room in rooms) {
      rooms[room].players = rooms[room].players.filter(player => player !== socket.id);
      if (rooms[room].players.length === 0) {
        delete rooms[room];
        console.log(`Room ${room} deleted`);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
