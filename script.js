const composer = document.getElementById("composer");
const input = document.getElementById("messageInput");
const chat = document.getElementById("chat");
const micButton = document.getElementById("micButton");
const sendButton = composer.querySelector('button[type="submit"]');
const newChatButton = document.getElementById("newChatButton");
const modeSelector = document.getElementById("modeSelector");
const modeValue = document.getElementById("modeValue");
const modeDescription = document.getElementById("modeDescription");

const MEMORY_KEY = "nexa_conversation";
const USER_ID_KEY = "nexa_user_id";
const MODE_KEY = "nexa_response_mode";
const API_URL = "https://nexa-2.pages.dev/api/chat";

const MODE_INFO = {
  none: {
    label: "Nenhum",
    description: "Resposta direta, com o mínimo de raciocínio."
  },
  low: {
    label: "Baixo",
    description: "Rápido, mas com uma análise curta antes de responder."
  },
  medium: {
    label: "Médio",
    description: "Equilíbrio entre velocidade e profundidade."
  },
  high: {
    label: "Alto",
    description: "Mais análise para perguntas complexas."
  },
  maximum: {
    label: "Máximo",
    description: "Maior profundidade, podendo demorar mais."
  }
};

const history = [];

let responseMode =
  localStorage.getItem(MODE_KEY) || "medium";

if (!MODE_INFO[responseMode]) {
  responseMode = "medium";
}

function updateModeUI() {
  const info = MODE_INFO[responseMode];

  modeValue.textContent = info.label;
  modeDescription.textContent = info.description;

  modeSelector
    .querySelectorAll("button")
    .forEach(function(button) {
      button.classList.toggle(
        "active",
        button.dataset.mode === responseMode
      );
    });
}

modeSelector.addEventListener("click", function(event) {
  const button = event.target.closest("button[data-mode]");

  if (!button) return;

  responseMode = button.dataset.mode;
  localStorage.setItem(MODE_KEY, responseMode);
  updateModeUI();
});

updateModeUI();

/* =========================
   VOZ DA NEXA
========================= */

let speechEnabled = true;
let selectedVoice = null;

function loadNexaVoice() {
  if (!("speechSynthesis" in window)) return;

  const voices = window.speechSynthesis.getVoices();

  if (!voices.length) return;

  selectedVoice =
    voices.find(
      voice =>
        voice.lang &&
        voice.lang.toLowerCase() === "pt-br"
    ) ||
    voices.find(
      voice =>
        voice.lang &&
        voice.lang.toLowerCase().startsWith("pt")
    ) ||
    null;
}

