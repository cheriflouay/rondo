// script.js
import { getDatabase, ref, child, get, push } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { app, db } from "./firebase-config.js";

// -----------------------
// Socket.IO Integration
// -----------------------
const socket = io(); // Connect to your Socket.IO server
let currentRoom = null; // Will hold the current room code
let myPlayerNumber = null; // Will be 1 or 2 depending on assignment
let currentTurnSocketId = null; // Active socket id as provided by the server

// When a room is created, display the room code. Creator is always player 1.
socket.on('roomCreated', (data) => {
  currentRoom = data.room;
  myPlayerNumber = 1;
  const roomDisplay = document.getElementById('room-code-display');
  roomDisplay.textContent = `Room Code: ${data.room}`;
  roomDisplay.style.display = 'block';
  console.log("Room created:", data.room);
});

// When a player joins a room, update the room display and assign player number.
socket.on('roomJoined', (data) => {
  currentRoom = data.room;
  // Determine player number based on room players array sent from server
  myPlayerNumber = (data.players[0] === socket.id) ? 1 : 2;
  const roomDisplay = document.getElementById('room-code-display');
  roomDisplay.textContent = `Joined Room: ${data.room}`;
  roomDisplay.style.display = 'block';
  console.log("Room joined:", data.room);
});

// When the game starts, set the active turn from the server, hide the lobby, and load questions.
socket.on("startGame", ({ room, currentTurn }) => {
  currentRoom = room;
  currentTurnSocketId = currentTurn;
  console.log(`Game started in room: ${room}, current turn: ${currentTurn}`);
  document.getElementById("lobby").style.display = "none";
  document.getElementById("game-container").style.display = "block";
  fetchQuestions();
  updateTurnUI();
});

// When the turn changes, update the active turn and adjust UI controls.
socket.on('turnChanged', ({ currentTurn }) => {
  currentTurnSocketId = currentTurn;
  console.log("Turn changed. New active socket:", currentTurn);
  updateTurnUI();
});

