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

// We'll store the two players' socket IDs here once available
let player1SocketId = null;
let player2SocketId = null;

// New global flags to lock players when time runs out or their queue is empty
let player1Locked = false;
let player2Locked = false;

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
const socket = io('https://rondo-2os2.onrender.com', {
  transports: ['websocket']
});

socket.on('roomCreated', (data) => {
  currentRoom = data.room;
  myPlayer = data.player; // Player 1
  // For room creator, store their socket id as player1SocketId
  player1SocketId = socket.id;
  console.log("Room created:", data.room, "as Player", myPlayer);

  // Display the room code on screen
  const roomDisplay = document.getElementById('room-code-display');
  roomDisplay.textContent = `Room Code: ${data.room}`;
  roomDisplay.style.display = 'block';
});

socket.on('roomJoined', (data) => {
  currentRoom = data.room;
  myPlayer = data.newPlayer; // Player 2
  // For joiner, store their socket id as player2SocketId
  player2SocketId = socket.id;
  console.log("Room joined:", data.room, "as Player", myPlayer);

  // Display the room code on screen (keep it consistent with 'roomCreated')
  const roomDisplay = document.getElementById('room-code-display');
  roomDisplay.textContent = `Room Code: ${data.room}`;
  roomDisplay.style.display = 'block';
});

// Listen for opponent's alphabet queue updates
socket.on('alphabetUpdate', (data) => {
  // Update the opponent's queue and redraw their alphabet circle.
  if (data.player === 1) {
    player1Queue = data.queue;
    activatePlayerLetter(1);
  } else if (data.player === 2) {
    player2Queue = data.queue;
    activatePlayerLetter(2);
  }
});

// Listen for letter status updates (correct, incorrect, skipped)
socket.on('letterStatusUpdate', (data) => {
  // Determine which circle to update based on the player number.
  let circleId = data.player === 1 ? 'alphabet-circle-1' : 'alphabet-circle-2';
  const circle = document.getElementById(circleId);
  const letters = circle.querySelectorAll('.letter');
  letters.forEach(letter => {
    if (letter.textContent === data.letter) {
      // Remove any previous status classes.
      letter.classList.remove('correct', 'incorrect', 'skipped');
      if (data.status === 'correct') {
         letter.classList.add('correct', 'used');
      } else if (data.status === 'incorrect') {
         letter.classList.add('incorrect', 'used');
      } else if (data.status === 'skipped') {
         letter.classList.add('skipped', 'used');
      }
    }
  });
});

// -----------------------
// Start Game & Initialize Timers Using Server Data
// -----------------------
socket.on("startGame", ({ room, currentTurn, timers, players }) => {
  if (!room || !timers || !players || players.length !== 2) {
    console.error("Invalid startGame data:", { room, timers, players });
    return;
  }

  player1SocketId = players[0];
  player2SocketId = players[1];
  currentPlayer = currentTurn;

  // Fallback to 250 if timer values are missing
  timeLeftPlayer1 = timers[player1SocketId] ?? 250;
  timeLeftPlayer2 = timers[player2SocketId] ?? 250;

  time1Element.textContent = timeLeftPlayer1;
  time2Element.textContent = timeLeftPlayer2;

  document.getElementById("lobby").style.display = "none";
  const gameContainer = document.getElementById("game-container");
  gameContainer.style.display = "block";
  gameContainer.classList.add("same-screen"); 
  fetchQuestions();
});

// -----------------------
// Updated Turn Changed Handler
// -----------------------
socket.on('turnChanged', (data) => {
  currentPlayer = data.currentTurn;
  console.log("Turn changed to:", currentPlayer);
  
  // Update timers safely
  if (player1SocketId && data.timers[player1SocketId] !== undefined) {
    timeLeftPlayer1 = data.timers[player1SocketId];
    time1Element.textContent = timeLeftPlayer1;
  }
  if (player2SocketId && data.timers[player2SocketId] !== undefined) {
    timeLeftPlayer2 = data.timers[player2SocketId];
    time2Element.textContent = timeLeftPlayer2;
  }
  
  startTimer();
  loadNextQuestion();
  answerInput.disabled = (currentPlayer !== socket.id);
});

