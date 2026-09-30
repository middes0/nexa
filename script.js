const composer = document.getElementById("composer");
const input = document.getElementById("messageInput");
const chat = document.getElementById("chat");
const micButton = document.getElementById("micButton");
const sendButton = composer.querySelector('button[type="submit"]');
const newChatButton = document.getElementById("newChatButton");
const historyButton = document.getElementById("historyButton");
const historyPanel = document.getElementById("historyPanel");
const historyList = document.getElementById("historyList");
const closeHistoryButton = document.getElementById("closeHistoryButton");
const historyOverlay = document.getElementById("historyOverlay");
const memoryButton = document.getElementById("memoryButton");
const memoryPanel = document.getElementById("memoryPanel");
const memoryList = document.getElementById("memoryList");
const closeMemoryButton = document.getElementById("closeMemoryButton");
const clearMemoriesButton = document.getElementById("clearMemoriesButton");
const memoryOverlay = document.getElementById("memoryOverlay");
const modeButton = document.getElementById("modeButton");
const modeMenu = document.getElementById("modeMenu");

const MEMORY_KEY = "nexa_conversation";
const CONVERSATIONS_KEY = "nexa_conversations";
const ACTIVE_CONVERSATION_KEY = "nexa_active_conversation";
const USER_ID_KEY = "nexa_user_id";
const MODE_KEY = "nexa_response_mode";
const API_URL = "https://nexa-2.pages.dev/api/chat";

const MODE_INFO = {
  none: {
    label: "Nenhum",
    icon: "⌕",
    description: "Resposta direta, com o mínimo de raciocínio."
  },
  low: {
    label: "Baixo",
    icon: "◔",
    description: "Rápido, mas com uma análise curta antes de responder."
  },
  medium: {
    label: "Médio",
    icon: "◑",
    description: "Equilíbrio entre velocidade e profundidade."
  },
  high: {
    label: "Alto",
    icon: "◉",
    description: "Mais análise para perguntas complexas."
  },
  maximum: {
    label: "Máximo",
    icon: "◉",
    description: "Maior profundidade, podendo demorar mais."
  }
};

const history = [];
let conversations = [];
let activeConversationId = null;

let responseMode =
  localStorage.getItem(MODE_KEY) || "medium";

if (!MODE_INFO[responseMode]) {
  responseMode = "medium";
}

function updateModeUI() {
  const info = MODE_INFO[responseMode];

  modeButton.textContent = info.icon;

  modeButton.title = "Modo: " + info.label;

  modeMenu.querySelectorAll("button[data-mode]").forEach(function(button) {
    button.classList.toggle(
      "active",
      button.dataset.mode === responseMode
    );
  });
}

modeButton.addEventListener("click", function(event) {
  event.stopPropagation();
  modeMenu.classList.toggle("open");
});

modeMenu.addEventListener("click", function(event) {
  const button = event.target.closest("button[data-mode]");

  if (!button) return;

  responseMode = button.dataset.mode;
  localStorage.setItem(MODE_KEY, responseMode);
  updateModeUI();
  modeMenu.classList.remove("open");
});

