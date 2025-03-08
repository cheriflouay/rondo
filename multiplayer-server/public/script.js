// -----------------------
// Firebase & Socket.IO Imports
// -----------------------
import { getDatabase, ref, child, get, push } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { app, db } from "./firebase-config.js";

// -----------------------
// Global Variables for Multiplayer
// -----------------------
let myPlayer = null;       // Will be assigned as 1 or 2 when the room is created/joined
let currentRoom = null;    // Current room code
let currentPlayer = null;  // Whose turn it is (set by server)

// -----------------------
// Landing Page Navigation
// -----------------------
document.getElementById('multiplayer')?.addEventListener('click', function() {
  document.getElementById('landing-page').style.display = 'none';
  document.getElementById('lobby').style.display = 'block';
});

document.getElementById('same-screen')?.addEventListener('click', function() {
  document.getElementById('landing-page').style.display = 'none';
  document.getElementById('game-container').style.display = 'block';
  // For same-screen mode, start game immediately (this client runs the full game logic)
  startGame();
});

// -----------------------
// Socket.IO Integration
// -----------------------
const socket = io(); // Connect to your Socket.IO server

// When a room is created, assign the creator as Player 1.
socket.on('roomCreated', (data) => {
  currentRoom = data.room;
  myPlayer = 1; // Creator is Player 1
  const roomDisplay = document.getElementById('room-code-display');
  roomDisplay.textContent = `Room Code: ${data.room}`;
  roomDisplay.style.display = 'block';
  console.log("Room created:", data.room);
  // Wait for the second player before starting the game.
});

// When a player joins a room, assign them as Player 2 (or as sent by server).
socket.on('roomJoined', (data) => {
  currentRoom = data.room;
  myPlayer = data.player; // Server sends the assigned player (typically 2)
  const roomDisplay = document.getElementById('room-code-display');
  roomDisplay.textContent = `Joined Room: ${data.room} as Player ${myPlayer}`;
  roomDisplay.style.display = 'block';
  console.log("Room joined:", data.room, "as Player", myPlayer);
  // Wait for server to signal game start.
});

// When the server signals to start the game, it sends along which player starts.
socket.on("startGame", ({ room, startingPlayer }) => {
  console.log(`Game started in room: ${room}`);
  currentPlayer = startingPlayer; // Set starting turn
  // Hide the lobby and show the game UI
  document.getElementById("lobby").style.display = "none";
  document.getElementById("game-container").style.display = "block";
  fetchQuestions();  
});

// Listen for turn switches broadcasted by the server.
socket.on('switchTurn', (data) => {
  currentPlayer = data.currentPlayer; // Use the server-provided turn info
  console.log("Switch turn to Player", currentPlayer);
  loadNextQuestion(); // Refresh question for the new turn
  // Enable input only if it’s this client's turn.
  answerInput.disabled = (currentPlayer !== myPlayer);
});

// Listen for moves from the server (from the other player)
socket.on('playerMove', (data) => {
  if (data.playerId !== myPlayer) {
    console.log("Received move from opponent:", data);
    // Update opponent's state (score and queue) based on the move
    if (data.playerId === 1) {
      player1Queue.shift();
      player1Score++;
      document.getElementById('score1').textContent = player1Score;
    } else {
      player2Queue.shift();
      player2Score++;
      document.getElementById('score2').textContent = player2Score;
    }
  }
});

// -----------------------
// Room Creation / Joining UI
// -----------------------
document.getElementById('create-room-btn').addEventListener('click', () => {
  socket.emit('createRoom');
});

document.getElementById('join-room-btn').addEventListener('click', () => {
  const roomCode = document.getElementById('room-code-input').value.trim();
  if (roomCode) {
    socket.emit('joinRoom', { room: roomCode });
  }
});

