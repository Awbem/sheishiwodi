import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  get,
  update,
  onValue,
  push
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-database.js";
import { wordPairs } from "./Word Pairs List.js";

const firebaseConfig = {
  apiKey: "AIzaSyB1kwo_nacyyutab8VElG5H6wCzpdQ9Xbk",
  authDomain: "awbem-sheishiwodi.firebaseapp.com",
  databaseURL: "https://awbem-sheishiwodi-default-rtdb.firebaseio.com",
  projectId: "awbem-sheishiwodi",
  storageBucket: "awbem-sheishiwodi.firebasestorage.app",
  messagingSenderId: "243647216347",
  appId: "1:243647216347:web:ff462f749e4c4361a42afe"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);


let currentRoomCode = "";
let currentPlayerId = "";
const lastPlayerWords = new Map();

const playerCountInput = document.getElementById("playerCountInput");
const createRoomBtn = document.getElementById("createRoomBtn");
const teacherPanel = document.getElementById("teacherPanel");
const roomCodeDisplay = document.getElementById("roomCodeDisplay");
const startGameBtn = document.getElementById("startGameBtn");

const joinRoomCodeInput = document.getElementById("joinRoomCodeInput");
const playerNameInput = document.getElementById("playerNameInput");
const joinRoomBtn = document.getElementById("joinRoomBtn");

const playerPanel = document.getElementById("playerPanel");
const playerGreeting = document.getElementById("playerGreeting");
const gameStatusText = document.getElementById("gameStatusText");
const revealWordBtn = document.getElementById("revealWordBtn");
const secretWordCard = document.getElementById("secretWordCard");
const secretWordText = document.getElementById("secretWordText");

const lobbyPanel = document.getElementById("lobbyPanel");
const playersList = document.getElementById("playersList");

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  return code;
}

function chooseRandomWordPair() {
  return wordPairs[Math.floor(Math.random() * wordPairs.length)];
}

function show(element) {
  element.classList.remove("hidden");
}

function hide(element) {
  element.classList.add("hidden");
}

function showToast(message, duration = 2500) {
  const toast = document.createElement("div");
  toast.textContent = message;
  Object.assign(toast.style, {
    position: "fixed",
    bottom: "24px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(0,0,0,0.85)",
    color: "#fff",
    padding: "10px 16px",
    borderRadius: "8px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
    zIndex: 9999,
    opacity: 0,
    transition: "opacity 180ms ease-in-out"
  });

  document.body.appendChild(toast);

  // fade in
  requestAnimationFrame(() => {
    toast.style.opacity = 1;
  });

  // remove after duration
  setTimeout(() => {
    toast.style.opacity = 0;
    toast.addEventListener(
      "transitionend",
      () => {
        toast.remove();
      },
      { once: true }
    );
  }, duration);
}

createRoomBtn.addEventListener("click", async () => {
  const roomCode = generateRoomCode();
  const playerCount = Number(playerCountInput.value);
  const wordPair = chooseRandomWordPair();

  currentRoomCode = roomCode;

  await set(ref(db, `rooms/${roomCode}`), {
    status: "lobby",
    maxPlayers: playerCount,
    wordPair,
    createdAt: Date.now(),
    players: {}
  });

  roomCodeDisplay.textContent = roomCode;
  show(teacherPanel);
  watchRoom(roomCode);
});

joinRoomBtn.addEventListener("click", async () => {
  const roomCode = joinRoomCodeInput.value.trim().toUpperCase();
  const playerName = playerNameInput.value.trim();

  if (!roomCode || !playerName) {
    alert("Enter a room code and your name.");
    return;
  }

  const roomSnapshot = await get(ref(db, `rooms/${roomCode}`));

  if (!roomSnapshot.exists()) {
    alert("Room not found.");
    return;
  }

  const playerRef = push(ref(db, `rooms/${roomCode}/players`));

  currentRoomCode = roomCode;
  currentPlayerId = playerRef.key;

  await set(playerRef, {
    name: playerName,
    word: "",
    joinedAt: Date.now()
  });

  playerGreeting.textContent = `Hi, ${playerName}`;
  show(playerPanel);
  show(lobbyPanel);
  watchRoom(roomCode);
  // listen for changes to this player's data so UI updates on reshuffle
  watchPlayer(roomCode, currentPlayerId);
});

