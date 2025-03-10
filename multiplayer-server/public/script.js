// -----------------------
// Firebase & Socket.IO Imports
// -----------------------
import { getDatabase, ref, child, get, push } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { app, db } from "./firebase-config.js";

// -----------------------
// Global Variables for Multiplayer & Mode Flag
// -----------------------
let myPlayer = null;       // Will be set to 1 or 2 in multiplayer mode
let currentRoom = null;    // Current room code
let currentPlayer = null;  // Holds the socket id of the player whose turn it is
let isMultiplayer = true;  // true for multiplayer mode, false for same-screen mode

// -----------------------
// Helper Functions for Player Status
// -----------------------
function isPlayerFinished(player) {
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
  const gameContainer = document.getElementById('game-container');
  gameContainer.style.display = 'block';
  gameContainer.classList.add('same-screen'); // <-- important
  document.getElementById('play-btn').style.display = 'block';
});

// -----------------------
// Play Button for Same-Screen Mode
// -----------------------
document.getElementById('play-btn').addEventListener('click', function() {
  // For same-screen mode, default myPlayer and currentPlayer if not set.
  if (myPlayer === null) {
    myPlayer = 1;
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
  myPlayer = data.player; // Player 1
  console.log("Room created:", data.room, "as Player", myPlayer);

  // Display the room code on screen
  const roomDisplay = document.getElementById('room-code-display');
  roomDisplay.textContent = `Room Code: ${data.room}`;
  roomDisplay.style.display = 'block';
});

socket.on('roomJoined', (data) => {
  currentRoom = data.room;
  myPlayer = data.newPlayer; // Player 2
  console.log("Room joined:", data.room, "as Player", myPlayer);

  // Display the room code on screen (keep it consistent with 'roomCreated')
  const roomDisplay = document.getElementById('room-code-display');
  roomDisplay.textContent = `Room Code: ${data.room}`;
  roomDisplay.style.display = 'block';
});

socket.on("startGame", ({ room, currentTurn }) => {
  console.log(`Game started in room: ${room}`);
  currentPlayer = currentTurn; // This is a socket id
  document.getElementById("lobby").style.display = "none";
  document.getElementById("game-container").style.display = "block";
  fetchQuestions();
});

// -----------------------
// Updated Turn Changed Handler
// -----------------------
socket.on('turnChanged', (data) => {
  currentPlayer = data.currentTurn;
  console.log("Turn changed to:", currentPlayer);
  
  // Update both timers using the timers object sent from the server
  if (isMultiplayer && data.timers) {
    // Update current client's timer
    if (data.timers[socket.id] !== undefined) {
      if (myPlayer === 1) {
        timeLeftPlayer1 = data.timers[socket.id];
        time1Element.textContent = timeLeftPlayer1;
      } else {
        timeLeftPlayer2 = data.timers[socket.id];
        time2Element.textContent = timeLeftPlayer2;
      }
    }
    // Update the other player's timer
    for (let id in data.timers) {
      if (id !== socket.id) {
        if (myPlayer === 1) {
          timeLeftPlayer2 = data.timers[id];
          time2Element.textContent = timeLeftPlayer2;
        } else {
          timeLeftPlayer1 = data.timers[id];
          time1Element.textContent = timeLeftPlayer1;
        }
      }
    }
  }
  
  // Restart timer without an initialTime parameter (timers are now managed via the timers object)
  startTimer();
  loadNextQuestion();
  
  // Enable input only for active player
  answerInput.disabled = (currentPlayer !== socket.id);
});

// -----------------------
// Update Timer from Server (for the active player)
// -----------------------
socket.on('updateTimer', (data) => {
  // Only update if it's our own player data
  if (data.playerId === socket.id) {
    if (myPlayer === 1) {
      timeLeftPlayer1 = data.timeLeft;
      time1Element.textContent = timeLeftPlayer1;
    } else {
      timeLeftPlayer2 = data.timeLeft;
      time2Element.textContent = timeLeftPlayer2;
    }
  }
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
    loadNextQuestion();
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

document.getElementById('submit-answer').addEventListener('click', () => {
  console.log("Submit Answer button clicked.");
  if (isMultiplayer && currentPlayer !== socket.id) {
    console.log("Not your turn in multiplayer mode.");
    return;
  }
  checkAnswer();
});

document.getElementById('skip-btn').addEventListener('click', () => {
  // Only allow skipping if it is your turn
  if (isMultiplayer && currentPlayer !== socket.id) return;
  if (isMultiplayer) {
    // Rotate your own letter queue before emitting the skip action
    if (myPlayer === 1) {
      player1Queue.push(player1Queue.shift());
    } else {
      player2Queue.push(player2Queue.shift());
    }
    socket.emit('playerAction', { room: currentRoom, action: 'skip' });
  } else {
    if (currentPlayer === 1) {
      player1Queue.push(player1Queue.shift());
    } else {
      player2Queue.push(player2Queue.shift());
    }
    if (!isPlayerFinished(getOtherPlayer(currentPlayer))) {
      currentPlayer = getOtherPlayer(currentPlayer);
    }
    loadNextQuestion();
  }
});

document.getElementById('restart-btn').addEventListener('click', restartGame);
document.getElementById('pause-btn').addEventListener('click', togglePause);
answerInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && (!isMultiplayer || currentPlayer === socket.id)) {
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
  
  // Always show both circles regardless of mode
  player1Circle.style.display = 'block';
  player2Circle.style.display = 'block';
  
  // Optionally add an active class to the displayed circle
  if (myPlayer === 1 || (!isMultiplayer && currentPlayer === 1)) {
    player1Circle.classList.add('active');
  }
  if (myPlayer === 2 || (!isMultiplayer && currentPlayer === 2)) {
    player2Circle.classList.add('active');
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
  // For same-screen mode only
  let currentQueue = (currentPlayer === 1) ? player1Queue : player2Queue;
  let currentCircleId = (currentPlayer === 1) ? 'alphabet-circle-1' : 'alphabet-circle-2';
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

function activatePlayerLetter(playerNumber) {
  // For multiplayer mode: update only your own circle
  let queue = (playerNumber === 1) ? player1Queue : player2Queue;
  let circleId = (playerNumber === 1) ? 'alphabet-circle-1' : 'alphabet-circle-2';
  const circle = document.getElementById(circleId);
  const letters = circle.querySelectorAll('.letter');
  const currentLetter = queue[0];
  letters.forEach(letter => {
    letter.classList.remove('active');
    if (letter.textContent === currentLetter) {
      letter.classList.add('active');
      if (playerNumber === myPlayer) {
        selectedLetter = letter;
      }
    }
  });
}

// -----------------------
// Timer
// -----------------------
function startTimer(initialTime = null) {
  clearInterval(timerInterval);
  
  if (isMultiplayer) {
    if (initialTime !== null) {
      if (myPlayer === 1) timeLeftPlayer1 = initialTime;
      if (myPlayer === 2) timeLeftPlayer2 = initialTime;
    }
    
    // Sync with server every 5 seconds for the active player's timer
    const syncInterval = setInterval(() => {
      if (currentPlayer === socket.id) {
        const currentTime = myPlayer === 1 ? timeLeftPlayer1 : timeLeftPlayer2;
        socket.emit('updateTimer', { 
          room: currentRoom, 
          timeLeft: currentTime 
        });
      }
    }, 5000);
  }

  timerInterval = setInterval(() => {
    if (!isPaused) {
      if (isMultiplayer) {
        // Only active player's timer runs locally
        if (currentPlayer === socket.id) {
          if (myPlayer === 1) {
            timeLeftPlayer1--;
            time1Element.textContent = timeLeftPlayer1;
            if (timeLeftPlayer1 <= 0) {
              clearInterval(syncInterval);
              timeLeftPlayer1 = 0;
              socket.emit('playerAction', { 
                room: currentRoom, 
                action: 'skip',
                currentTime: timeLeftPlayer1 
              });
            }
          } else {
            timeLeftPlayer2--;
            time2Element.textContent = timeLeftPlayer2;
            if (timeLeftPlayer2 <= 0) {
              clearInterval(syncInterval);
              timeLeftPlayer2 = 0;
              socket.emit('playerAction', { 
                room: currentRoom, 
                action: 'skip',
                currentTime: timeLeftPlayer2 
              });
            }
          }
        }
      } else {
        // Same-screen mode - continuous timer
        const currentTime = currentPlayer === 1 ? timeLeftPlayer1 : timeLeftPlayer2;
        if (currentTime > 0) {
          if (currentPlayer === 1) {
            timeLeftPlayer1--;
            time1Element.textContent = timeLeftPlayer1;
          } else {
            timeLeftPlayer2--;
            time2Element.textContent = timeLeftPlayer2;
          }
          
          if ((currentPlayer === 1 && timeLeftPlayer1 <= 0) || 
              (currentPlayer === 2 && timeLeftPlayer2 <= 0)) {
            handleTimeout();
          }
        }
      }
    }
  }, 1000);
}

// -----------------------
// Question Handling
// -----------------------
function loadQuestion(letter, playerNumber) {
  // Use uppercase for question keys.
  const questionKey = letter.toUpperCase();
  currentQuestion = (playerNumber === 1) ? player1Questions[questionKey] : player2Questions[questionKey];
  const currentLang = document.getElementById('languageSwitcher').value;
  questionElement.textContent = (currentQuestion && currentQuestion.question && currentQuestion.question[currentLang])
    ? currentQuestion.question[currentLang]
    : `Question not found for ${letter}`;
}

function checkAnswer() {
  console.log("checkAnswer() invoked.");
  if (isMultiplayer && currentPlayer !== socket.id) {
    console.log("Not your turn in multiplayer mode in checkAnswer.");
    return;
  }
  const userAnswer = answerInput.value.trim().toLowerCase();
  if (!userAnswer || !currentQuestion) {
    console.log("No answer provided or no current question.");
    return;
  }
  
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
    // Correct answer: update score and remove letter.
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
      socket.emit('playerMove', {
        room: currentRoom,
        playerId: myPlayer,
        answer: userAnswer,
        isCorrect: true
      });
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
        isCorrect: false
      });
      socket.emit('playerAction', { room: currentRoom, action: 'wrongAnswer' });
    } else {
      if (currentPlayer === 1) {
        player1Queue.push(player1Queue.shift());
      } else {
        player2Queue.push(player2Queue.shift());
      }
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
  if (isMultiplayer) {
    let myQueue = (myPlayer === 1) ? player1Queue : player2Queue;
    if (myQueue.length === 0) {
      endGame();
      return;
    }
    const nextLetter = myQueue[0];
    const questionKey = nextLetter.toUpperCase();
    let questionData = (myPlayer === 1) ? player1Questions[questionKey] : player2Questions[questionKey];
    
    if (!questionData) {
      myQueue.shift();
      loadNextQuestion();
      return;
    }

    loadQuestion(nextLetter, myPlayer);
    activatePlayerLetter(myPlayer);

    // New visibility control
    const isActivePlayer = (currentPlayer === socket.id);
    const questionContainer = document.getElementById('question-container');
    const questionElement = document.getElementById('question');
    const answerContainer = document.querySelector('.answer-container');
    const skipBtn = document.getElementById('skip-btn');
    const existingWaitingMessage = document.getElementById('waiting-message');

    // Clear previous waiting message
    if (existingWaitingMessage) existingWaitingMessage.remove();

    if (isActivePlayer) {
      // Show active player's interface
      questionElement.style.display = 'block';
      answerContainer.style.display = 'flex';
      skipBtn.style.display = 'block';
      document.getElementById('submit-answer').style.display = 'block';
    } else {
      // Hide question and show waiting state
      questionElement.style.display = 'none';
      const waitingMessage = document.createElement('div');
      waitingMessage.id = 'waiting-message';
      waitingMessage.textContent = 'Waiting for your turn...';
      questionContainer.appendChild(waitingMessage);
      answerContainer.style.display = 'none';
      skipBtn.style.display = 'none';
      document.getElementById('submit-answer').style.display = 'none';
    }

    answerInput.disabled = !isActivePlayer;
    answerInput.focus();

  } else { 
    // Same-screen mode (existing code remains unchanged)
    let currentQueue = (currentPlayer === 1) ? player1Queue : player2Queue;
    if (currentQueue.length === 0) {
      endGame();
      return;
    }
    const nextLetter = currentQueue[0];
    const questionKey = nextLetter.toUpperCase();
    let questionData = (currentPlayer === 1) ? player1Questions[questionKey] : player2Questions[questionKey];
    
    if (!questionData) {
      currentQueue.shift();
      loadNextQuestion();
      return;
    }

    loadQuestion(nextLetter, currentPlayer);
    activateCurrentLetter();
    answerInput.disabled = false;
    answerInput.focus();
  }
}

function checkEndGame() {
  if (player1Queue.length === 0 && player2Queue.length === 0) {
    endGame();
  }
}

function endGame() {
  clearInterval(timerInterval);
  gameOverSound.play();
  answerInput.disabled = true;
  document.getElementById('score1').textContent = player1Score;
  document.getElementById('score2').textContent = player2Score;
  document.getElementById('pause-btn').style.display = 'none';
  document.getElementById('player1-circle').style.display = 'none';
  document.getElementById('player2-circle').style.display = 'none';
  document.getElementById('answer-container').style.display = 'none';
  document.getElementById('submit-answer').style.display = 'none';
  document.getElementById('skip-btn').style.display = 'none';
  document.getElementById('result').style.display = 'block';
  push(ref(db, 'leaderboard'), {
    player1Score,
    player2Score,
    timestamp: new Date().toISOString()
  });
  
  const winnerElement = document.getElementById('winner-message');
  if (player1Score > player2Score) {
    winnerElement.textContent = "Player 1 Wins! 🏆";
  } else if (player2Score > player1Score) {
    winnerElement.textContent = "Player 2 Wins! 🏆";
  } else {
    winnerElement.textContent = "It's a Draw! 🤝";
  }
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