// -----------------------
// Game State & Variables (Local copies per client)
// -----------------------
let timeLeftPlayer1 = 250;
let timeLeftPlayer2 = 250;
let timerInterval = null;
let player1Questions = {};
let player2Questions = {};
let currentQuestion = null;
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
let selectedLetter = null;
let player1Score = 0;
let player2Score = 0;
let isPaused = false;
let player1Queue = [...alphabet];
let player2Queue = [...alphabet];

// DOM Elements
const questionElement = document.getElementById('question');
const time1Element = document.getElementById('time1');
const time2Element = document.getElementById('time2');
const answerInput = document.getElementById('answer-input');
const player1Circle = document.getElementById('player1-circle');
const player2Circle = document.getElementById('player2-circle');

// Sound Elements
const correctSound = document.getElementById('correct-sound');
const incorrectSound = document.getElementById('incorrect-sound');
const gameOverSound = document.getElementById('game-over-sound');

// -----------------------
// Helper Function: Switch Turn
// -----------------------
// MODIFIED: Instead of toggling turn locally and calling loadNextQuestion,
// we simply emit a switch-turn event and let the server broadcast the update.
function emitSwitchTurn() {
  socket.emit('switchTurn', { room: currentRoom });
}

// -----------------------
// Event Listeners for Game Actions (Only act if it's my turn)
// -----------------------
document.getElementById('skip-btn').addEventListener('click', () => {
  if (currentPlayer !== myPlayer) return;
  socket.emit('skipTurn', { room: currentRoom, player: myPlayer });
  emitSwitchTurn();
});

document.getElementById('submit-answer').addEventListener('click', () => {
  if (currentPlayer !== myPlayer) return;
  checkAnswer();
});

document.getElementById('restart-btn').addEventListener('click', restartGame);
document.getElementById('pause-btn').addEventListener('click', togglePause);
answerInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && currentPlayer === myPlayer) {
    checkAnswer();
  }
});

// -----------------------
// Firebase: Fetch Questions
// -----------------------
async function fetchQuestions() {
  try {
    const setsSnapshot = await get(child(ref(db), 'player_sets'));
    const sets = setsSnapshot.exists() ? setsSnapshot.val() : {};
    const setKeys = Object.keys(sets);
    // Randomly choose a set for each player from the common pool
    player1Questions = sets[setKeys[Math.floor(Math.random() * setKeys.length)]];
    player2Questions = sets[setKeys[Math.floor(Math.random() * setKeys.length)]];
    initializeGame();
  } catch (error) {
    console.error("Error loading questions:", error);
  }
}

// -----------------------
// Game Start Function (for Same Screen or Multiplayer local start)
// -----------------------
function startGame() {
  console.log("Starting the game...");
  document.getElementById('lobby').style.display = 'none';
  document.getElementById('game-container').style.display = 'block';
  fetchQuestions(); // Load questions and initialize game
}

// -----------------------
// Game Initialization
// -----------------------
function initializeGame() {
  // Reset queues locally for each player.
  player1Queue = [...alphabet];
  player2Queue = [...alphabet];
  generateAlphabetCircles();
  startTimer();
  loadNextQuestion();
}

// Modified: Show alphabet circle only for active player on this client.
function generateAlphabetCircles() {
  // Clear existing circles.
  document.getElementById('alphabet-circle-1').innerHTML = '';
  document.getElementById('alphabet-circle-2').innerHTML = '';
  
  // Generate new circles for both players.
  generateAlphabetCircle('alphabet-circle-1', player1Questions, 1);
  generateAlphabetCircle('alphabet-circle-2', player2Questions, 2);
  
  // Display only the active player's circle on this client.
  if (currentPlayer === myPlayer) {
    if (myPlayer === 1) {
      player1Circle.style.display = 'block';
      player2Circle.style.display = 'none';
    } else {
      player2Circle.style.display = 'block';
      player1Circle.style.display = 'none';
    }
  } else {
    // Hide both circles if it's not our turn.
    player1Circle.style.display = 'none';
    player2Circle.style.display = 'none';
  }
}