function speakNexa(text) {
  if (
    !speechEnabled ||
    !("speechSynthesis" in window) ||
    !text
  ) {
    return;
  }

  window.speechSynthesis.cancel();

  const cleanText = text
    .replace(/[*_`#]/g, "")
    .replace(/\n+/g, " ")
    .trim();

  if (!cleanText) return;

  const utterance = new SpeechSynthesisUtterance(cleanText);

  utterance.lang = "pt-BR";

  if (selectedVoice) {
    utterance.voice = selectedVoice;
  }

  utterance.rate = 1.02;
  utterance.pitch = 1;
  utterance.volume = 1;

  window.speechSynthesis.speak(utterance);
}

if ("speechSynthesis" in window) {
  loadNexaVoice();
  window.speechSynthesis.onvoiceschanged = loadNexaVoice;
}

/* =========================
   ID PERMANENTE
========================= */

function getUserId() {
  let userId = localStorage.getItem(USER_ID_KEY);

  if (!userId) {
    userId = "user_" + crypto.randomUUID();

    localStorage.setItem(USER_ID_KEY, userId);
  }

  return userId;
}

const userId = getUserId();

/* =========================
   MEMÓRIA LOCAL
========================= */

function saveMemory() {
  localStorage.setItem(
    MEMORY_KEY,
    JSON.stringify(history)
  );
}

function loadMemory() {
  try {
    const saved = localStorage.getItem(MEMORY_KEY);

    if (!saved) return;

    const savedHistory = JSON.parse(saved);

    if (!Array.isArray(savedHistory)) return;

    history.push(
      ...savedHistory.filter(
        item =>
          item &&
          typeof item.role === "string" &&
          typeof item.content === "string"
      )
    );
  } catch (error) {
    console.error("Erro ao carregar memória:", error);
  }
}

/* =========================
   MENSAGENS
========================= */

function addMessage(text, type) {
  const message = document.createElement("div");
  message.className = "message " + type;

  const label = document.createElement("span");
  label.className = "label";
  label.textContent = type === "user" ? "VOCÊ" : "NEXA";

  const paragraph = document.createElement("p");
  paragraph.textContent = text;

  message.appendChild(label);
  message.appendChild(paragraph);
  chat.appendChild(message);

  message.scrollIntoView({
    behavior: "smooth",
    block: "end"
  });
}

function showTyping() {
  if (document.getElementById("nexaTyping")) return;

  const message = document.createElement("div");
  message.className = "message nexa typing-message";
  message.id = "nexaTyping";

  const label = document.createElement("span");
  label.className = "label";
  label.textContent = "NEXA";

  const typing = document.createElement("p");
  typing.className = "typing";

  typing.innerHTML = `
    <span></span>
    <span></span>
    <span></span>
  `;

  message.appendChild(label);
  message.appendChild(typing);
  chat.appendChild(message);

  message.scrollIntoView({
    behavior: "smooth",
    block: "end"
  });
}

function hideTyping() {
  const typing = document.getElementById("nexaTyping");

  if (typing) typing.remove();
}

function createStreamingMessage() {
  const message = document.createElement("div");
  message.className = "message nexa";

  const label = document.createElement("span");
  label.className = "label";
  label.textContent = "NEXA";

  const paragraph = document.createElement("p");
  paragraph.textContent = "";

  message.appendChild(label);
  message.appendChild(paragraph);
  chat.appendChild(message);

  message.scrollIntoView({
    behavior: "smooth",
    block: "end"
  });

  return { message, paragraph };
}

function updateStreamingMessage(paragraph, text) {
  paragraph.textContent = text;
  chat.scrollTop = chat.scrollHeight;
}

/* =========================
   STREAMING DA NEXA
========================= */

async function askNexa(text) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: text,
      history: history.slice(-12),
      userId,
      mode: responseMode
    })
  });

  if (!response.ok) {
    let data = null;

    try {
      data = await response.json();
    } catch {}

    throw new Error(
      data?.error ||
      `Erro na API (HTTP ${response.status}).`
    );
  }

  if (!response.body) {
    throw new Error(
      "O navegador não conseguiu iniciar o streaming."
    );
  }

  hideTyping();

  const { paragraph } = createStreamingMessage();

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let fullReply = "";
  let finished = false;

  function processEvent(event) {
    const lines = event.split(/\r?\n/);

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;

      const dataText = line.slice(5).trim();

      if (!dataText) continue;

      let data;

      try {
        data = JSON.parse(dataText);
      } catch {
        continue;
      }

      if (
        data.type === "text" &&
        typeof data.text === "string"
      ) {
        fullReply += data.text;

        updateStreamingMessage(
          paragraph,
          fullReply
        );
      }

      if (data.type === "done") {
        finished = true;
      }

      if (data.type === "error") {
        throw new Error(
          data.error ||
          "Erro durante a resposta da NEXA."
        );
      }
    }
  }

  while (true) {
    const { value, done } = await reader.read();

    if (done) break;

    buffer += decoder.decode(
      value,
      { stream: true }
    );

    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || "";

    for (const event of events) {
      processEvent(event);
    }
  }

  if (buffer.trim()) {
    processEvent(buffer);
  }

  if (!fullReply.trim()) {
    throw new Error(
      "A NEXA não retornou nenhum texto."
    );
  }

  history.push({
    role: "user",
    content: text
  });

  history.push({
    role: "model",
    content: fullReply
  });

  saveMemory();
  speakNexa(fullReply);

  return {
    reply: fullReply,
    finished
  };
}

/* =========================
   NOVA CONVERSA
========================= */

function clearConversation() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }

  history.length = 0;
  localStorage.removeItem(MEMORY_KEY);

  hideTyping();

  chat.innerHTML = `
    <div class="message nexa">
      <span class="label">NEXA</span>
      <p>Conversa limpa. Minha memória dessa conversa foi apagada. O que eu já aprendi sobre você continua guardado.</p>
    </div>
  `;

  input.value = "";
  input.focus();
}

newChatButton.addEventListener(
  "click",
  clearConversation
);

/* =========================
   ENVIO
========================= */

composer.addEventListener(
  "submit",
  async function(event) {
    event.preventDefault();

    const text = input.value.trim();

    if (!text || sendButton.disabled) return;

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    addMessage(text, "user");
    input.value = "";

    sendButton.disabled = true;
    micButton.disabled = true;
    newChatButton.disabled = true;
    modeSelector.querySelectorAll("button").forEach(
      button => button.disabled = true
    );

    showTyping();

    try {
      await askNexa(text);
    } catch (error) {
      console.error("NEXA error:", error);

      hideTyping();

      addMessage(
        "Erro ao conectar com a NEXA: " +
        (error?.message || "erro desconhecido"),
        "nexa"
      );
    } finally {
      sendButton.disabled = false;
      micButton.disabled = false;
      newChatButton.disabled = false;

      modeSelector.querySelectorAll("button").forEach(
        button => button.disabled = false
      );

      input.focus();
    }
  }
);

/* =========================
   MICROFONE
========================= */

micButton.addEventListener(
  "click",
  function() {
    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      addMessage(
        "Seu navegador não disponibilizou reconhecimento de voz nesta versão.",
        "nexa"
      );

      return;
    }

    const recognition = new SpeechRecognition();

    recognition.lang = "pt-BR";
    recognition.interimResults = false;

    recognition.onstart = function() {
      micButton.textContent = "●";
      micButton.disabled = true;
    };

    recognition.onresult = function(event) {
      input.value =
        event.results[0][0].transcript;

      input.focus();
    };

    recognition.onerror = function() {
      addMessage(
        "Não consegui entender o áudio. Tente falar novamente.",
        "nexa"
      );
    };

    recognition.onend = function() {
      micButton.textContent = "◉";
      micButton.disabled = false;
    };

    recognition.start();
  }
);

/* =========================
   RESTAURAÇÃO
========================= */

function restoreConversation() {
  if (history.length === 0) return;

  chat.innerHTML = "";

  history.forEach(item => {
    addMessage(
      item.content,
      item.role === "user" ? "user" : "nexa"
    );
  });
}

loadMemory();
restoreConversation();
