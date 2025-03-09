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

  // Create a new room and assign the first player as player 1
  socket.on('createRoom', () => {
    const roomCode = Math.random().toString(36).substr(2, 6).toUpperCase();
    rooms[roomCode] = { 
      players: [socket.id],
      currentTurn: socket.id  // using socket id for turn tracking
    };
    socket.join(roomCode);
    console.log(`Room created: ${roomCode}`);
    // Send room code and assign player number 1
    socket.emit('roomCreated', { room: roomCode, player: 1 });
  });

  // Join an existing room and assign the joining player as player 2
  socket.on("joinRoom", ({ room }) => {
    if (rooms[room] && rooms[room].players.length < 2) {
      rooms[room].players.push(socket.id);
      socket.join(room);
      console.log(`Player joined room: ${room}`);
      
      // Determine player number based on order in the room
      const playerNumber = rooms[room].players.indexOf(socket.id) + 1;
      
      // Inform all players in the room (include new player's number)
      io.to(room).emit("roomJoined", { 
        room, 
        players: rooms[room].players, 
        currentTurn: rooms[room].currentTurn,
        newPlayer: playerNumber 
      });

      // Start the game when two players have joined
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

  // Handle player actions (skip or wrong answer)
  socket.on('playerAction', (data) => {
    const { room, action } = data;
    if (!rooms[room]) return;
  
    if (rooms[room].currentTurn !== socket.id) return; // Only allow action from the active player
  
    if (action === 'skip' || action === 'wrongAnswer') {
      // Find the other player in the room
      const otherPlayer = rooms[room].players.find(player => player !== socket.id);
      if (otherPlayer) {
        rooms[room].currentTurn = otherPlayer;
  
        // Reset timer for the next player and send update
        io.to(room).emit('turnChanged', { currentTurn: otherPlayer });
        io.to(room).emit('updateTimer', { currentTurn: otherPlayer, timeLeft: 250 });
  
        console.log(`Turn changed in room ${room} to ${otherPlayer}`);
      }
    }
  });
  

  // Handle player moves (for correct answers)
  socket.on('playerMove', (data) => {
    // Broadcast the move to other players in the same room
    socket.to(data.room).emit('playerMove', data);
  });

  // Handle disconnects and clean up rooms
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    for (const room in rooms) {
      if (rooms[room].players.includes(socket.id)) {
        rooms[room].players = rooms[room].players.filter(player => player !== socket.id);
        // If the disconnected player held the turn, assign it to the remaining player
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