function generateAlphabetCircle(circleId, questions, playerNumber) {
  const circle = document.getElementById(circleId);
  const containerWidth = circle.parentElement.offsetWidth;
  const radius = containerWidth * 0.48;
  const centerX = containerWidth / 2;
  const centerY = containerWidth / 2;

  alphabet.forEach((letter, index) => {
    const angle = (index / alphabet.length) * Math.PI * 2 - Math.PI / 2;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    const letterDiv = document.createElement("div");
    letterDiv.className = "letter";
    letterDiv.textContent = letter;
    letterDiv.style.left = `${x}px`;
    letterDiv.style.top = `${y}px`;
    circle.appendChild(letterDiv);
  });
}

function activateCurrentLetter() {
  // Use the local player's queue based on myPlayer assignment.
  const currentQueue = (myPlayer === 1) ? player1Queue : player2Queue;
  // Get the circle corresponding to our player.
  const currentPlayerCircleId = (myPlayer === 1) ? 'alphabet-circle-1' : 'alphabet-circle-2';
  const circle = document.getElementById(currentPlayerCircleId);
  const letters = circle.querySelectorAll('.letter');
  const currentLetter = currentQueue[0];

  letters.forEach(letter => {
    letter.classList.remove('active');
    if (letter.textContent === currentLetter) {
      letter.classList.add('active');
      selectedLetter = letter;
    }
  });
}

function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!isPaused) {
      if (currentPlayer === 1) {
        timeLeftPlayer1--;
        if (timeLeftPlayer1 <= 0) {
          timeLeftPlayer1 = 0;
          time1Element.textContent = timeLeftPlayer1;
          emitSwitchTurn();
          return;
        }
      } else {
        timeLeftPlayer2--;
        if (timeLeftPlayer2 <= 0) {
          timeLeftPlayer2 = 0;
          time2Element.textContent = timeLeftPlayer2;
          emitSwitchTurn();
          return;
        }
      }
      time1Element.textContent = timeLeftPlayer1;
      time2Element.textContent = timeLeftPlayer2;
    }
  }, 1000);
}

function loadQuestion(letter, playerNumber) {
  currentQuestion = (playerNumber === 1) ? player1Questions[letter] : player2Questions[letter];
  const currentLang = document.getElementById('languageSwitcher').value;
  questionElement.textContent = (currentQuestion && currentQuestion.question && currentQuestion.question[currentLang])
    ? currentQuestion.question[currentLang]
    : "Question not found";
}

function checkAnswer() {
  if (currentPlayer !== myPlayer) return;
  const userAnswer = answerInput.value.trim().toLowerCase();
  if (!userAnswer || !currentQuestion) return;

  let isCorrect = false;
  const correctAnswers = Object.values(currentQuestion.answer).map(ans => ans.toLowerCase());
  for (const ans of correctAnswers) {
    const ansWords = ans.split(/\s+/);
    if (userAnswer === ans || ansWords.includes(userAnswer)) {
      isCorrect = true;
      break;
    }
  }

  if (isCorrect) {
    if (myPlayer === 1) {
      player1Score++;
      document.getElementById('score1').textContent = player1Score;
      player1Queue.shift();
    } else {
      player2Score++;
      document.getElementById('score2').textContent = player2Score;
      player2Queue.shift();
    }
    selectedLetter.classList.add('correct', 'used');
    correctSound.play();
  } else {
    selectedLetter.classList.add('incorrect', 'used');
    incorrectSound.play();
    if (myPlayer === 1) {
      player1Queue.push(player1Queue.shift());
    } else {
      player2Queue.push(player2Queue.shift());
    }
  }

  // Emit move to server for synchronization.
  socket.emit('playerMove', {
    room: currentRoom,
    playerId: myPlayer,
    answer: userAnswer,
    isCorrect: isCorrect
  });

  answerInput.value = "";
  checkEndGame();
  // Instead of switching turn locally, notify the server.
  emitSwitchTurn();
}

