// script.js
import { getDatabase, ref, child, get, push } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { app, db } from "./firebase-config.js";

// -----------------------
// Socket.IO Integration
// -----------------------
const socket = io(); // Connect to your Socket.IO server
let currentRoom = null; // Will hold the current room code

// When a room is created, display the room code but do not start the game immediately.
socket.on('roomCreated', (data) => {
  currentRoom = data.room;
  const roomDisplay = document.getElementById('room-code-display');
  roomDisplay.textContent = `Room Code: ${data.room}`;
  roomDisplay.style.display = 'block'; // Ensure the room code is visible
  console.log("Room created:", data.room);
  // Removed: startGame();
});

// When a player joins a room, update the room display but wait for the 'startGame' event.
socket.on('roomJoined', (data) => {
  currentRoom = data.room;
  const roomDisplay = document.getElementById('room-code-display');
  roomDisplay.textContent = `Joined Room: ${data.room}`;
  roomDisplay.style.display = 'block';
  console.log("Room joined:", data.room);
  // Removed: startGame();
});

socket.on("startGame", ({ room }) => {
  console.log(`Game started in room: ${room}`);

  // Hide the lobby and show the game UI
  document.getElementById("lobby").style.display = "none";
  document.getElementById("game-container").style.display = "block";

  // Fetch different questions for each player
  fetchQuestions();  
});



// Listen for moves from the server (from other players)
socket.on('playerMove', (data) => {
  console.log("Received move from player", data.playerId, ":", data);
  // Update game state accordingly (for example, update scores or switch turns)
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
let currentPlayer = 1;
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

// Event Listeners for game actions
document.getElementById('skip-btn').addEventListener('click', skipTurn);
document.getElementById('submit-answer').addEventListener('click', checkAnswer);
document.getElementById('restart-btn').addEventListener('click', restartGame);
document.getElementById('pause-btn').addEventListener('click', togglePause);
answerInput.addEventListener('keypress', (e) => e.key === 'Enter' && checkAnswer());

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
  console.log("Starting the game...");
  document.getElementById('lobby').style.display = 'none';  // Hide lobby
  document.getElementById('game-container').style.display = 'block';  // Show game
  fetchQuestions(); // Load the questions from Firebase and initialize the game
}



// -----------------------
// Game Initialization
// -----------------------
function initializeGame() {
  player1Queue = [...alphabet];
  player2Queue = [...alphabet];
  generateAlphabetCircles();
  startTimer();
  switchPlayer(1);
  loadNextQuestion();
}

function generateAlphabetCircles() {
  // Force both circles to display temporarily
  player1Circle.style.display = 'block';
  player2Circle.style.display = 'block';
  
  // Clear existing circles
  document.getElementById('alphabet-circle-1').innerHTML = '';
  document.getElementById('alphabet-circle-2').innerHTML = '';
  
  // Generate new circles for both players
  generateAlphabetCircle('alphabet-circle-1', player1Questions, 1);
  generateAlphabetCircle('alphabet-circle-2', player2Questions, 2);
  
  // Adjust display based on active player
  if (currentPlayer === 1) {
    player1Circle.classList.add('active');
    player2Circle.classList.remove('active');
    player2Circle.style.display = 'none';
  } else {
    player2Circle.classList.add('active');
    player1Circle.classList.remove('active');
    player1Circle.style.display = 'none';
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
  const currentPlayerCircleId = currentPlayer === 1 ? 'alphabet-circle-1' : 'alphabet-circle-2';
  const circle = document.getElementById(currentPlayerCircleId);
  const letters = circle.querySelectorAll('.letter');
  const currentLetter = currentPlayer === 1 ? player1Queue[0] : player2Queue[0];

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
          if (timeLeftPlayer2 > 0) {
            switchPlayer(2);
          } else {
            endGame();
          }
          return;
        }
      } else {
        timeLeftPlayer2--;
        if (timeLeftPlayer2 <= 0) {
          timeLeftPlayer2 = 0;
          time2Element.textContent = timeLeftPlayer2;
          if (timeLeftPlayer1 > 0) {
            switchPlayer(1);
          } else {
            endGame();
          }
          return;
        }
      }
      time1Element.textContent = timeLeftPlayer1;
      time2Element.textContent = timeLeftPlayer2;
    }
  }, 1000);
}

function switchPlayer(player) {
  currentPlayer = player;
  player1Circle.classList.remove('active');
  player2Circle.classList.remove('active');

  if (player === 1) {
    player1Circle.style.display = 'block';
    player1Circle.classList.add('active');
    player2Circle.style.display = 'none';
  } else {
    player2Circle.style.display = 'block';
    player2Circle.classList.add('active');
    player1Circle.style.display = 'none';
  }

  answerInput.value = "";
  loadNextQuestion();
}

function skipTurn() {
  if (currentPlayer === 1) {
    player1Queue.push(player1Queue.shift());
    if (timeLeftPlayer2 > 0) {
      switchPlayer(2);
    } else {
      loadNextQuestion();
    }
  } else {
    player2Queue.push(player2Queue.shift());
    if (timeLeftPlayer1 > 0) {
      switchPlayer(1);
    } else {
      loadNextQuestion();
    }
  }
}

function loadQuestion(letter, playerNumber) {
  currentQuestion = (playerNumber === 1) ? player1Questions[letter] : player2Questions[letter];
  const currentLang = document.getElementById('languageSwitcher').value;
  questionElement.textContent = (currentQuestion && currentQuestion.question && currentQuestion.question[currentLang])
    ? currentQuestion.question[currentLang]
    : "Question not found";
}

function checkAnswer() {
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
    currentPlayer === 1 ? player1Score++ : player2Score++;
    document.getElementById(`score${currentPlayer}`).textContent = currentPlayer === 1 ? player1Score : player2Score;
    selectedLetter.classList.add('correct', 'used');
    correctSound.play();
    if (currentPlayer === 1) player1Queue.shift();
    else player2Queue.shift();
  } else {
    selectedLetter.classList.add('incorrect', 'used');
    incorrectSound.play();
    if (currentPlayer === 1) {
      player1Queue.push(player1Queue.shift());
      if (timeLeftPlayer2 > 0) {
        switchPlayer(2);
      } else {
        loadNextQuestion();
      }
    } else {
      player2Queue.push(player2Queue.shift());
      if (timeLeftPlayer1 > 0) {
        switchPlayer(1);
      } else {
        loadNextQuestion();
      }
    }
  }

  // Emit move to server for synchronization
  socket.emit('playerMove', {
    room: currentRoom,
    playerId: currentPlayer,
    answer: userAnswer,
    isCorrect: isCorrect
  });

  answerInput.value = "";
  checkEndGame();
  loadNextQuestion();
}

function loadNextQuestion() {
  const currentQueue = currentPlayer === 1 ? player1Queue : player2Queue;
  if (currentQueue.length === 0) {
    endGame();
    return;
  }
  const nextLetter = currentQueue[0];
  loadQuestion(nextLetter, currentPlayer);
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
  currentPlayer = 1;
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
