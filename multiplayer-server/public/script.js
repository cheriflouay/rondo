// -----------------------
// Firebase & Socket.IO Imports
// -----------------------
import { getDatabase, ref, child, get, push } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { app, db } from "./firebase-config.js";

// -----------------------
// Global Variables for Multiplayer & Mode Flag
// -----------------------
let myPlayer = null;       // Assigned as 1 or 2 when a room is created/joined (multiplayer)
let currentRoom = null;    // Current room code
let currentPlayer = null;  // Whose turn it is (set by server in multiplayer or locally in same-screen)
let isMultiplayer = true;  // true for multiplayer mode, false for same-screen mode

// -----------------------
// Helper Functions for Player Status
// -----------------------
function isPlayerFinished(player) {
  // A player is finished if his queue is empty or his time has run out.
  if (player === 1) {
    return (player1Queue.length === 0 || timeLeftPlayer1 <= 0);
  } else {
    return (player2Queue.length === 0 || timeLeftPlayer2 <= 0);
  }
}

function getOtherPlayer(player) {
  return (player === 1) ? 2 : 1;
}

// -----------------------
// Landing Page Navigation
// -----------------------
document.getElementById('multiplayer')?.addEventListener('click', function() {
  isMultiplayer = true;
  document.getElementById('landing-page').style.display = 'none';
  document.getElementById('lobby').style.display = 'block';
});

document.getElementById('same-screen')?.addEventListener('click', function() {
  isMultiplayer = false;
  document.getElementById('landing-page').style.display = 'none';
  document.getElementById('game-container').style.display = 'block';
  // In same-screen mode, show the Play button to start the game.
  document.getElementById('play-btn').style.display = 'block';
});

// -----------------------
// Play Button for Same-Screen Mode
// -----------------------
document.getElementById('play-btn').addEventListener('click', function() {
  // For same-screen mode, default myPlayer and currentPlayer if not set.
  if (myPlayer === null) {
    myPlayer = 1; // Default as Player 1
    console.log("Defaulting myPlayer to 1 for same-screen mode.");
  }
  if (currentPlayer === null) {
    currentPlayer = myPlayer;
    console.log("Defaulting currentPlayer to myPlayer:", myPlayer);
  }
  // Hide the Play button and start the game.
  document.getElementById('play-btn').style.display = 'none';
  startGame();
});

// -----------------------
// Socket.IO Integration (Multiplayer only)
// -----------------------
const socket = io(); // Connect to your Socket.IO server

socket.on('roomCreated', (data) => {
  currentRoom = data.room;
  myPlayer = 1;
  const roomDisplay = document.getElementById('room-code-display');
  roomDisplay.textContent = `Room Code: ${data.room}`;
  roomDisplay.style.display = 'block';
  console.log("Room created:", data.room);
});

socket.on('roomJoined', (data) => {
  currentRoom = data.room;
  myPlayer = data.player;
  const roomDisplay = document.getElementById('room-code-display');
  roomDisplay.textContent = `Joined Room: ${data.room} as Player ${myPlayer}`;
  roomDisplay.style.display = 'block';
  console.log("Room joined:", data.room, "as Player", myPlayer);
});

socket.on("startGame", ({ room, startingPlayer }) => {
  console.log(`Game started in room: ${room}`);
  currentPlayer = startingPlayer;
  document.getElementById("lobby").style.display = "none";
  document.getElementById("game-container").style.display = "block";
  fetchQuestions();  
});

socket.on('switchTurn', (data) => {
  currentPlayer = data.currentPlayer;
  console.log("Switch turn to Player", currentPlayer);
  loadNextQuestion();
  answerInput.disabled = (currentPlayer !== myPlayer);
});