document.addEventListener("click", function(event) {
  if (!event.target.closest(".composer-mode")) {
    modeMenu.classList.remove("open");
  }
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

  utterance.onend = function() {
    scheduleWakeRestart();
  };

  window.speechSynthesis.speak(utterance);
}

if ("speechSynthesis" in window) {
  loadNexaVoice();
  window.speechSynthesis.onvoiceschanged = loadNexaVoice;
}

/* =========================
   PALAVRA DE ATIVAÇÃO — "NEXA"
========================= */

let wakeRecognition = null;
let wakeListening = false;
let wakeRestartTimer = null;
let wakeCommandMode = false;

function startWakeWord() {
  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!SpeechRecognition || wakeListening) return;

  if (wakeRecognition) {
    try {
      wakeRecognition.stop();
    } catch (error) {}
  }

  wakeRecognition = new SpeechRecognition();
  wakeRecognition.lang = "pt-BR";
  wakeRecognition.continuous = true;
  wakeRecognition.interimResults = false;
  wakeRecognition.maxAlternatives = 3;

  wakeRecognition.onstart = function() {
    wakeListening = true;
  };

  wakeRecognition.onresult = async function(event) {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (!event.results[i].isFinal) continue;

      const heard = event.results[i][0].transcript
        .trim()
        .replace(/^[,.:;!?\s]+|[,.:;!?\s]+$/g, "");

      if (!heard) continue;

      const normalized = heard
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

      const wakeMatch = normalized.match(
        /^(?:oi\s+)?nexa\b(?:[,.:;!?\s]+(.*))?$/i
      );

      if (!wakeMatch) continue;

      const command = (wakeMatch[1] || "").trim();

      if (!command) {
        speakNexa("Tô ouvindo.");
        continue;
      }

      if (sendButton.disabled) continue;

      input.value = command;
      composer.requestSubmit();
    }
  };

  wakeRecognition.onerror = function(event) {
    wakeListening = false;

    if (
      event.error === "not-allowed" ||
      event.error === "service-not-allowed"
    ) {
      return;
    }

    scheduleWakeRestart();
  };

  wakeRecognition.onend = function() {
    wakeListening = false;
    scheduleWakeRestart();
  };

  try {
    wakeRecognition.start();
  } catch (error) {
    scheduleWakeRestart();
  }
}

function scheduleWakeRestart() {
  if (wakeRestartTimer) return;

  wakeRestartTimer = setTimeout(function() {
    wakeRestartTimer = null;

    if (!wakeListening && !wakeCommandMode) {
      startWakeWord();
    }
  }, 700);
}

if (
  "SpeechRecognition" in window ||
  "webkitSpeechRecognition" in window
) {
  window.addEventListener("load", function() {
    setTimeout(startWakeWord, 1200);
  });
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

  saveActiveConversation();
}

function makeConversationTitle(messages) {
  const firstUserMessage = messages.find(function(item) {
    return item && item.role === "user" && item.content;
  });

  if (!firstUserMessage) return "Nova conversa";

  const title = String(firstUserMessage.content)
    .replace(/\s+/g, " ")
    .trim();

  return title.length > 42
    ? title.slice(0, 42).trimEnd() + "..."
    : title;
}

function saveConversations() {
  localStorage.setItem(
    CONVERSATIONS_KEY,
    JSON.stringify(conversations)
  );
}

function saveActiveConversation() {
  if (!activeConversationId) return;

  const conversation = conversations.find(function(item) {
    return item.id === activeConversationId;
  });

  if (!conversation) return;

  conversation.messages = history.slice();
  conversation.title = makeConversationTitle(history);
  conversation.updatedAt = Date.now();

  saveConversations();
  renderHistory();
}

function createConversation() {
  const conversation = {
    id: "conversation_" + crypto.randomUUID(),
    title: "Nova conversa",
    messages: [],
    updatedAt: Date.now()
  };

  conversations.unshift(conversation);
  activeConversationId = conversation.id;

  saveConversations();
  localStorage.setItem(
    ACTIVE_CONVERSATION_KEY,
    activeConversationId
  );

  return conversation;
}

function loadConversations() {
  try {
    const saved = localStorage.getItem(CONVERSATIONS_KEY);

    if (saved) {
      const parsed = JSON.parse(saved);

      if (Array.isArray(parsed)) {
        conversations = parsed.filter(function(item) {
          return (
            item &&
            typeof item.id === "string" &&
            Array.isArray(item.messages)
          );
        });
      }
    }
  } catch (error) {
    conversations = [];
  }

  activeConversationId =
    localStorage.getItem(ACTIVE_CONVERSATION_KEY);

  if (
    !activeConversationId ||
    !conversations.some(function(item) {
      return item.id === activeConversationId;
    })
  ) {
    const existingMessages = history.slice();

    const current = createConversation();

    if (existingMessages.length) {
      current.messages = existingMessages;
      current.title = makeConversationTitle(existingMessages);
      saveConversations();
    }
  }

  renderHistory();
}

