// script.js
import { getDatabase, ref, child, get, push } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { app, db } from "./firebase-config.js";

// -----------------------
// Socket.IO Integration
// -----------------------
const socket = io(); // Connect to your Socket.IO server
let currentRoom = null; // Will hold the current room code
let myPlayerNumber = null; // This client’s assigned player number (1 or 2)

// Listen for room creation and joining events
socket.on('roomCreated', (data) => {
  currentRoom = data.room;
  const roomDisplay = document.getElementById('room-code-display');
  roomDisplay.textContent = `Room Code: ${data.room}`;
  roomDisplay.style.display = 'block'; // Ensure the room code is visible
  console.log("Room created:", data.room);
});

socket.on('roomJoined', (data) => {
  currentRoom = data.room;
  const roomDisplay = document.getElementById('room-code-display');
  roomDisplay.textContent = `Joined Room: ${data.room}`;
  roomDisplay.style.display = 'block';
  console.log("Room joined:", data.room);
});

// When the server starts the game, hide the lobby and show the game UI
socket.on("startGame", ({ room }) => {
  console.log(`Game started in room: ${room}`);
  document.getElementById("lobby").style.display = "none";
  document.getElementById("game-container").style.display = "block";
  // Fetch questions for both players – each client will load their own question set later
  fetchQuestions();
});

// Receive the assigned player number from the server
socket.on("playerAssignment", (data) => {
  myPlayerNumber = data.playerNumber;
  console.log("Assigned player number:", myPlayerNumber);
});

// Listen for turn changes from the server
socket.on('turnChanged', (data) => {
  const currentTurn = data.currentTurn; // the player number (1 or 2) whose turn it is
  if (currentTurn === myPlayerNumber) {
    // It's our turn – enable input and buttons and load a new question
    answerInput.disabled = false;
    document.getElementById('submit-answer').disabled = false;
    document.getElementById('skip-btn').disabled = false;
    loadNextQuestion();
  } else {
    // Disable input for waiting
    answerInput.disabled = true;
    document.getElementById('submit-answer').disabled = true;
    document.getElementById('skip-btn').disabled = true;
  }
});

// Listen for moves from the server (from other players)
// (This can be used to update shared game state, e.g. scores, if needed.)
socket.on('playerMove', (data) => {
  console.log("Received move from player", data.playerNumber, ":", data);
  // Optionally update shared state (scores, etc.) if you want both players to see the overall state.
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
// Instead of a shared currentPlayer, the server will control whose turn it is.
// Each client only handles its own question queue:
let myQueue = [];
// The pause functionality is removed, so no isPaused variable.

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
document.getElementById('skip-btn').addEventListener('click', () => {
  // Notify the server that this player is skipping
  socket.emit('playerAction', {
    room: currentRoom,
    playerNumber: myPlayerNumber,
    action: 'skip'
  });
});

document.getElementById('submit-answer').addEventListener('click', checkAnswer);
document.getElementById('restart-btn').addEventListener('click', restartGame);
answerInput.addEventListener('keypress', (e) => e.key === 'Enter' && checkAnswer());

// Immediately hide the pause button since it's not used
document.addEventListener("DOMContentLoaded", () => {
  const pauseButton = document.getElementById('pause-btn');
  if (pauseButton) {
    pauseButton.style.display = 'none';
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
// Game Initialization
// -----------------------
function initializeGame() {
  // Set up the queue for this client based on assigned player number.
  // Wait for the server to assign myPlayerNumber before proceeding.
  if (myPlayerNumber === 1) {
    myQueue = [...alphabet];
  } else if (myPlayerNumber === 2) {
    myQueue = [...alphabet];
  } else {
    console.error("Player number not assigned!");
    return;
  }
  
  generateAlphabetCircles();
  startTimer();
  // We no longer call switchPlayer locally; the server will trigger a turn via turnChanged.
  // Load the first question if it's our turn (server will trigger this).
  // If it is not our turn, the input will remain disabled.
  loadNextQuestion();
}

function generateAlphabetCircles() {
  // Only display the circle corresponding to the assigned player number.
  if (myPlayerNumber === 1) {
    player1Circle.style.display = 'block';
    player2Circle.style.display = 'none';
    // Generate letters for player 1
    document.getElementById('alphabet-circle-1').innerHTML = '';
    generateAlphabetCircle('alphabet-circle-1', player1Questions, 1);
  } else if (myPlayerNumber === 2) {
    player2Circle.style.display = 'block';
    player1Circle.style.display = 'none';
    // Generate letters for player 2
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
  // Activate the current letter (the first letter in the client’s own queue)
  const currentQueue = myQueue;
  const currentCircleId = myPlayerNumber === 1 ? 'alphabet-circle-1' : 'alphabet-circle-2';
  const circle = document.getElementById(currentCircleId);
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
    // Timer runs for both players even though each client only sees its own time.
    // You can choose to show only the local player's timer if desired.
    if (myPlayerNumber === 1) {
      timeLeftPlayer1--;
      if (timeLeftPlayer1 <= 0) {
        timeLeftPlayer1 = 0;
        time1Element.textContent = timeLeftPlayer1;
        endGame();
        return;
      }
      time1Element.textContent = timeLeftPlayer1;
    } else {
      timeLeftPlayer2--;
      if (timeLeftPlayer2 <= 0) {
        timeLeftPlayer2 = 0;
        time2Element.textContent = timeLeftPlayer2;
        endGame();
        return;
      }
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

  // Update local UI for immediate feedback
  if (isCorrect) {
    if (myPlayerNumber === 1) {
      player1Score++;
      document.getElementById('score1').textContent = player1Score;
    } else {
      player2Score++;
      document.getElementById('score2').textContent = player2Score;
    }
    selectedLetter.classList.add('correct', 'used');
    correctSound.play();
    myQueue.shift();
  } else {
    selectedLetter.classList.add('incorrect', 'used');
    incorrectSound.play();
    // For a wrong answer, push the current letter to the end of the queue
    myQueue.push(myQueue.shift());
  }

  // Emit the move to the server so that turn switching can be handled globally
  socket.emit('playerAction', {
    room: currentRoom,
    playerNumber: myPlayerNumber,
    action: 'answer',
    answer: userAnswer,
    isCorrect: isCorrect
  });

  answerInput.value = "";
  checkEndGame();
  // Do not call loadNextQuestion here directly; wait for the server to trigger the next turn if applicable.
}

function loadNextQuestion() {
  if (myQueue.length === 0) {
    endGame();
    return;
  }
  const nextLetter = myQueue[0];
  loadQuestion(nextLetter, myPlayerNumber);
  activateCurrentLetter();
  answerInput.focus();
}

function checkEndGame() {
  if (myQueue.length === 0) {
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
  // The turn assignment will be handled by the server on restart.
  myQueue = [...alphabet];
  document.getElementById('time1').textContent = 250;
  document.getElementById('time2').textContent = 250;
  document.getElementById('score1').textContent = 0;
  document.getElementById('score2').textContent = 0;
  document.getElementById('result').style.display = 'none';
  // Remove previous letter statuses
  document.querySelectorAll('.letter').forEach(letter => {
    letter.classList.remove('correct', 'incorrect', 'used', 'active');
  });
  fetchQuestions();
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