socket.on('playerMove', (data) => {
  if (data.playerId !== myPlayer) {
    console.log("Received move from opponent:", data);
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
// Room Creation / Joining UI (Multiplayer only)
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
// Event Listeners for Game Actions
// -----------------------
document.getElementById('skip-btn').addEventListener('click', () => {
  if (isMultiplayer && currentPlayer !== myPlayer) return;
  if (isMultiplayer) {
    socket.emit('skipTurn', { room: currentRoom, player: myPlayer });
    // In multiplayer, switch turn only if the opponent is not finished.
    if (!isPlayerFinished(getOtherPlayer(myPlayer))) {
      emitSwitchTurn();
    } else {
      loadNextQuestion();
    }
  } else {
    // In same-screen mode, move the current letter to the end of the active player's queue.
    if (currentPlayer === 1) {
      player1Queue.push(player1Queue.shift());
    } else {
      player2Queue.push(player2Queue.shift());
    }
    // Switch turn only if the opponent is not finished.
    if (!isPlayerFinished(getOtherPlayer(currentPlayer))) {
      currentPlayer = getOtherPlayer(currentPlayer);
    }
    loadNextQuestion();
  }
});

document.getElementById('submit-answer').addEventListener('click', () => {
  if (isMultiplayer && currentPlayer !== myPlayer) return;
  checkAnswer();
});

document.getElementById('restart-btn').addEventListener('click', restartGame);
document.getElementById('pause-btn').addEventListener('click', togglePause);
answerInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && (!isMultiplayer || currentPlayer === myPlayer)) {
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
    if (!setKeys.length) {
      console.error("No question sets available.");
      return;
    }
    // Select two independent random sets.
    const randomIndex1 = Math.floor(Math.random() * setKeys.length);
    let randomIndex2 = Math.floor(Math.random() * setKeys.length);
    if (setKeys.length > 1) {
      while (randomIndex2 === randomIndex1) {
        randomIndex2 = Math.floor(Math.random() * setKeys.length);
      }
    }
    player1Questions = sets[setKeys[randomIndex1]];
    player2Questions = sets[setKeys[randomIndex2]];
    initializeGame();
  } catch (error) {
    console.error("Error loading questions:", error);
  }
}

// -----------------------
// Game Start Function
// -----------------------
function startGame() {
  console.log("Starting the game...");
  document.getElementById('lobby').style.display = 'none';
  document.getElementById('game-container').style.display = 'block';
  fetchQuestions();
}

// -----------------------
// Game Initialization
// -----------------------
function initializeGame() {
  if (!currentPlayer) {
    currentPlayer = myPlayer;
    console.log("Defaulting currentPlayer to myPlayer:", myPlayer);
  }
  
  // Reset question queues.
  player1Queue = [...alphabet];
  player2Queue = [...alphabet];
  
  generateAlphabetCircles();
  startTimer();
  loadNextQuestion();
}

// -----------------------
// Alphabet Circle Generation & Activation
// -----------------------
function generateAlphabetCircles() {
  document.getElementById('alphabet-circle-1').innerHTML = '';
  document.getElementById('alphabet-circle-2').innerHTML = '';
  
  generateAlphabetCircle('alphabet-circle-1', player1Questions, 1);
  generateAlphabetCircle('alphabet-circle-2', player2Questions, 2);
  
  // Hide both circles and clear active classes.
  player1Circle.style.display = 'none';
  player2Circle.style.display = 'none';
  player1Circle.classList.remove('active');
  player2Circle.classList.remove('active');
  
  // In same-screen mode, show the active player's circle.
  if (!isMultiplayer) {
    if (currentPlayer === 1) {
      player1Circle.style.display = 'block';
      player1Circle.classList.add('active');
    } else {
      player2Circle.style.display = 'block';
      player2Circle.classList.add('active');
    }
  } else {
    // In multiplayer mode, show your circle if it's your turn.
    if (currentPlayer === myPlayer) {
      if (myPlayer === 1) {
        player1Circle.style.display = 'block';
        player1Circle.classList.add('active');
      } else {
        player2Circle.style.display = 'block';
        player2Circle.classList.add('active');
      }
    }
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
  let currentQueue, currentCircleId;
  if (!isMultiplayer) {
    currentQueue = (currentPlayer === 1) ? player1Queue : player2Queue;
    currentCircleId = (currentPlayer === 1) ? 'alphabet-circle-1' : 'alphabet-circle-2';
  } else {
    currentQueue = (myPlayer === 1) ? player1Queue : player2Queue;
    currentCircleId = (myPlayer === 1) ? 'alphabet-circle-1' : 'alphabet-circle-2';
  }
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

// -----------------------
// Timer
// -----------------------
function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!isPaused) {
      if (currentPlayer === 1) {
        timeLeftPlayer1--;
        if (timeLeftPlayer1 <= 0) {
          timeLeftPlayer1 = 0;
          time1Element.textContent = timeLeftPlayer1;
          // If opponent isn't finished, switch turn; otherwise, end game.
          if (!isPlayerFinished(2)) {
            currentPlayer = 2;
            loadNextQuestion();
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
          if (!isPlayerFinished(1)) {
            currentPlayer = 1;
            loadNextQuestion();
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

// -----------------------
// Question Handling
// -----------------------
function loadQuestion(letter, playerNumber) {
  currentQuestion = (playerNumber === 1) ? player1Questions[letter] : player2Questions[letter];
  const currentLang = document.getElementById('languageSwitcher').value;
  questionElement.textContent = (currentQuestion && currentQuestion.question && currentQuestion.question[currentLang])
    ? currentQuestion.question[currentLang]
    : "Question not found";
}

function checkAnswer() {
  if (isMultiplayer && currentPlayer !== myPlayer) return;
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
    // Correct answer: update score, remove letter; turn remains with the same player.
    if (isMultiplayer) {
      if (myPlayer === 1) {
        player1Score++;
        document.getElementById('score1').textContent = player1Score;
        player1Queue.shift();
      } else {
        player2Score++;
        document.getElementById('score2').textContent = player2Score;
        player2Queue.shift();
      }
    } else {
      if (currentPlayer === 1) {
        player1Score++;
        document.getElementById('score1').textContent = player1Score;
        player1Queue.shift();
      } else {
        player2Score++;
        document.getElementById('score2').textContent = player2Score;
        player2Queue.shift();
      }
    }
    selectedLetter.classList.add('correct', 'used');
    correctSound.play();
    // Turn remains the same.
  } else {
    selectedLetter.classList.add('incorrect', 'used');
    incorrectSound.play();
    if (isMultiplayer) {
      if (myPlayer === 1) {
        player1Queue.push(player1Queue.shift());
      } else {
        player2Queue.push(player2Queue.shift());
      }
      socket.emit('playerMove', {
        room: currentRoom,
        playerId: myPlayer,
        answer: userAnswer,
        isCorrect: isCorrect
      });
      // Switch turn if the opponent is not finished.
      if (!isPlayerFinished(getOtherPlayer(myPlayer))) {
        emitSwitchTurn();
      } else {
        loadNextQuestion();
      }
    } else {
      if (currentPlayer === 1) {
        player1Queue.push(player1Queue.shift());
      } else {
        player2Queue.push(player2Queue.shift());
      }
      // In same-screen mode, switch turn only if the opponent is not finished.
      if (!isPlayerFinished(getOtherPlayer(currentPlayer))) {
        currentPlayer = getOtherPlayer(currentPlayer);
      }
    }
  }
  
  answerInput.value = "";
  checkEndGame();
  loadNextQuestion();
}

function loadNextQuestion() {
  let currentQueue = isMultiplayer 
      ? (myPlayer === 1 ? player1Queue : player2Queue)
      : (currentPlayer === 1 ? player1Queue : player2Queue);
      
  if (currentQueue.length === 0) {
    endGame();
    return;
  }
  
  const nextLetter = currentQueue[0];
  loadQuestion(nextLetter, isMultiplayer ? myPlayer : currentPlayer);
  
  // Hide both circles first and clear active classes.
  player1Circle.style.display = 'none';
  player2Circle.style.display = 'none';
  player1Circle.classList.remove('active');
  player2Circle.classList.remove('active');
  
  // Show only the active player's circle.
  if (!isMultiplayer) {
    if (currentPlayer === 1) {
      player1Circle.style.display = 'block';
      player1Circle.classList.add('active');
    } else {
      player2Circle.style.display = 'block';
      player2Circle.classList.add('active');
    }
  } else {
    if (currentPlayer === myPlayer) {
      if (myPlayer === 1) {
        player1Circle.style.display = 'block';
        player1Circle.classList.add('active');
      } else {
        player2Circle.style.display = 'block';
        player2Circle.classList.add('active');
      }
    }
  }
  
  activateCurrentLetter();
  answerInput.disabled = false;
  answerInput.focus();
}

function checkEndGame() {
  // End game only when BOTH players are finished.
  if (isPlayerFinished(1) && isPlayerFinished(2)) {
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