function renderHistory() {
  if (!historyList) return;

  historyList.innerHTML = "";

  const ordered = conversations
    .slice()
    .sort(function(a, b) {
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });

  if (!ordered.length) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = "Nenhuma conversa salva.";
    historyList.appendChild(empty);
    return;
  }

  ordered.forEach(function(conversation) {
    const item = document.createElement("div");
    item.className =
      "history-item" +
      (conversation.id === activeConversationId ? " active" : "");

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "history-open";
    openButton.textContent = conversation.title || "Nova conversa";
    openButton.addEventListener("click", function() {
      openConversation(conversation.id);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "history-delete";
    deleteButton.textContent = "×";
    deleteButton.title = "Excluir conversa";
    deleteButton.addEventListener("click", function(event) {
      event.stopPropagation();
      deleteConversation(conversation.id);
    });

    item.appendChild(openButton);
    item.appendChild(deleteButton);
    historyList.appendChild(item);
  });
}

function openHistoryPanel() {
  renderHistory();
  historyPanel.classList.add("open");
  historyOverlay.classList.add("open");
  document.body.classList.add("history-open");
}

function closeHistoryPanel() {
  historyPanel.classList.remove("open");
  historyOverlay.classList.remove("open");
  document.body.classList.remove("history-open");
}

function openConversation(conversationId) {
  const conversation = conversations.find(function(item) {
    return item.id === conversationId;
  });

  if (!conversation) return;

  history.length = 0;
  history.push(
    ...conversation.messages.filter(function(item) {
      return (
        item &&
        typeof item.role === "string" &&
        typeof item.content === "string"
      );
    })
  );

  activeConversationId = conversation.id;

  localStorage.setItem(
    ACTIVE_CONVERSATION_KEY,
    activeConversationId
  );

  localStorage.setItem(
    MEMORY_KEY,
    JSON.stringify(history)
  );

  restoreConversation();
  closeHistoryPanel();
}

function deleteConversation(conversationId) {
  const conversation = conversations.find(function(item) {
    return item.id === conversationId;
  });

  if (!conversation) return;

  conversations = conversations.filter(function(item) {
    return item.id !== conversationId;
  });

  if (activeConversationId === conversationId) {
    const replacement = conversations
      .slice()
      .sort(function(a, b) {
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      })[0];

    if (replacement) {
      openConversation(replacement.id);
    } else {
      const fresh = createConversation();

      history.length = 0;
      localStorage.removeItem(MEMORY_KEY);
      restoreConversation();

      activeConversationId = fresh.id;
      localStorage.setItem(
        ACTIVE_CONVERSATION_KEY,
        activeConversationId
      );
    }
  }

  saveConversations();
  renderHistory();
}

function startNewConversation() {
  if (history.length) {
    saveActiveConversation();
  }

  history.length = 0;

  const fresh = createConversation();

  activeConversationId = fresh.id;

  localStorage.setItem(
    ACTIVE_CONVERSATION_KEY,
    activeConversationId
  );

  localStorage.removeItem(MEMORY_KEY);

  hideTyping();

  chat.innerHTML = `
    <div class="message nexa">
      <span class="label">NEXA</span>
      <p>E aí. Nova conversa. Manda a boa.</p>
    </div>
  `;

  renderHistory();
  closeHistoryPanel();

  input.value = "";
  input.focus();
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
   MEMÓRIAS DE VERDADE
========================= */

async function requestMemories(action, memoryId) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      action,
      memoryId,
      userId
    })
  });

  if (!response.ok) {
    let data = null;

    try {
      data = await response.json();
    } catch {}

    throw new Error(
      data?.error || `Erro ao acessar memórias (HTTP ${response.status}).`
    );
  }

  return response.json();
}