// -----------------------
// Player Move Handler
// -----------------------
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
    // Before rotating, capture the letter to mark as skipped.
    if (myPlayer === 1) {
      const skippedLetter = player1Queue[0];
      socket.emit('letterStatusUpdate', {
        room: currentRoom,
        player: myPlayer,
        letter: skippedLetter,
        status: 'skipped'
      });
      player1Queue.push(player1Queue.shift());
    } else {
      const skippedLetter = player2Queue[0];
      socket.emit('letterStatusUpdate', {
        room: currentRoom,
        player: myPlayer,
        letter: skippedLetter,
        status: 'skipped'
      });
      player2Queue.push(player2Queue.shift());
    }
    // Emit updated alphabet queue after skipping.
    socket.emit('alphabetUpdate', {
      room: currentRoom,
      player: myPlayer,
      queue: myPlayer === 1 ? player1Queue : player2Queue
    });
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
  
  // Reset question queues and locked flags.
  player1Queue = [...alphabet];
  player2Queue = [...alphabet];
  player1Locked = false;
  player2Locked = false;
  
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
  // Update the circle for the given player number.
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
  let syncInterval = null;
  
  if (isMultiplayer) {
    if (initialTime !== null) {
      if (myPlayer === 1) timeLeftPlayer1 = initialTime;
      if (myPlayer === 2) timeLeftPlayer2 = initialTime;
    }
    
    // Sync with server every 5 seconds for the active player's timer
    syncInterval = setInterval(() => {
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
        if (currentPlayer === player1SocketId) {
          if (timeLeftPlayer1 > 0) {
            timeLeftPlayer1--;
            time1Element.textContent = timeLeftPlayer1;
            if (timeLeftPlayer1 <= 0) {
              timeLeftPlayer1 = 0;
              if (!player1Locked) {
                player1Locked = true;
                socket.emit('playerAction', { 
                  room: currentRoom, 
                  action: 'timeout', 
                  player: 1, 
                  currentTime: timeLeftPlayer1 
                });
                if (!player2Locked && player2Queue.length > 0 && timeLeftPlayer2 > 0) {
                  currentPlayer = player2SocketId;
                }
                loadNextQuestion();
              }
            }
          }
        } else if (currentPlayer === player2SocketId) {
          if (timeLeftPlayer2 > 0) {
            timeLeftPlayer2--;
            time2Element.textContent = timeLeftPlayer2;
            if (timeLeftPlayer2 <= 0) {
              timeLeftPlayer2 = 0;
              if (!player2Locked) {
                player2Locked = true;
                socket.emit('playerAction', { 
                  room: currentRoom, 
                  action: 'timeout', 
                  player: 2, 
                  currentTime: timeLeftPlayer2 
                });
                if (!player1Locked && player1Queue.length > 0 && timeLeftPlayer1 > 0) {
                  currentPlayer = player1SocketId;
                }
                loadNextQuestion();
              }
            }
          }
        }
      } else {
        // Same-screen mode timer
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
// Timeout Handler for Same-Screen Mode
// -----------------------
function handleTimeout() {
  if (currentPlayer === 1) {
    timeLeftPlayer1 = 0;
    time1Element.textContent = 0;
    if (!player1Locked) {
      player1Locked = true;
    }
    if (!player2Locked && player2Queue.length > 0 && timeLeftPlayer2 > 0) {
      currentPlayer = 2;
    }
  } else {
    timeLeftPlayer2 = 0;
    time2Element.textContent = 0;
    if (!player2Locked) {
      player2Locked = true;
    }
    if (!player1Locked && player1Queue.length > 0 && timeLeftPlayer1 > 0) {
      currentPlayer = 1;
    }
  }
  checkEndGame();
  loadNextQuestion();
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
  
  // 1. Add null check for selectedLetter first
  if (!selectedLetter) {
    console.error("Cannot check answer - no active letter selected!");
    return;
  }

  // 2. Multiplayer turn validation
  if (isMultiplayer && currentPlayer !== socket.id) {
    console.log("Not your turn in multiplayer mode in checkAnswer.");
    return;
  }

  const userAnswer = answerInput.value.trim().toLowerCase();
  
  // 3. Validate answer input and current question
  if (!userAnswer || !currentQuestion) {
    console.log("No answer provided or no current question.");
    return;
  }

  let isCorrect = false;
  const correctAnswers = Object.values(currentQuestion.answer).map(ans => ans.toLowerCase());
  
  // 4. Answer validation logic
  for (const ans of correctAnswers) {
    const ansWords = ans.split(/\s+/);
    if (userAnswer === ans || ansWords.includes(userAnswer)) {
      isCorrect = true;
      break;
    }
  }

  // 5. Handle correct answer
  if (isCorrect) {
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
      socket.emit('letterStatusUpdate', {
        room: currentRoom,
        player: myPlayer,
        letter: selectedLetter.textContent,
        status: 'correct'
      });
      socket.emit('alphabetUpdate', {
        room: currentRoom,
        player: myPlayer,
        queue: myPlayer === 1 ? player1Queue : player2Queue
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
    // 6. Handle incorrect answer
    selectedLetter.classList.add('incorrect', 'used');
    incorrectSound.play();
    if (isMultiplayer) {
      if (myPlayer === 1) {
        player1Queue.shift();
      } else {
        player2Queue.shift();
      }
      socket.emit('playerMove', {
        room: currentRoom,
        playerId: myPlayer,
        answer: userAnswer,
        isCorrect: false
      });
      socket.emit('playerAction', { room: currentRoom, action: 'wrongAnswer' });
      socket.emit('letterStatusUpdate', {
        room: currentRoom,
        player: myPlayer,
        letter: selectedLetter.textContent,
        status: 'incorrect'
      });
      socket.emit('alphabetUpdate', {
        room: currentRoom,
        player: myPlayer,
        queue: myPlayer === 1 ? player1Queue : player2Queue
      });
    } else {
      if (currentPlayer === 1) {
        player1Queue.shift();
      } else {
        player2Queue.shift();
      }
      if (!isPlayerFinished(getOtherPlayer(currentPlayer))) {
        currentPlayer = getOtherPlayer(currentPlayer);
      }
    }
  }

  // 7. Cleanup and next steps
  answerInput.value = "";
  console.log("Checking end game conditions...");
  checkEndGame();
  loadNextQuestion();
}

function loadNextQuestion() {
  if (isMultiplayer) {
    // Check if the active player's queue is empty and lock them if so
    if (currentPlayer === player1SocketId && player1Queue.length === 0) {
      if (!player1Locked) {
        player1Locked = true;
        socket.emit('playerAction', { room: currentRoom, action: 'emptyQueue', player: 1 });
      }
      if (!player2Locked && player2Queue.length > 0 && timeLeftPlayer2 > 0) {
        currentPlayer = player2SocketId;
      } else {
        endGame();
        return;
      }
    } else if (currentPlayer === player2SocketId && player2Queue.length === 0) {
      if (!player2Locked) {
        player2Locked = true;
        socket.emit('playerAction', { room: currentRoom, action: 'emptyQueue', player: 2 });
      }
      if (!player1Locked && player1Queue.length > 0 && timeLeftPlayer1 > 0) {
        currentPlayer = player1SocketId;
      } else {
        endGame();
        return;
      }
    }

    // End game if both players have no questions left or both timers have expired
    if ((player1Queue.length === 0 && player2Queue.length === 0) || (timeLeftPlayer1 <= 0 && timeLeftPlayer2 <= 0)) {
      endGame();
      return;
    }

    // Check if the local player has finished their questions/time while the opponent still has time/questions
    if (myPlayer === 1) {
      if ((player1Queue.length === 0 || timeLeftPlayer1 <= 0) && (player2Queue.length > 0 && timeLeftPlayer2 > 0)) {
        document.getElementById('question').textContent = "Waiting for your opponent to finish";
        answerInput.disabled = true;
        return;
      }
    } else if (myPlayer === 2) {
      if ((player2Queue.length === 0 || timeLeftPlayer2 <= 0) && (player1Queue.length > 0 && timeLeftPlayer1 > 0)) {
        document.getElementById('question').textContent = "Waiting for your opponent to finish";
        answerInput.disabled = true;
        return;
      }
    }

    // Determine the current active player's queue
    let currentQueue = (myPlayer === 1) ? player1Queue : player2Queue;

    // If the active player's queue is empty but the opponent still has questions,
    // automatically skip this player's turn so the opponent can play.
    if (currentQueue.length === 0) {
      socket.emit('playerAction', { 
        room: currentRoom, 
        action: 'skip', 
        currentTime: (myPlayer === 1 ? timeLeftPlayer1 : timeLeftPlayer2) 
      });
      return;
    }

    // Otherwise, load the next question from the active player's queue.
    const nextLetter = currentQueue[0];
    const questionKey = nextLetter.toUpperCase();
    let questionData = (myPlayer === 1) ? player1Questions[questionKey] : player2Questions[questionKey];

    if (!questionData) {
      // If question not found, remove the letter and try the next one.
      currentQueue.shift();
      loadNextQuestion();
      return;
    }

    // Load question only if it's your turn.
    if (currentPlayer === socket.id) {
      loadQuestion(nextLetter, myPlayer);
    }

    // Update the alphabet circles for both players.
    activatePlayerLetter(1);
    activatePlayerLetter(2);

    // UI adjustments for waiting vs active player.
    const isActivePlayer = (currentPlayer === socket.id);
    const questionContainer = document.getElementById('question-container');
    const questionElement = document.getElementById('question');
    const answerContainer = document.querySelector('.answer-container');
    const skipBtn = document.getElementById('skip-btn');
    const existingWaitingMessage = document.getElementById('waiting-message');

    if (existingWaitingMessage) existingWaitingMessage.remove();

    if (isActivePlayer) {
      questionElement.style.display = 'block';
      answerContainer.style.display = 'flex';
      skipBtn.style.display = 'block';
      document.getElementById('submit-answer').style.display = 'block';
    } else {
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
    // Same-screen mode logic: end game only when both queues are empty.
    if (player1Queue.length === 0 && player2Queue.length === 0) {
      endGame();
      return;
    }
    let currentQueue = (currentPlayer === 1) ? player1Queue : player2Queue;
    if (currentQueue.length === 0) {
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
  console.log("[Debug] Player 1 Queue:", player1Queue.length, "Time:", timeLeftPlayer1, "Locked:", player1Locked);
  console.log("[Debug] Player 2 Queue:", player2Queue.length, "Time:", timeLeftPlayer2, "Locked:", player2Locked);

  if ((player1Locked && player2Locked) ||
      (player1Queue.length === 0 && player2Queue.length === 0) ||
      (timeLeftPlayer1 <= 0 && timeLeftPlayer2 <= 0)) {
    console.log("[Debug] End game condition met!");
    endGame();
  }
}

function endGame() {
  clearInterval(timerInterval);
  gameOverSound.play();
  answerInput.disabled = true;
  document.getElementById('score1').textContent = player1Score;
  document.getElementById('score2').textContent = player2Score;
  
  // Hide game UI elements using class selectors
  document.getElementById('pause-btn').style.display = 'none';
  document.getElementById('player1-circle').style.display = 'none';
  document.getElementById('player2-circle').style.display = 'none';
  document.getElementById('question-container').style.display = 'none';
  document.querySelector('.answer-container').style.display = 'none';
  document.querySelector('.player-timer').style.display = 'none';
  document.getElementById('result').classList.add('show');
  
  // Push leaderboard data to Firebase
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
  player1Locked = false;
  player2Locked = false;
  document.getElementById('time1').textContent = 250;
  document.getElementById('time2').textContent = 250;
  document.getElementById('score1').textContent = 0;
  document.getElementById('score2').textContent = 0;
  document.getElementById('result').style.display = 'none';
  document.getElementById('pause-btn').textContent = 'Pause';
  document.querySelectorAll('.letter').forEach(letter => {
    letter.classList.remove('correct', 'incorrect', 'used', 'active', 'skipped');
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

// -----------------------
// Language Switching (Ensuring it doesn't affect game turns)
// -----------------------
function loadLanguage(lang) {
  fetch(`${lang}.json`)
    .then(response => response.json())
    .then(translations => {
      // Update only static UI elements
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
      console.log(`Language switched to: ${lang}`);
      
      // Now update the current question UI separately
      updateCurrentQuestionUI();
    })
    .catch(err => console.error("Error loading language file:", err));
}

function updateCurrentQuestionUI() {
  // Update only the text of the current question without affecting any game state.
  if (currentQuestion && currentQuestion.question) {
    const currentLang = document.getElementById('languageSwitcher').value;
    questionElement.textContent = currentQuestion.question[currentLang] || questionElement.textContent;
  }
}


document.getElementById('languageSwitcher').addEventListener('change', (event) => {
  event.stopPropagation();
  event.preventDefault();
  const switcher = event.target;
  switcher.disabled = true;  // Prevent rapid changes
  console.log("Before language switch, currentPlayer:", currentPlayer);
  loadLanguage(event.target.value);
  setTimeout(() => {
    switcher.disabled = false;
    console.log("After language switch, currentPlayer:", currentPlayer);
  }, 500);
});

document.addEventListener("DOMContentLoaded", () => {
  loadLanguage("en");
});
