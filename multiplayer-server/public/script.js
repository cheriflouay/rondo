// script.js
import { getDatabase, ref, child, get, push } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { app, db } from "./firebase-config.js";

// -----------------------
// Socket.IO Integration
// -----------------------
const socket = io();
let currentRoom = null;
let myPlayerNumber = null;         // 1 or 2
let currentTurnSocketId = null;    // Socket id of the player whose turn it is

// -----------------------
// DOM Elements
// -----------------------
const lobby = document.getElementById("lobby");
const gameContainer = document.getElementById("game-container");
const roomDisplay = document.getElementById("room-code-display");
const questionElement = document.getElementById("question");
const answerInput = document.getElementById("answer-input");
const time1Element = document.getElementById("time1");
const time2Element = document.getElementById("time2");
const player1Circle = document.getElementById("player1-circle");
const player2Circle = document.getElementById("player2-circle");
const skipBtn = document.getElementById("skip-btn");
const submitBtn = document.getElementById("submit-answer");
const restartBtn = document.getElementById("restart-btn");
const pauseBtn = document.getElementById("pause-btn"); // will be hidden
const score1Element = document.getElementById("score1");
const score2Element = document.getElementById("score2");
const resultElement = document.getElementById("result");
const winnerMessage = document.getElementById("winner-message");

// Sound Elements
const correctSound = document.getElementById("correct-sound");
const incorrectSound = document.getElementById("incorrect-sound");
const gameOverSound = document.getElementById("game-over-sound");

// Hide pause button (it's not needed)
document.addEventListener("DOMContentLoaded", () => {
  if (pauseBtn) {
    pauseBtn.style.display = "none";
  }
});

// -----------------------
// Room Creation / Joining
// -----------------------
document.getElementById("create-room-btn").addEventListener("click", () => {
  socket.emit("createRoom");
});

document.getElementById("join-room-btn").addEventListener("click", () => {
  const roomCode = document.getElementById("room-code-input").value.trim();
  if (roomCode) {
    socket.emit("joinRoom", { room: roomCode });
  }
});

// -----------------------
// Socket Event Handlers
// -----------------------
socket.on("roomCreated", (data) => {
  currentRoom = data.room;
  myPlayerNumber = 1;
  roomDisplay.textContent = `Room Code: ${data.room}`;
  roomDisplay.style.display = "block";
  console.log("Room created:", data.room);
});

socket.on("roomJoined", (data) => {
  currentRoom = data.room;
  // Assign player number based on the players array from the server
  myPlayerNumber = data.players[0] === socket.id ? 1 : 2;
  roomDisplay.textContent = `Joined Room: ${data.room}`;
  roomDisplay.style.display = "block";
  console.log("Room joined:", data.room);
});

socket.on("startGame", ({ room, currentTurn }) => {
  currentRoom = room;
  currentTurnSocketId = currentTurn;
  console.log(`Game started in room: ${room}, active turn: ${currentTurn}`);
  lobby.style.display = "none";
  gameContainer.style.display = "block";
  fetchQuestions();
  updateTurnUI();
});

socket.on("turnChanged", ({ currentTurn }) => {
  currentTurnSocketId = currentTurn;
  console.log("Turn changed. New active socket:", currentTurn);
  updateTurnUI();
  // If it becomes your turn, load the next question and reset the timer.
  if (socket.id === currentTurnSocketId) {
    loadNextQuestion();
    resetTimerForMyTurn();
  }
});

socket.on("playerMove", (data) => {
  console.log("Received move from player", data.playerId, ":", data);
  // Additional shared-state updates can go here if needed.
});

// -----------------------
// Game State Variables
// -----------------------
let timeLeft = 250;
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

// -----------------------
// Firebase: Fetch Questions
// -----------------------
async function fetchQuestions() {
  try {
    const setsSnapshot = await get(child(ref(db), "player_sets"));
    const sets = setsSnapshot.exists() ? setsSnapshot.val() : {};
    const setKeys = Object.keys(sets);
    // Randomly assign a question set for each player
    player1Questions = sets[setKeys[Math.floor(Math.random() * setKeys.length)]];
    player2Questions = sets[setKeys[Math.floor(Math.random() * setKeys.length)]];
    initializeGame();
  } catch (error) {
    console.error("Error loading questions:", error);
  }
}

function initializeGame() {
  // Reset queues and scores for the current player
  if (myPlayerNumber === 1) {
    player1Queue = [...alphabet];
  } else {
    player2Queue = [...alphabet];
  }
  player1Score = 0;
  player2Score = 0;
  score1Element.textContent = player1Score;
  score2Element.textContent = player2Score;
  generateAlphabetCircles();
  resetTimerForMyTurn();
  loadNextQuestion();
}

