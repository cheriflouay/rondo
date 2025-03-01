import { getDatabase, ref, child, get, push } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { app, db } from "./firebase-config.js";

// Game State
let timeLeftPlayer1 = 150;
let timeLeftPlayer2 = 150;
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
let currentLetterIndex = 0; // Track current letter position

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

// Event Listeners
document.getElementById('skip-btn').addEventListener('click', skipTurn);
document.getElementById('submit-answer').addEventListener('click', checkAnswer);
document.getElementById('restart-btn').addEventListener('click', restartGame);
document.getElementById('pause-btn').addEventListener('click', togglePause);
answerInput.addEventListener('keypress', (e) => e.key === 'Enter' && checkAnswer());

// Fetch Questions from Firebase
async function fetchQuestions() {
    try {
        const [player1SetsSnapshot, player2SetsSnapshot] = await Promise.all([
            get(child(ref(db), 'player1_sets')),
            get(child(ref(db), 'player2_sets'))
        ]);

        const player1Sets = player1SetsSnapshot.exists() ? player1SetsSnapshot.val() : {};
        const player2Sets = player2SetsSnapshot.exists() ? player2SetsSnapshot.val() : {};

        const player1SetKeys = Object.keys(player1Sets);
        const player2SetKeys = Object.keys(player2Sets);

        player1Questions = player1Sets[player1SetKeys[Math.floor(Math.random() * player1SetKeys.length)]];
        player2Questions = player2Sets[player2SetKeys[Math.floor(Math.random() * player2SetKeys.length)]];

        initializeGame();
    } catch (error) {
        console.error("Error loading questions:", error);
    }
}

// Initialize Game
function initializeGame() {
    generateAlphabetCircles();
    startTimer();
    switchPlayer(1);
    currentLetterIndex = 0;
    loadNextQuestion();
}

function generateAlphabetCircles() {
    generateAlphabetCircle('alphabet-circle-1', player1Questions, 1);
    generateAlphabetCircle('alphabet-circle-2', player2Questions, 2);
}

function generateAlphabetCircle(circleId, questions, playerNumber) {
    const circle = document.getElementById(circleId);
    circle.innerHTML = '';
    const radius = 120;
    const centerX = circle.offsetWidth / 2;
    const centerY = circle.offsetHeight / 2;

    alphabet.forEach((letter, index) => {
        const angle = (index / alphabet.length) * (2 * Math.PI);
        const x = centerX + radius * Math.cos(angle) - 20;
        const y = centerY + radius * Math.sin(angle) - 20;

        const letterDiv = document.createElement("div");
        letterDiv.className = "letter";
        letterDiv.textContent = letter;
        letterDiv.style.transform = `translate(${x - centerX}px, ${y - centerY}px)`;
        circle.appendChild(letterDiv);
    });
}

function activateCurrentLetter() {
    const letters = document.querySelectorAll('.letter');
    letters.forEach(letter => {
        letter.classList.remove('active');
        if (letter.textContent === alphabet[currentLetterIndex]) {
            selectedLetter = letter;
            letter.classList.add('active');
        }
    });
}

function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (!isPaused) {
            if (currentPlayer === 1) timeLeftPlayer1--;
            else timeLeftPlayer2--;

            time1Element.textContent = timeLeftPlayer1;
            time2Element.textContent = timeLeftPlayer2;

            if (timeLeftPlayer1 <= 0 || timeLeftPlayer2 <= 0) endGame();
        }
    }, 1000);
}

function switchPlayer(player) {
    currentPlayer = player;
    player1Circle.classList.toggle('active', player === 1);
    player2Circle.classList.toggle('active', player === 2);
    answerInput.value = "";
}

function skipTurn() {
    switchPlayer(currentPlayer === 1 ? 2 : 1);
}

function loadQuestion(letter, playerNumber) {
    currentQuestion = (playerNumber === 1) ? 
        player1Questions[letter] : 
        player2Questions[letter];
    questionElement.textContent = currentQuestion?.question || "Question not found";
}

function checkAnswer() {
    const userAnswer = answerInput.value.trim().toLowerCase();
    const correctAnswer = currentQuestion?.answer.toLowerCase();

    if (!userAnswer || !currentQuestion) return;

    if (userAnswer === correctAnswer) {
        currentPlayer === 1 ? player1Score++ : player2Score++;
        document.getElementById(`score${currentPlayer}`).textContent = currentPlayer === 1 ? player1Score : player2Score;
        selectedLetter.classList.add('correct', 'used');
        correctSound.play();
    } else {
        selectedLetter.classList.add('incorrect', 'used');
        incorrectSound.play();
        switchPlayer(currentPlayer === 1 ? 2 : 1);
    }
    answerInput.value = "";

    currentLetterIndex++;
    if (currentLetterIndex >= alphabet.length) {
        endGame();
        return;
    }
    
    loadNextQuestion();
}

function loadNextQuestion() {
    const nextLetter = alphabet[currentLetterIndex];
    loadQuestion(nextLetter, currentPlayer);
    activateCurrentLetter();
    answerInput.focus();
}

function endGame() {
    clearInterval(timerInterval);
    gameOverSound.play();
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
    timeLeftPlayer1 = 150;
    timeLeftPlayer2 = 150;
    player1Score = 0;
    player2Score = 0;
    currentPlayer = 1;
    isPaused = false;
    currentLetterIndex = 0;

    document.getElementById('time1').textContent = 150;
    document.getElementById('time2').textContent = 150;
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

// Start the Game
fetchQuestions();