function watchPlayer(roomCode, playerId) {
  if (!roomCode || !playerId) return;
  const playerRef = ref(db, `rooms/${roomCode}/players/${playerId}`);
  onValue(playerRef, (snapshot) => {
    const player = snapshot.val();
    if (!player) return;

    const newWord = player.word || "";

    // If this is the first time we see this player, store current word and
    // initialize UI (no auto-hide on initial load).
    if (!lastPlayerWords.has(playerId)) {
      lastPlayerWords.set(playerId, newWord);
      if (!secretWordCard.classList.contains("hidden")) {
        secretWordText.textContent = newWord;
      }
      return;
    }

    const last = lastPlayerWords.get(playerId) || "";

    if (newWord !== last) {
      // Word changed (likely reshuffle) — auto-hide visible secret card.
      if (!secretWordCard.classList.contains("hidden")) {
        hide(secretWordCard);
        revealWordBtn.textContent = "Reveal My Word";
        showToast("Your word changed — it's hidden.");
      }

      lastPlayerWords.set(playerId, newWord);
      return;
    }

    // No change — if card visible, keep text in sync.
    if (!secretWordCard.classList.contains("hidden")) {
      secretWordText.textContent = newWord;
    }
  });
}

startGameBtn.addEventListener("click", async () => {
  const roomSnapshot = await get(ref(db, `rooms/${currentRoomCode}`));
  const room = roomSnapshot.val();

  if (!room || !room.players) {
    alert("No students have joined yet.");
    return;
  }

  const playerIds = Object.keys(room.players);

  // If game not started yet, enforce minimum/expected player counts.
  if (room.status !== "started") {
    if (playerIds.length < 3) {
      alert("You need at least 3 players.");
      return;
    }

    if (room.maxPlayers && playerIds.length < room.maxPlayers) {
      alert(`Waiting for all ${room.maxPlayers} players to join. ${playerIds.length} of ${room.maxPlayers} have joined.`);
      return;
    }
  }

  // Choose a new word pair and undercover each time this button is pressed.
  const wasStarted = room.status === "started";
  const newWordPair = chooseRandomWordPair();
  const undercoverIndex = Math.floor(Math.random() * playerIds.length);
  const undercoverPlayerId = playerIds[undercoverIndex];

  const updates = {
    [`rooms/${currentRoomCode}/status`]: "started",
    [`rooms/${currentRoomCode}/undercoverPlayerId`]: undercoverPlayerId,
    [`rooms/${currentRoomCode}/wordPair`]: newWordPair
  };

  playerIds.forEach((playerId) => {
    const word = playerId === undercoverPlayerId ? newWordPair.undercover : newWordPair.normal;
    updates[`rooms/${currentRoomCode}/players/${playerId}/word`] = word;
  });

  await update(ref(db), updates);
  startGameBtn.textContent = "Words Sent! Click again to reshuffle.";
  showToast(wasStarted ? "Words reshuffled." : "Words sent to players.");
});

revealWordBtn.addEventListener("click", async () => {
  const playerSnapshot = await get(
    ref(db, `rooms/${currentRoomCode}/players/${currentPlayerId}`)
  );

  const player = playerSnapshot.val();

  if (!player || !player.word) {
    alert("Your word is not ready yet.");
    return;
  }

  secretWordText.textContent = player.word;
  secretWordCard.classList.toggle("hidden");

  revealWordBtn.textContent = secretWordCard.classList.contains("hidden")
    ? "Reveal My Word"
    : "Hide My Word";
});

function watchRoom(roomCode) {
  const roomRef = ref(db, `rooms/${roomCode}`);

  onValue(roomRef, (snapshot) => {
    const room = snapshot.val();

    if (!room) return;

    renderPlayers(room.players || {});

    const playerIds = room.players ? Object.keys(room.players) : [];
    if (room.maxPlayers && playerIds.length < room.maxPlayers) {
      startGameBtn.disabled = true;
      startGameBtn.textContent = `Waiting for players (${playerIds.length}/${room.maxPlayers})`;
    } else {
      startGameBtn.disabled = false;
      if (room.status !== "started") {
        startGameBtn.textContent = "Start Game";
      } else {
        startGameBtn.textContent = "Words Sent! Click again to reshuffle.";
      }
    }

    if (room.status === "started") {
      gameStatusText.textContent = "The game has started.";
      show(revealWordBtn);
    } else {
      gameStatusText.textContent = "Waiting for the teacher to start the game...";
      hide(revealWordBtn);
      hide(secretWordCard);
    }
  });
}

function renderPlayers(players) {
  playersList.innerHTML = "";

  Object.values(players).forEach((player) => {
    const li = document.createElement("li");
    li.textContent = player.name;
    playersList.appendChild(li);
  });

  show(lobbyPanel);
}