function loadNextQuestion() {
  // Load the next question for the local player based on their own queue.
  const currentQueue = (myPlayer === 1) ? player1Queue : player2Queue;
  if (currentQueue.length === 0) {
    endGame();
    return;
  }
  const nextLetter = currentQueue[0];
  loadQuestion(nextLetter, myPlayer);
  
  // Display the alphabet circle only if it's our turn.
  if (currentPlayer === myPlayer) {
    if (myPlayer === 1) {
      player1Circle.style.display = 'block';
    } else {
      player2Circle.style.display = 'block';
    }
    activateCurrentLetter();
    answerInput.disabled = false;
    answerInput.focus();
  } else {
    // Hide the alphabet circle if it's not our turn.
    if (myPlayer === 1) {
      player1Circle.style.display = 'none';
    } else {
      player2Circle.style.display = 'none';
    }
    answerInput.disabled = true;
  }
}

function checkEndGame() {
  const p1Done = player1Queue.length === 0;
  const p2Done = player2Queue.length === 0;
  if (p1Done || p2Done) {
    endGame();
  }
}

function endGame() {
  clearInterval(timerInterval);
  gameOverSound.play();
  answerInput.disabled = true;
  document.getElementById('submit-answer').disabled = true;
  document.getElementById('skip-btn').disabled = true;
  document.getElementById('result').style.display = 'block';
  document.getElementById('score1').textContent = player1Score;
  document.getElementById('score2').textContent = player2Score;

  push(ref(db, 'leaderboard'), {
    player1Score,
    player2Score,
    timestamp: new Date().toISOString()
  });

  const winnerElement = document.getElementById('winner-message');
  if (player1Score > player2Score) winnerElement.textContent = "Player 1 Wins! 🏆";
  else if (player2Score > player1Score) winnerElement.textContent = "Player 2 Wins! 🏆";
  else winnerElement.textContent = "It's a Draw! 🤝";
}

function restartGame() {
  clearInterval(timerInterval);
  timeLeftPlayer1 = 250;
  timeLeftPlayer2 = 250;
  player1Score = 0;
  player2Score = 0;
  isPaused = false;
  player1Queue = [...alphabet];
  player2Queue = [...alphabet];
  document.getElementById('time1').textContent = 250;
  document.getElementById('time2').textContent = 250;
  document.getElementById('score1').textContent = 0;
  document.getElementById('score2').textContent = 0;
  document.getElementById('result').style.display = 'none';
  document.getElementById('pause-btn').textContent = 'Pause';
  document.querySelectorAll('.letter').forEach(letter => {
    letter.classList.remove('correct', 'incorrect', 'used', 'active');
  });
  answerInput.disabled = false;
  document.getElementById('submit-answer').disabled = false;
  document.getElementById('skip-btn').disabled = false;
  fetchQuestions();
}

function togglePause() {
  isPaused = !isPaused;
  document.getElementById('pause-btn').textContent = isPaused ? 'Resume' : 'Pause';
}

function loadLanguage(lang) {
  fetch(`${lang}.json`)
    .then(response => response.json())
    .then(translations => {
      document.querySelectorAll('[data-i18n]').forEach(elem => {
        const key = elem.getAttribute('data-i18n');
        if (translations[key]) {
          elem.textContent = translations[key];
        }
      });
      const answerInput = document.getElementById('answer-input');
      if (answerInput && translations["answerPlaceholder"]) {
        answerInput.placeholder = translations["answerPlaceholder"];
      }
      document.documentElement.lang = lang;
      document.documentElement.dir = (lang === 'ar') ? 'rtl' : 'ltr';
    })
    .catch(err => console.error("Error loading language file:", err));
}
  
document.getElementById('languageSwitcher').addEventListener('change', (event) => {
  loadLanguage(event.target.value);
});
  
document.addEventListener("DOMContentLoaded", () => {
  loadLanguage("en");
});