function renderMemories(memories) {
  if (!memoryList) return;

  memoryList.innerHTML = "";

  if (!Array.isArray(memories) || !memories.length) {
    const empty = document.createElement("div");
    empty.className = "memory-empty";

    const icon = document.createElement("span");
    icon.className = "memory-empty-icon";
    icon.textContent = "◈";

    const title = document.createElement("strong");
    title.textContent = "Ainda não há memórias";

    const text = document.createElement("p");
    text.textContent = "Conforme você conversa comigo, informações úteis sobre você podem ser lembradas automaticamente.";

    empty.appendChild(icon);
    empty.appendChild(title);
    empty.appendChild(text);
    memoryList.appendChild(empty);
    return;
  }

  memories.forEach(function(memory) {
    const item = document.createElement("div");
    item.className = "memory-item";

    const body = document.createElement("div");
    body.className = "memory-item-body";

    const icon = document.createElement("span");
    icon.className = "memory-item-icon";
    icon.textContent = "◈";

    const text = document.createElement("p");
    text.textContent = memory.memory;

    body.appendChild(icon);
    body.appendChild(text);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "memory-delete";
    deleteButton.textContent = "×";
    deleteButton.title = "Esquecer esta memória";
    deleteButton.setAttribute("aria-label", "Esquecer esta memória");

    deleteButton.addEventListener("click", async function() {
      deleteButton.disabled = true;

      try {
        const data = await requestMemories("delete_memory", Number(memory.id));
        renderMemories(data.memories);
      } catch (error) {
        deleteButton.disabled = false;
        console.error("Erro ao apagar memória:", error);
      }
    });

    item.appendChild(body);
    item.appendChild(deleteButton);
    memoryList.appendChild(item);
  });
}

async function loadMemories() {
  if (!memoryList) return;

  memoryList.innerHTML = `<div class="memory-loading">Carregando memórias...</div>`;

  try {
    const data = await requestMemories("get_memories");
    renderMemories(data.memories);
  } catch (error) {
    memoryList.innerHTML = `<div class="memory-error">Não consegui carregar as memórias.</div>`;
    console.error("Erro ao carregar memórias:", error);
  }
}

async function openMemoryPanel() {
  if (!memoryPanel) return;

  loadMemories();
  memoryPanel.classList.add("open");
  memoryOverlay.classList.add("open");
  document.body.classList.add("memory-open");
}

function closeMemoryPanel() {
  if (!memoryPanel) return;

  memoryPanel.classList.remove("open");
  memoryOverlay.classList.remove("open");
  document.body.classList.remove("memory-open");
}

