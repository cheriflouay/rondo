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

  // Create a new room and set the first player as the active turn
  socket.on('createRoom', () => {
    const roomCode = Math.random().toString(36).substr(2, 6).toUpperCase();
    rooms[roomCode] = { 
      players: [socket.id],
      currentTurn: socket.id  // first player gets the turn
    };
    socket.join(roomCode);
    console.log(`Room created: ${roomCode}`);
    socket.emit('roomCreated', { room: roomCode });
  });

  // Join an existing room
  socket.on("joinRoom", ({ room }) => {
    if (rooms[room] && rooms[room].players.length < 2) {
      rooms[room].players.push(socket.id);
      socket.join(room);
      console.log(`Player joined room: ${room}`);
      
      // Inform all players that someone has joined along with current turn info
      io.to(room).emit("roomJoined", { 
        room, 
        players: rooms[room].players, 
        currentTurn: rooms[room].currentTurn 
      });

      // Start the game when both players have joined
      if (rooms[room].players.length === 2) {
        io.to(room).emit("startGame", { 
          room, 
          currentTurn: rooms[room].currentTurn 
        });
        console.log(`Game started in room: ${room}`);
      }
    } else {
      socket.emit("error", { message: "Room is full or does not exist." });
    }
  });

  // Optional: Handle player moves (if needed for your game)
  socket.on('playerMove', (data) => {
    // Broadcast the move to other players in the same room
    socket.to(data.room).emit('playerMove', data);
  });

  // Handle player actions that require a turn change (e.g., skip or wrong answer)
  socket.on('playerAction', (data) => {
    const { room, action } = data;
    if (!rooms[room]) return;
    
    // Ensure that the player performing the action is the one whose turn it is
    if (rooms[room].currentTurn !== socket.id) return;
    
    // Check for valid actions that cause turn changes
    if (action === 'skip' || action === 'wrongAnswer') {
      // Find the other player in the room
      const otherPlayer = rooms[room].players.find(player => player !== socket.id);
      if (otherPlayer) {
        rooms[room].currentTurn = otherPlayer;
        io.to(room).emit('turnChanged', { currentTurn: otherPlayer });
        console.log(`Turn changed in room ${room} to ${otherPlayer}`);
      }
    }
  });

  // Handle disconnects and clean up rooms
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    for (const room in rooms) {
      if (rooms[room].players.includes(socket.id)) {
        // Remove the player from the room's player list
        rooms[room].players = rooms[room].players.filter(player => player !== socket.id);
        // If the disconnected player was the current turn, assign the turn to the remaining player (if any)
        if (rooms[room].currentTurn === socket.id && rooms[room].players.length > 0) {
          rooms[room].currentTurn = rooms[room].players[0];
          io.to(room).emit('turnChanged', { currentTurn: rooms[room].currentTurn });
        }
        // Delete the room if no players remain
        if (rooms[room].players.length === 0) {
          delete rooms[room];
          console.log(`Room ${room} deleted`);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
