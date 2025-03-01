import { getDatabase, ref, child, get } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { app, db } from "./firebase-config.js";

let timeLeftPlayer1 = 150;
let timeLeftPlayer2 = 150;
let currentPlayer = 1;
let timerInterval = null;
let player1Questions = {}; // Selected set of questions for Player 1
let player2Questions = {}; // Selected set of questions for Player 2
let currentQuestion = null;
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
let selectedLetter = null;
let player1Score = 0;
let player2Score = 0;

// DOM Elements
const questionElement = document.getElementById('question');
const time1Element = document.getElementById('time1');
const time2Element = document.getElementById('time2');
const answerInput = document.getElementById('answer-input');
const player1Circle = document.getElementById('player1-circle');
const player2Circle = document.getElementById('player2-circle');

// Event Listeners
document.getElementById('skip-btn').addEventListener('click', skipTurn);
document.getElementById('submit-answer').addEventListener('click', checkAnswer);
answerInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') checkAnswer();
});

async function fetchQuestions() {
    try {
        // Fetch all question sets for Player 1
        const player1SetsSnapshot = await get(child(ref(db), 'player1_sets'));
        const player1Sets = player1SetsSnapshot.exists() ? player1SetsSnapshot.val() : {};
        
        // Fetch all question sets for Player 2
        const player2SetsSnapshot = await get(child(ref(db), 'player2_sets'));
        const player2Sets = player2SetsSnapshot.exists() ? player2SetsSnapshot.val() : {};

        // Randomly select one set for each player
        const player1SetKeys = Object.keys(player1Sets);
        const player2SetKeys = Object.keys(player2Sets);

        if (player1SetKeys.length > 0) {
            const randomPlayer1SetKey = player1SetKeys[Math.floor(Math.random() * player1SetKeys.length)];
            player1Questions = player1Sets[randomPlayer1SetKey];
        } else {
            console.error("No question sets available for Player 1");
        }

        if (player2SetKeys.length > 0) {
            const randomPlayer2SetKey = player2SetKeys[Math.floor(Math.random() * player2SetKeys.length)];
            player2Questions = player2Sets[randomPlayer2SetKey];
        } else {
            console.error("No question sets available for Player 2");
        }

        initializeGame();
    } catch (error) {
        console.error("Error loading questions:", error);
    }
}

function initializeGame() {
    generateAlphabetCircle('alphabet-circle-1', player1Questions, 'player1');
    generateAlphabetCircle('alphabet-circle-2', player2Questions, 'player2');
    startTimer();
    switchPlayer(1); // Start with Player 1
}

function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (currentPlayer === 1) {
            timeLeftPlayer1--;
            time1Element.textContent = timeLeftPlayer1;
        } else {
            timeLeftPlayer2--;
            time2Element.textContent = timeLeftPlayer2;
        }
        
        if (timeLeftPlayer1 <= 0 || timeLeftPlayer2 <= 0) {
            endGame();
        }
    }, 1000);
}

function switchPlayer(player) {
    currentPlayer = player;
    if (player === 1) {
        player1Circle.classList.add('active');
        player2Circle.classList.remove('active');
    } else {
        player2Circle.classList.add('active');
        player1Circle.classList.remove('active');
    }
    answerInput.value = "";
    if (selectedLetter) selectedLetter.classList.remove('active');
    startTimer();
}

function skipTurn() {
    switchPlayer(currentPlayer === 1 ? 2 : 1);
}

function loadQuestion(letter, player) {
    if (player === 1) {
        currentQuestion = player1Questions[letter];
    } else {
        currentQuestion = player2Questions[letter];
    }
    questionElement.textContent = currentQuestion?.question || "Question not found";
}

function generateAlphabetCircle(circleId, questions, player) {
    const circle = document.getElementById(circleId);
    const radius = 120;
    const containerWidth = circle.offsetWidth;
    const containerHeight = circle.offsetHeight;
    const centerX = containerWidth / 2;
    const centerY = containerHeight / 2;

    alphabet.forEach((letter, index) => {
        const angle = (index / alphabet.length) * (2 * Math.PI);
        const x = centerX + radius * Math.cos(angle) - 20;
        const y = centerY + radius * Math.sin(angle) - 20;

        const letterDiv = document.createElement("div");
        letterDiv.className = "letter";
        letterDiv.textContent = letter;
        letterDiv.style.position = "absolute";
        letterDiv.style.left = "50%";
        letterDiv.style.top = "50%";
        letterDiv.style.transform = `translate(${x - centerX}px, ${y - centerY}px)`;
        
        letterDiv.addEventListener('click', () => {
            if (selectedLetter) selectedLetter.classList.remove('active');
            selectedLetter = letterDiv;
            letterDiv.classList.add('active');
            loadQuestion(letter, player);
            answerInput.focus();
        });

        circle.appendChild(letterDiv);
    });
}

function checkAnswer() {
    const userAnswer = answerInput.value.trim();
    const correctAnswer = currentQuestion?.answer.toLowerCase();
    
    if (!userAnswer || !currentQuestion) return;
    
    if (userAnswer.toLowerCase() === correctAnswer) {
        // Update score
        currentPlayer === 1 ? player1Score++ : player2Score++;
        document.getElementById(`score${currentPlayer}`).textContent = 
            currentPlayer === 1 ? player1Score : player2Score;
        
        // Visual feedback
        selectedLetter.classList.add('correct');
        answerInput.value = "";
        alert('Correct! +1 point');
    } else {
        // Switch turns immediately on wrong answer
        selectedLetter.classList.add('incorrect');
        alert('Incorrect! Switching turns...');
        switchPlayer(currentPlayer === 1 ? 2 : 1);
    }
}

function endGame() {
    clearInterval(timerInterval);
    const resultElement = document.getElementById('result');
    const winnerElement = document.getElementById('winner-message');
    
    resultElement.style.display = 'block';
    document.getElementById('score1').textContent = player1Score;
    document.getElementById('score2').textContent = player2Score;
    
    if (player1Score > player2Score) {
        winnerElement.textContent = "Player 1 Wins! 🏆";
    } else if (player2Score > player1Score) {
        winnerElement.textContent = "Player 2 Wins! 🏆";
    } else {
        winnerElement.textContent = "It's a Draw! 🤝";
    }
}

// Start the game
fetchQuestions();