// Listen for moves from the server (if you need to sync other game state)
socket.on('playerMove', (data) => {
  console.log("Received move from player", data.playerId, ":", data);
  // You can update additional shared state here if needed.
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
// Game State & Variables
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
let isPaused = false;  // This is still here but we will hide its button.
let player1Queue = [...alphabet];
let player2Queue = [...alphabet];

// DOM Elements
const questionElement = document.getElementById('question');
const time1Element = document.getElementById('time1');
const time2Element = document.getElementById('time2');
const answerInput = document.getElementById('answer-input');
const player1Circle = document.getElementById('player1-circle');
const player2Circle = document.getElementById('player2-circle');

// Hide the pause button since it's not needed
document.addEventListener('DOMContentLoaded', () => {
  const pauseButton = document.getElementById('pause-btn');
  if (pauseButton) {
    pauseButton.style.display = 'none';
  }
});

// Event Listeners for game actions
document.getElementById('skip-btn').addEventListener('click', skipTurn);
document.getElementById('submit-answer').addEventListener('click', checkAnswer);
document.getElementById('restart-btn').addEventListener('click', restartGame);
// Note: The pause button is hidden, so its listener is not needed.
answerInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') checkAnswer();
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

function startGame() {
  // This function is now handled by the 'startGame' socket event.
  console.log("Starting the game...");
  document.getElementById('lobby').style.display = 'none';
  document.getElementById('game-container').style.display = 'block';
  fetchQuestions();
}

// -----------------------
// Game Initialization
// -----------------------
function initializeGame() {
  // Reset queues for the current player based on assigned number.
  if (myPlayerNumber === 1) {
    player1Queue = [...alphabet];
  } else {
    player2Queue = [...alphabet];
  }
  generateAlphabetCircles();
  startTimer();
  loadNextQuestion();
}

function generateAlphabetCircles() {
  // Only generate and display the circle for the current player.
  if (myPlayerNumber === 1) {
    player1Circle.style.display = 'block';
    player2Circle.style.display = 'none';
    document.getElementById('alphabet-circle-1').innerHTML = '';
    generateAlphabetCircle('alphabet-circle-1', player1Questions, 1);
  } else {
    player2Circle.style.display = 'block';
    player1Circle.style.display = 'none';
    document.getElementById('alphabet-circle-2').innerHTML = '';
    generateAlphabetCircle('alphabet-circle-2', player2Questions, 2);
  }
}

function generateAlphabetCircle(circleId, questions, playerNumber) {
  const circle = document.getElementById(circleId);
  const containerWidth = circle.parentElement.offsetWidth;
  const radius = containerWidth * 0.48;
  const centerX = containerWidth / 2;
  const centerY = containerWidth / 2;

  alphabet.forEach((letter, index) => {
    const angle = (index / alphabet.length) * Math.PI * 2 - Math.PI/2;
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
  const circleId = (myPlayerNumber === 1) ? 'alphabet-circle-1' : 'alphabet-circle-2';
  const circle = document.getElementById(circleId);
  const letters = circle.querySelectorAll('.letter');
  const currentQueue = (myPlayerNumber === 1) ? player1Queue : player2Queue;
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
      // Only update local timer if it's this player's turn
      if (myPlayerNumber === 1 && socket.id === currentTurnSocketId) {
        timeLeftPlayer1--;
        if (timeLeftPlayer1 <= 0) {
          timeLeftPlayer1 = 0;
          time1Element.textContent = timeLeftPlayer1;
          socket.emit('playerAction', { room: currentRoom, action: 'timeout' });
          return;
        }
        time1Element.textContent = timeLeftPlayer1;
      } else if (myPlayerNumber === 2 && socket.id === currentTurnSocketId) {
        timeLeftPlayer2--;
        if (timeLeftPlayer2 <= 0) {
          timeLeftPlayer2 = 0;
          time2Element.textContent = timeLeftPlayer2;
          socket.emit('playerAction', { room: currentRoom, action: 'timeout' });
          return;
        }
        time2Element.textContent = timeLeftPlayer2;
      }
    }
  }, 1000);
}

function skipTurn() {
  // Only allow skip if it is your turn
  if (socket.id !== currentTurnSocketId) return;
  
  // Update your local queue for the current player by moving the current letter to the back.
  if (myPlayerNumber === 1) {
    player1Queue.push(player1Queue.shift());
  } else {
    player2Queue.push(player2Queue.shift());
  }
  
  // Emit the skip action to the server so it can change the turn.
  socket.emit('playerAction', { room: currentRoom, action: 'skip' });
}

function loadQuestion(letter, playerNumber) {
  currentQuestion = (playerNumber === 1) ? player1Questions[letter] : player2Questions[letter];
  const currentLang = document.getElementById('languageSwitcher').value;
  questionElement.textContent = (currentQuestion && currentQuestion.question && currentQuestion.question[currentLang])
    ? currentQuestion.question[currentLang]
    : "Question not found";
}

function checkAnswer() {
  // Only process the answer if it is your turn
  if (socket.id !== currentTurnSocketId) return;

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
    // Update score locally
    if (myPlayerNumber === 1) {
      player1Score++;
      document.getElementById(`score1`).textContent = player1Score;
      player1Queue.shift();
    } else {
      player2Score++;
      document.getElementById(`score2`).textContent = player2Score;
      player2Queue.shift();
    }
    selectedLetter.classList.add('correct', 'used');
    correctSound.play();
    // Stay on the same turn since the answer was correct.
    loadNextQuestion();
  } else {
    selectedLetter.classList.add('incorrect', 'used');
    incorrectSound.play();
    // For a wrong answer, update the queue (move current letter to the back)
    if (myPlayerNumber === 1) {
      player1Queue.push(player1Queue.shift());
    } else {
      player2Queue.push(player2Queue.shift());
    }
    // Emit the wrong answer action so the server changes the turn.
    socket.emit('playerAction', { room: currentRoom, action: 'wrongAnswer' });
    // Do not load next question locally now; wait until your turn returns.
  }

  // Emit the move for synchronization (optional)
  socket.emit('playerMove', {
    room: currentRoom,
    playerId: myPlayerNumber,
    answer: userAnswer,
    isCorrect: isCorrect
  });

  answerInput.value = "";
  checkEndGame();
}

function loadNextQuestion() {
  const currentQueue = (myPlayerNumber === 1) ? player1Queue : player2Queue;
  if (currentQueue.length === 0) {
    endGame();
    return;
  }
  const nextLetter = currentQueue[0];
  loadQuestion(nextLetter, myPlayerNumber);
  activateCurrentLetter();
  answerInput.focus();
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
  if (myPlayerNumber === 1) {
    player1Queue = [...alphabet];
  } else {
    player2Queue = [...alphabet];
  }
  document.getElementById('time1').textContent = 250;
  document.getElementById('time2').textContent = 250;
  document.getElementById('score1').textContent = 0;
  document.getElementById('score2').textContent = 0;
  document.getElementById('result').style.display = 'none';
  // Reset letters’ classes
  document.querySelectorAll('.letter').forEach(letter => {
    letter.classList.remove('correct', 'incorrect', 'used', 'active');
  });
  fetchQuestions();
}

// -----------------------
// UI Helpers
// -----------------------
function updateTurnUI() {
  // Enable controls only if it's your turn
  if (socket.id === currentTurnSocketId) {
    answerInput.disabled = false;
    document.getElementById('submit-answer').disabled = false;
    document.getElementById('skip-btn').disabled = false;
  } else {
    answerInput.disabled = true;
    document.getElementById('submit-answer').disabled = true;
    document.getElementById('skip-btn').disabled = true;
  }
  // Optionally, you can also adjust the display of your alphabet circle here if desired.
}

// -----------------------
// Language Switching
// -----------------------
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
