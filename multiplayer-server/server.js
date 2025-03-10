// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Structure of rooms:
// {
//   [roomCode]: {
//     players: [socketId1, socketId2],
//     currentTurn: socketId,
//     timers: {
//       [socketId1]: timeLeft,
//       [socketId2]: timeLeft
//     }
//   }
// }
const rooms = {};

app.use(express.static('public'));

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Create new room
  socket.on('createRoom', () => {
    const roomCode = Math.random().toString(36).substr(2, 6).toUpperCase();
    rooms[roomCode] = { 
      players: [socket.id],
      currentTurn: socket.id,
      timers: {
        [socket.id]: 250, // Only the creator's timer for now
      }
    };
    socket.join(roomCode);
    socket.emit('roomCreated', { 
      room: roomCode, 
      player: 1,
      initialTime: 250
    });
    console.log(`Room created: ${roomCode}`);
  });

  // Join existing room
  socket.on("joinRoom", ({ room }) => {
    if (rooms[room] && rooms[room].players.length < 2) {
      rooms[room].players.push(socket.id);
      socket.join(room);
      
      // Add second player's timer without overwriting the first
      rooms[room].timers[socket.id] = 250;

      // Tell the new socket it joined as player 2
      socket.emit("roomJoined", { 
        room,
        currentTurn: rooms[room].currentTurn,
        newPlayer: 2,
        initialTime: 250
      });

      // If room now has 2 players, start the game
      if (rooms[room].players.length === 2) {
        io.to(room).emit("startGame", { 
          room,
          currentTurn: rooms[room].currentTurn,
          timers: rooms[room].timers,
          players: rooms[room].players
        });        
      }
    } else {
      socket.emit("error", { message: "Room is full or does not exist." });
    }
  });

  // Handle a player's action (e.g. submitting an answer)
  socket.on('playerAction', (data) => {
    const { room, action, currentTime } = data;
    if (!rooms[room] || rooms[room].currentTurn !== socket.id) return;

    // Update current player's remaining time
    rooms[room].timers[socket.id] = currentTime;

    // Switch turn to the other player
    const otherPlayer = rooms[room].players.find(player => player !== socket.id);
    rooms[room].currentTurn = otherPlayer;

    io.to(room).emit('turnChanged', { 
      currentTurn: otherPlayer,
      timers: rooms[room].timers
    });
  });

  // Handle incremental timer updates
  socket.on('updateTimer', ({ room, timeLeft }) => {
    if (rooms[room]) {
      rooms[room].timers[socket.id] = timeLeft;
    }
  });

  // Broadcast moves or actions to the opponent
  socket.on('playerMove', (data) => {
    socket.to(data.room).emit('playerMove', data);
  });

  // Handle disconnects
  socket.on('disconnect', () => {
    for (const room in rooms) {
      if (rooms[room].players.includes(socket.id)) {
        rooms[room].players = rooms[room].players.filter(player => player !== socket.id);
        
        // If the disconnecting player had the current turn, give it to whoever remains
        if (rooms[room].currentTurn === socket.id && rooms[room].players.length > 0) {
          const remainingPlayer = rooms[room].players[0];
          rooms[room].currentTurn = remainingPlayer;
          io.to(room).emit('turnChanged', { 
            currentTurn: remainingPlayer,
            timeLeft: rooms[room].timers[remainingPlayer]
          });
        }
        
        // If nobody left in the room, remove the room entirely
        if (rooms[room].players.length === 0) {
          delete rooms[room];
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