// -----------------------
// Alphabet Circle Generation
// -----------------------
function generateAlphabetCircles() {
  // Only show the circle for your player number.
  if (myPlayerNumber === 1) {
    player1Circle.style.display = "block";
    player2Circle.style.display = "none";
    document.getElementById("alphabet-circle-1").innerHTML = "";
    generateAlphabetCircle("alphabet-circle-1", player1Questions, 1);
  } else {
    player2Circle.style.display = "block";
    player1Circle.style.display = "none";
    document.getElementById("alphabet-circle-2").innerHTML = "";
    generateAlphabetCircle("alphabet-circle-2", player2Questions, 2);
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
  const circleId = myPlayerNumber === 1 ? "alphabet-circle-1" : "alphabet-circle-2";
  const circle = document.getElementById(circleId);
  const letters = circle.querySelectorAll(".letter");
  const currentQueue = myPlayerNumber === 1 ? player1Queue : player2Queue;
  const currentLetter = currentQueue[0];
  letters.forEach(letter => {
    letter.classList.remove("active");
    if (letter.textContent === currentLetter) {
      letter.classList.add("active");
      selectedLetter = letter;
    }
  });
}

// -----------------------
// Timer Functions
// -----------------------
function resetTimerForMyTurn() {
  // Reset the timer only for the active player
  timeLeft = 250;
  updateTimerUI();
  if (timerInterval) clearInterval(timerInterval);
  if (socket.id === currentTurnSocketId) {
    timerInterval = setInterval(() => {
      if (!isPaused) {
        timeLeft--;
        updateTimerUI();
        if (timeLeft <= 0) {
          timeLeft = 0;
          updateTimerUI();
          // Emit a timeout action so the server can change the turn
          socket.emit("playerAction", { room: currentRoom, action: "timeout" });
          clearInterval(timerInterval);
        }
      }
    }, 1000);
  }
}

function updateTimerUI() {
  if (myPlayerNumber === 1) {
    time1Element.textContent = timeLeft;
  } else {
    time2Element.textContent = timeLeft;
  }
}

// -----------------------
// Game Action Functions
// -----------------------
function skipTurn() {
  if (socket.id !== currentTurnSocketId) return;
  if (myPlayerNumber === 1) {
    player1Queue.push(player1Queue.shift());
  } else {
    player2Queue.push(player2Queue.shift());
  }
  socket.emit("playerAction", { room: currentRoom, action: "skip" });
}

function loadQuestion(letter, playerNumber) {
  currentQuestion = playerNumber === 1 ? player1Questions[letter] : player2Questions[letter];
  const currentLang = document.getElementById("languageSwitcher").value;
  questionElement.textContent =
    currentQuestion && currentQuestion.question && currentQuestion.question[currentLang]
      ? currentQuestion.question[currentLang]
      : "Question not found";
}

function loadNextQuestion() {
  const currentQueue = myPlayerNumber === 1 ? player1Queue : player2Queue;
  if (currentQueue.length === 0) {
    endGame();
    return;
  }
  const nextLetter = currentQueue[0];
  loadQuestion(nextLetter, myPlayerNumber);
  activateCurrentLetter();
  answerInput.focus();
}

function checkAnswer() {
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
    if (myPlayerNumber === 1) {
      player1Score++;
      score1Element.textContent = player1Score;
      player1Queue.shift();
    } else {
      player2Score++;
      score2Element.textContent = player2Score;
      player2Queue.shift();
    }
    selectedLetter.classList.add("correct", "used");
    correctSound.play();
    loadNextQuestion();
  } else {
    selectedLetter.classList.add("incorrect", "used");
    incorrectSound.play();
    if (myPlayerNumber === 1) {
      player1Queue.push(player1Queue.shift());
    } else {
      player2Queue.push(player2Queue.shift());
    }
    socket.emit("playerAction", { room: currentRoom, action: "wrongAnswer" });
  }
  socket.emit("playerMove", {
    room: currentRoom,
    playerId: myPlayerNumber,
    answer: userAnswer,
    isCorrect: isCorrect
  });
  answerInput.value = "";
  checkEndGame();
}

function checkEndGame() {
  if (player1Queue.length === 0 || player2Queue.length === 0) {
    endGame();
  }
}

function endGame() {
  clearInterval(timerInterval);
  gameOverSound.play();
  answerInput.disabled = true;
  submitBtn.disabled = true;
  skipBtn.disabled = true;
  resultElement.style.display = "block";
  score1Element.textContent = player1Score;
  score2Element.textContent = player2Score;
  push(ref(db, "leaderboard"), {
    player1Score,
    player2Score,
    timestamp: new Date().toISOString()
  });
  if (player1Score > player2Score) {
    winnerMessage.textContent = "Player 1 Wins! 🏆";
  } else if (player2Score > player1Score) {
    winnerMessage.textContent = "Player 2 Wins! 🏆";
  } else {
    winnerMessage.textContent = "It's a Draw! 🤝";
  }
}

function restartGame() {
  clearInterval(timerInterval);
  timeLeft = 250;
  player1Score = 0;
  player2Score = 0;
  isPaused = false;
  if (myPlayerNumber === 1) {
    player1Queue = [...alphabet];
  } else {
    player2Queue = [...alphabet];
  }
  time1Element.textContent = 250;
  time2Element.textContent = 250;
  score1Element.textContent = 0;
  score2Element.textContent = 0;
  resultElement.style.display = "none";
  document.querySelectorAll(".letter").forEach(letter => {
    letter.classList.remove("correct", "incorrect", "used", "active");
  });
  fetchQuestions();
}

// -----------------------
// Event Listeners for Game Actions
// -----------------------
skipBtn.addEventListener("click", skipTurn);
submitBtn.addEventListener("click", checkAnswer);
restartBtn.addEventListener("click", restartGame);
answerInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    checkAnswer();
  }
});

// -----------------------
// Language Switching (Unchanged)
// -----------------------
function loadLanguage(lang) {
  fetch(`${lang}.json`)
    .then(response => response.json())
    .then(translations => {
      document.querySelectorAll("[data-i18n]").forEach(elem => {
        const key = elem.getAttribute("data-i18n");
        if (translations[key]) {
          elem.textContent = translations[key];
        }
      });
      const answerInput = document.getElementById("answer-input");
      if (answerInput && translations["answerPlaceholder"]) {
        answerInput.placeholder = translations["answerPlaceholder"];
      }
      document.documentElement.lang = lang;
      document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    })
    .catch(err => console.error("Error loading language file:", err));
}
document.getElementById("languageSwitcher").addEventListener("change", (event) => {
  loadLanguage(event.target.value);
});
document.addEventListener("DOMContentLoaded", () => {
  loadLanguage("en");
});