async function clearAllMemories() {
  if (!clearMemoriesButton) return;

  const confirmed = window.confirm(
    "Apagar todas as memórias da NEXA?"
  );

  if (!confirmed) return;

  clearMemoriesButton.disabled = true;

  try {
    const data = await requestMemories("clear_memories");
    renderMemories(data.memories);
  } catch (error) {
    console.error("Erro ao apagar memórias:", error);
  } finally {
    clearMemoriesButton.disabled = false;
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

function renderWebSources(sources, message) {
  if (!Array.isArray(sources) || !sources.length || !message) return;

  const validSources = sources
    .filter(function(source) {
      return (
        source &&
        typeof source.url === "string" &&
        (source.url.startsWith("https://") || source.url.startsWith("http://")) &&
        typeof source.title === "string" &&
        source.title.trim()
      );
    })
    .filter(function(source, index, array) {
      return array.findIndex(function(item) {
        return item.url === source.url;
      }) === index;
    })
    .slice(0, 8);

  if (!validSources.length) return;

  const oldBox = message.querySelector(".web-sources");
  if (oldBox) oldBox.remove();

  const box = document.createElement("div");
  box.className = "web-sources";

  const title = document.createElement("div");
  title.className = "web-sources-title";
  title.textContent = "Fontes da pesquisa";

  const list = document.createElement("div");
  list.className = "web-sources-list";

  validSources.forEach(function(source) {
    const link = document.createElement("a");
    link.className = "web-source";
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = source.title.trim();
    list.appendChild(link);
  });

  box.appendChild(title);
  box.appendChild(list);
  message.appendChild(box);
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

  const streamingMessage = createStreamingMessage();
  const paragraph = streamingMessage.paragraph;

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
        renderWebSources(data.sources, streamingMessage.message);
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
  startNewConversation
);

if (historyButton) {
  historyButton.addEventListener("click", openHistoryPanel);
}

if (closeHistoryButton) {
  closeHistoryButton.addEventListener("click", closeHistoryPanel);
}

if (historyOverlay) {
  historyOverlay.addEventListener("click", closeHistoryPanel);
}

if (memoryButton) {
  memoryButton.addEventListener("click", openMemoryPanel);
}

if (closeMemoryButton) {
  closeMemoryButton.addEventListener("click", closeMemoryPanel);
}

if (memoryOverlay) {
  memoryOverlay.addEventListener("click", closeMemoryPanel);
}

if (clearMemoriesButton) {
  clearMemoriesButton.addEventListener("click", clearAllMemories);
}

document.addEventListener("keydown", function(event) {
  if (event.key === "Escape" && historyPanel.classList.contains("open")) {
    closeHistoryPanel();
  }

  if (event.key === "Escape" && memoryPanel.classList.contains("open")) {
    closeMemoryPanel();
  }
});

/* =========================
   ENVIO
========================= */

function handleNaturalLocalCommand(text) {
  const normalized = String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  if (/^(nexa[,:]?\s*)?(abre|abrir|mostra|mostrar|veja|ver)\s+(meu\s+)?historico$/.test(normalized) ||
      /^(nexa[,:]?\s*)?(historico|conversas)$/.test(normalized)) {
    openHistoryPanel();
    return "done";
  }

  if (/^(nexa[,:]?\s*)?(abre|abrir|mostra|mostrar|veja|ver)\s+(minhas\s+)?memorias$/.test(normalized) ||
      /^(nexa[,:]?\s*)?(memorias)$/.test(normalized)) {
    openMemoryPanel();
    return "done";
  }

  if (/^(nexa[,:]?\s*)?(nova\s+conversa|nova\s+conversa\s+agora|comecar\s+de\s+novo)$/.test(normalized)) {
    startNewConversation();
    return "done";
  }

  if (/^(nexa[,:]?\s*)?(fecha|feche|fechar)\s+(o\s+)?(historico|painel)$/.test(normalized)) {
    closeHistoryPanel();
    return "done";
  }

  if (/^(nexa[,:]?\s*)?(fecha|feche|fechar)\s+(o\s+)?(memorias|painel)$/.test(normalized)) {
    closeMemoryPanel();
    return "done";
  }

  return null;
}

composer.addEventListener(
  "submit",
  async function(event) {
    wakeCommandMode = true;
    event.preventDefault();

    const text = input.value.trim();

    if (!text || sendButton.disabled) return;

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    const localCommand = handleNaturalLocalCommand(text);

    addMessage(text, "user");
    input.value = "";

    if (localCommand === "done") {
      sendButton.disabled = false;
      micButton.disabled = false;
      newChatButton.disabled = false;
      modeButton.disabled = false;
      input.focus();
      return;
    }

    sendButton.disabled = true;
    micButton.disabled = true;
    newChatButton.disabled = true;
    modeButton.disabled = true;

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

      modeButton.disabled = false;
      wakeCommandMode = false;
      scheduleWakeRestart();

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
loadConversations();

if (activeConversationId) {
  const active = conversations.find(function(item) {
    return item.id === activeConversationId;
  });

  if (active && Array.isArray(active.messages) && active.messages.length) {
    history.length = 0;
    history.push(...active.messages);
  }
}

restoreConversation();
renderHistory();
