const composer = document.getElementById("composer");
const input = document.getElementById("messageInput");
const chat = document.getElementById("chat");
const micButton = document.getElementById("micButton");
const sendButton = composer.querySelector('button[type="submit"]');
const imageButton = document.getElementById("imageButton");
const imageInput = document.getElementById("imageInput");
const imagePreview = document.getElementById("imagePreview");
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
const voiceButton = document.getElementById("voiceButton");
const voicePanel = document.getElementById("voicePanel");
const voiceList = document.getElementById("voiceList");
const voiceTestButton = document.getElementById("voiceTestButton");
const voiceSaveButton = document.getElementById("voiceSaveButton");
const voiceCloseButton = document.getElementById("voiceCloseButton");
const voiceOverlay = document.getElementById("voiceOverlay");

const MEMORY_KEY = "nexa_conversation";
const CONVERSATIONS_KEY = "nexa_conversations";
const ACTIVE_CONVERSATION_KEY = "nexa_active_conversation";
const USER_ID_KEY = "nexa_user_id";
const MODE_KEY = "nexa_response_mode";
const VOICE_KEY = "nexa_voice_name";
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


let selectedImageData = "";
let selectedImageName = "";
let conversationImageData = "";

function clearSelectedImage() {
  selectedImageData = "";
  selectedImageName = "";

  if (imageInput) imageInput.value = "";

  if (imagePreview) {
    imagePreview.classList.remove("open");
    imagePreview.innerHTML = "";
  }
}

function prepareImage(file) {
  return new Promise(function(resolve, reject) {
    if (!file || !file.type.startsWith("image/")) {
      reject(new Error("Escolha uma imagem válida."));
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      reject(new Error("Essa imagem é grande demais. Escolha uma de até 15 MB."));
      return;
    }

    const reader = new FileReader();

    reader.onload = function() {
      const image = new Image();

      image.onload = function() {
        const maxSide = 1024;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, width, height);

        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);

        if (dataUrl.length > 16 * 1024 * 1024) {
          reject(new Error("Não consegui reduzir essa imagem o suficiente."));
          return;
        }

        resolve({
          dataUrl,
          name: file.name,
          width,
          height
        });
      };

      image.onerror = function() {
        reject(new Error("Não consegui ler essa imagem."));
      };

      image.src = reader.result;
    };

    reader.onerror = function() {
      reject(new Error("Não consegui carregar a imagem."));
    };

    reader.readAsDataURL(file);
  });
}

async function selectImage(file) {
  try {
    const result = await prepareImage(file);

    selectedImageData = result.dataUrl;
    selectedImageName = result.name;
    conversationImageData = result.dataUrl;
    saveActiveConversation();

    if (imagePreview) {
      imagePreview.classList.add("open");
      imagePreview.innerHTML = "";

      const thumb = document.createElement("img");
      thumb.src = result.dataUrl;
      thumb.alt = "Imagem selecionada";

      const info = document.createElement("span");
      info.textContent = result.name;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.title = "Remover imagem";
      remove.setAttribute("aria-label", "Remover imagem");
      remove.addEventListener("click", clearSelectedImage);

      imagePreview.appendChild(thumb);
      imagePreview.appendChild(info);
      imagePreview.appendChild(remove);
    }

    input.focus();
  } catch (error) {
    clearSelectedImage();
    addMessage(error?.message || "Não consegui carregar essa imagem.", "nexa");
  }
}

if (imageButton && imageInput) {
  imageButton.addEventListener("click", function() {
    imageInput.click();
  });

  imageInput.addEventListener("change", function() {
    const file = imageInput.files?.[0];
    if (file) selectImage(file);
  });
}

/* =========================
   VOZ DA NEXA
========================= */

const SPEECH_ENABLED_KEY = "nexa_speech_enabled";
let speechEnabled = localStorage.getItem(SPEECH_ENABLED_KEY) !== "false";
let selectedVoice = null;
let availableVoices = [];
let elevenLabsAudio = null;
let elevenLabsRequestId = 0;

async function loadNexaVoice() {
  if (!voiceList) return;

  const savedVoiceId = localStorage.getItem(VOICE_KEY);
  voiceList.innerHTML = '<div class="voice-empty">Carregando vozes da NEXA...</div>';

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "elevenlabs_voices",
        userId
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error || "Não consegui carregar as vozes.");
    }

    availableVoices = Array.isArray(data.voices)
      ? data.voices
      : [];

    const distinctVoices = getDistinctElevenVoices();

    selectedVoice =
      distinctVoices.find(function(voice) {
        return voice.id === savedVoiceId;
      }) ||
      distinctVoices[0] ||
      null;

    renderVoiceList();
  } catch (error) {
    availableVoices = [];
    selectedVoice = null;
    const detail = error?.message
      ? String(error.message).slice(0, 220)
      : "Erro desconhecido.";

    voiceList.innerHTML =
      '<div class="voice-empty">Não consegui carregar as vozes da ElevenLabs.<br><br><small>' +
      detail.replace(/[<>&"]/g, function(char) {
        return {
          "<": "&lt;",
          ">": "&gt;",
          "&": "&amp;",
          '"': "&quot;"
        }[char];
      }) +
      '</small></div>';

    console.error("Erro ao carregar vozes da ElevenLabs:", error);
  }
}

function getElevenVoiceFamilyKey(voice) {
  const labels = voice && voice.labels ? voice.labels : {};
  const baseName = String(voice?.name || "");

  return (
    baseName +
    "|" +
    String(labels.gender || "") +
    "|" +
    String(labels.age || "") +
    "|" +
    String(labels.accent || "")
  )
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isPortugueseElevenVoice(voice) {
  const labels = voice && voice.labels ? voice.labels : {};
  const labelLanguage = String(labels.language || "").toLowerCase();

  if (
    labelLanguage === "pt" ||
    labelLanguage === "pt-br" ||
    labelLanguage === "pt-pt" ||
    labelLanguage.includes("portugu")
  ) {
    return true;
  }

  return Array.isArray(voice?.verifiedLanguages) &&
    voice.verifiedLanguages.some(function(language) {
      const code = String(
        language?.language || language?.locale || ""
      ).toLowerCase();

      return (
        code === "pt" ||
        code.startsWith("pt-") ||
        code.includes("portugu")
      );
    });
}

function getDistinctElevenVoices() {
  const seen = new Set();
  const result = [];

  availableVoices
    .forEach(function(voice) {
      const key = getElevenVoiceFamilyKey(voice);

      if (!key || seen.has(key)) return;

      seen.add(key);
      result.push(voice);
    });

  return result;
}

function renderVoiceList() {
  if (!voiceList) return;

  voiceList.innerHTML = "";

  const voices = getDistinctElevenVoices();

  if (!voices.length) {
    voiceList.innerHTML =
      '<div class="voice-empty">Nenhuma voz da ElevenLabs disponível.</div>';
    return;
  }

  voices.forEach(function(voice) {
    const option = document.createElement("button");
    option.type = "button";
    option.className =
      "voice-option" +
      (selectedVoice && selectedVoice.id === voice.id ? " active" : "");

    const name = document.createElement("strong");
    name.textContent = voice.name;

    const meta = document.createElement("span");
    const gender = voice.labels?.gender || "";
    const accent = voice.labels?.accent || "";
    meta.textContent = [gender, accent]
      .filter(Boolean)
      .join(" · ") || "ElevenLabs";

    option.appendChild(name);
    option.appendChild(meta);

    option.addEventListener("click", function() {
      selectedVoice = voice;
      renderVoiceList();
    });

    voiceList.appendChild(option);
  });
}

async function speakWithElevenLabs(text) {
  if (!selectedVoice || !text) return false;

  const requestId = ++elevenLabsRequestId;

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "elevenlabs_tts",
        voiceId: selectedVoice.id,
        text: text.slice(0, 5000),
        userId
      })
    });

    if (!response.ok) {
      const data = await response.json().catch(function() {
        return null;
      });

      throw new Error(
        data?.error || "Erro ao gerar áudio da ElevenLabs."
      );
    }

    const blob = await response.blob();

    if (requestId !== elevenLabsRequestId) return false;

    if (elevenLabsAudio) {
      elevenLabsAudio.pause();
      URL.revokeObjectURL(elevenLabsAudio.src);
    }

    const url = URL.createObjectURL(blob);
    elevenLabsAudio = new Audio(url);
    elevenLabsAudio.volume = 1;

    elevenLabsAudio.onended = function() {
      URL.revokeObjectURL(url);
      scheduleWakeRestart();
    };

    elevenLabsAudio.onerror = function() {
      URL.revokeObjectURL(url);
      scheduleWakeRestart();
    };

    await elevenLabsAudio.play();
    return true;
  } catch (error) {
    console.error("Erro no TTS da ElevenLabs:", error);
    return false;
  }
}

async function testNexaVoice() {
  if (!selectedVoice) return;

  const text =
    "Oi. Essa é a minha voz. Agora a NEXA pode falar com uma voz de verdade.";

  const success = await speakWithElevenLabs(text);

  if (!success && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "pt-BR";
    window.speechSynthesis.speak(utterance);
  }
}

function saveNexaVoice() {
  if (!selectedVoice) return;

  localStorage.setItem(VOICE_KEY, selectedVoice.id);
  closeVoicePanel();
}

function openVoicePanel() {
  if (!voicePanel) return;

  voicePanel.classList.add("open");
  voiceOverlay.classList.add("open");

  loadNexaVoice();
}

function closeVoicePanel() {
  if (!voicePanel) return;

  voicePanel.classList.remove("open");
  voiceOverlay.classList.remove("open");
}

function stopNexaSpeech() {
  elevenLabsRequestId++;

  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }

  if (elevenLabsAudio) {
    elevenLabsAudio.pause();
    try {
      URL.revokeObjectURL(elevenLabsAudio.src);
    } catch (error) {}
    elevenLabsAudio = null;
  }

  if (wakeRestartTimer) {
    clearTimeout(wakeRestartTimer);
    wakeRestartTimer = null;
  }
}

function setNexaSpeechEnabled(enabled) {
  speechEnabled = Boolean(enabled);
  localStorage.setItem(SPEECH_ENABLED_KEY, speechEnabled ? "true" : "false");

  if (!speechEnabled) {
    stopNexaSpeech();
  }

  updateSpeechButton();
}

function updateSpeechButton() {
  const button = document.getElementById("speechToggleButton");
  if (!button) return;

  button.textContent = speechEnabled ? "◖" : "◌";
  button.title = speechEnabled ? "NEXA falando — toque para calar" : "NEXA muda — toque para ativar";
  button.setAttribute("aria-label", speechEnabled ? "Calar a NEXA" : "Ativar voz da NEXA");
  button.classList.toggle("muted", !speechEnabled);
}

function speakNexa(text) {
  if (!speechEnabled || !text) return;

  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }

  if (elevenLabsAudio) {
    elevenLabsAudio.pause();
  }

  const cleanText = text
    .replace(/[*_\`#]/g, "")
    .replace(/\n+/g, " ")
    .trim();

  if (!cleanText) return;

  if (selectedVoice) {
    speakWithElevenLabs(cleanText).then(function(success) {
      if (!success && "speechSynthesis" in window) {
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = "pt-BR";
        utterance.rate = 1.02;
        utterance.pitch = 1;
        utterance.volume = 1;
        window.speechSynthesis.speak(utterance);
      }
    });
    return;
  }

  if ("speechSynthesis" in window) {
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = "pt-BR";
    utterance.rate = 1.02;
    utterance.pitch = 1;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  }
}

const speechToggleButton = document.getElementById("speechToggleButton");

if (speechToggleButton) {
  speechToggleButton.addEventListener("click", function() {
    setNexaSpeechEnabled(!speechEnabled);
  });
}

document.addEventListener("visibilitychange", function() {
  if (document.hidden) {
    stopNexaSpeech();
  }
});

window.addEventListener("pagehide", stopNexaSpeech);
window.addEventListener("beforeunload", stopNexaSpeech);

updateSpeechButton();

if (voiceButton) voiceButton.addEventListener("click", openVoicePanel);
if (voiceCloseButton) voiceCloseButton.addEventListener("click", closeVoicePanel);
if (voiceOverlay) voiceOverlay.addEventListener("click", closeVoicePanel);
if (voiceTestButton) voiceTestButton.addEventListener("click", testNexaVoice);
if (voiceSaveButton) voiceSaveButton.addEventListener("click", saveNexaVoice);

/* =========================
   PALAVRA DE ATIVAÇÃO — "NEXA"
========================= */

let wakeRecognition = null;
let wakeListening = false;
let wakeRestartTimer = null;
let wakeCommandMode = false;
let wakePermissionGranted = false;

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
    wakeListening = false;
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

function enableWakeWord() {
  if (
    !("SpeechRecognition" in window) &&
    !("webkitSpeechRecognition" in window)
  ) {
    return false;
  }

  wakePermissionGranted = true;
  startWakeWord();
  return true;
}

if (
  "SpeechRecognition" in window ||
  "webkitSpeechRecognition" in window
) {
  // Browsers often block microphone recognition until the user
  // performs a gesture. The first microphone interaction unlocks it.
  micButton.title = "Ativar escuta da NEXA";
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

async function restoreSavedNexaVoice() {
  const savedVoiceId = localStorage.getItem(VOICE_KEY);
  if (!savedVoiceId) return;

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "elevenlabs_voices",
        userId
      })
    });

    if (!response.ok) return;

    const data = await response.json();
    availableVoices = Array.isArray(data.voices) ? data.voices : [];

    const voices = getDistinctElevenVoices();
    selectedVoice =
      voices.find(function(voice) {
        return voice.id === savedVoiceId;
      }) || null;
  } catch (error) {
    console.error("Erro ao restaurar voz da NEXA:", error);
  }
}

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
  conversation.imageData = conversationImageData || "";
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
    imageData: "",
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
  conversationImageData = "";
  clearSelectedImage();

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

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderMarkdown(text) {
  const parts = String(text || "").split("\x60\x60\x60");
  let html = "";

  parts.forEach(function(part, index) {
    if (index % 2 === 1) {
      const lines = part.split(/\r?\n/);
      let language = "";
      let code = part;

      if (/^[a-zA-Z0-9_+-]+\n/.test(part)) {
        language = lines.shift();
        code = lines.join("\n");
      }

      html +=
        '<div class="code-block">' +
          '<div class="code-header">' +
            (language ? '<span class="code-language">' + escapeHtml(language) + '</span>' : '') +
            '<button type="button" class="code-copy" aria-label="Copiar código">Copiar</button>' +
          '</div>' +
          '<pre><code>' + escapeHtml(code.trim()) + '</code></pre>' +
        '</div>';
      return;
    }

    let formatted = escapeHtml(part);

    formatted = formatted
      .replace(/^### (.+)$/gm, "<h4>$1</h4>")
      .replace(/^## (.+)$/gm, "<h3>$1</h3>")
      .replace(/^# (.+)$/gm, "<h3>$1</h3>")
      .replace(/^[-*] (.+)$/gm, "<li>$1</li>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
      .replace(/\x60([^\x60]+)\x60/g, '<code class="inline-code">$1</code>')
      .replace(/\n/g, "<br>");

    html += formatted;
  });

  return html;
}

function renderMessageContent(message, text) {
  if (!message) return null;

  const oldContent = message.querySelector(".message-content, p");
  if (oldContent) oldContent.remove();

  const content = document.createElement("div");
  content.className = "message-content";
  content.innerHTML = renderMarkdown(text);

  content.querySelectorAll(".code-copy").forEach(function(button) {
    button.addEventListener("click", async function() {
      const code = button.closest(".code-block")?.querySelector("code")?.textContent || "";
      try {
        await navigator.clipboard.writeText(code);
        button.textContent = "Copiado";
        setTimeout(function() {
          button.textContent = "Copiar";
        }, 1400);
      } catch (error) {
        button.textContent = "Falhou";
      }
    });
  });

  message.appendChild(content);
  return content;
}

function addMessage(text, type) {
  const message = document.createElement("div");
  message.className = "message " + type;

  const label = document.createElement("span");
  label.className = "label";
  label.textContent = type === "user" ? "VOCÊ" : "NEXA";

  message.appendChild(label);
  renderMessageContent(message, text);
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

function addResponseActions(message, text, userText) {
  if (!message || !text) return;

  const oldActions = message.querySelector(".message-actions");
  if (oldActions) oldActions.remove();

  const actions = document.createElement("div");
  actions.className = "message-actions";

  const createAction = function(icon, label, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "message-action";
    button.textContent = icon;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.addEventListener("click", handler);
    actions.appendChild(button);
  };

  createAction("↻", "Gerar novamente", function() {
    regenerateNexaResponse(message, userText);
  });

  createAction("🔊", "Ouvir novamente", function() {
    speakNexa(text);
  });

  createAction("⧉", "Copiar resposta", async function() {
    try {
      await navigator.clipboard.writeText(text);
      const button = actions.children[2];
      button.textContent = "✓";
      setTimeout(function() {
        button.textContent = "⧉";
      }, 1400);
    } catch (error) {}
  });

  message.appendChild(actions);
}

function addReplayButton(message, text, userText) {
  addResponseActions(message, text, userText);
}

async function regenerateNexaResponse(message, userText) {
  if (!message || !userText || sendButton.disabled) return;

  sendButton.disabled = true;
  micButton.disabled = true;
  newChatButton.disabled = true;
  modeButton.disabled = true;

  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  if (elevenLabsAudio) elevenLabsAudio.pause();

  const modelIndex = history.map(function(item) {
    return item.role;
  }).lastIndexOf("model");

  if (modelIndex >= 0) history.splice(modelIndex, 1);

  const oldContent = message.querySelector(".message-content, p");
  if (oldContent) oldContent.textContent = "";
  const oldActions = message.querySelector(".message-actions");
  if (oldActions) oldActions.remove();

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: userText,
        history: history.slice(-12),
        userId,
        mode: responseMode
      })
    });

    if (!response.ok || !response.body) {
      throw new Error("Não consegui gerar outra resposta.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullReply = "";
    let sources = [];

    function processEvent(event) {
      event.split(/\r?\n/).forEach(function(line) {
        if (!line.startsWith("data:")) return;
        const raw = line.slice(5).trim();
        if (!raw) return;

        let data;
        try { data = JSON.parse(raw); } catch { return; }

        if (data.type === "text" && typeof data.text === "string") {
          fullReply += data.text;
          const live = message.querySelector(".message-content, p");
          if (live) live.textContent = fullReply;
          chat.scrollTop = chat.scrollHeight;
        }

        if (data.type === "done") sources = data.sources || [];
        if (data.type === "error") throw new Error(data.error || "Erro ao regenerar.");
      });
    }

    while (true) {
      const result = await reader.read();
      if (result.done) break;

      buffer += decoder.decode(result.value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() || "";
      events.forEach(processEvent);
    }

    if (buffer.trim()) processEvent(buffer);

    if (!fullReply.trim()) throw new Error("A NEXA não retornou nenhuma resposta.");

    renderMessageContent(message, fullReply);
    renderWebSources(sources, message);
    history.push({ role: "model", content: fullReply });
    saveMemory();
    addResponseActions(message, fullReply, userText);
    speakNexa(fullReply);
  } catch (error) {
    addMessage("Erro ao regenerar: " + (error?.message || "erro desconhecido"), "nexa");
  } finally {
    sendButton.disabled = false;
    micButton.disabled = false;
    newChatButton.disabled = false;
    modeButton.disabled = false;
    input.focus();
  }
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


async function askNexaWithImage(text, imageData) {
  conversationImageData = imageData;
  saveActiveConversation();

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      action: "analyze_image",
      message: text || "Analise esta imagem.",
      image: imageData,
      userId
    })
  });

  if (!response.ok) {
    let data = null;

    try {
      data = await response.json();
    } catch {}

    throw new Error(
      data?.error || `Erro na análise da imagem (HTTP ${response.status}).`
    );
  }

  if (!response.body) {
    throw new Error("O navegador não conseguiu iniciar a análise da imagem.");
  }

  hideTyping();

  const streamingMessage = createStreamingMessage();
  const paragraph = streamingMessage.paragraph;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let fullReply = "";

  function processEvent(event) {
    event.split(/\r?\n/).forEach(function(line) {
      if (!line.startsWith("data:")) return;

      const raw = line.slice(5).trim();
      if (!raw) return;

      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        return;
      }

      if (data.type === "text" && typeof data.text === "string") {
        fullReply += data.text;
        updateStreamingMessage(paragraph, fullReply);
      }

      if (data.type === "error") {
        throw new Error(data.error || "Erro durante a análise da imagem.");
      }
    });
  }

  while (true) {
    const result = await reader.read();
    if (result.done) break;

    buffer += decoder.decode(result.value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || "";
    events.forEach(processEvent);
  }

  if (buffer.trim()) processEvent(buffer);

  if (!fullReply.trim()) {
    throw new Error("A NEXA não conseguiu analisar essa imagem.");
  }

  renderMessageContent(streamingMessage.message, fullReply);

  history.push({
    role: "user",
    content: text || "Analisei uma imagem."
  });

  history.push({
    role: "model",
    content: fullReply
  });

  saveMemory();
  addResponseActions(
    streamingMessage.message,
    fullReply,
    text || "Analisei uma imagem."
  );
  speakNexa(fullReply);

  return fullReply;
}

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
      mode: responseMode,
      imageContext: conversationImageData
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

  renderMessageContent(streamingMessage.message, fullReply);
  saveMemory();

  const previousUser = history
    .slice(0, -1)
    .reverse()
    .find(function(item) {
      return item.role === "user";
    });

  addResponseActions(
    streamingMessage.message,
    fullReply,
    previousUser?.content || text
  );

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

  const openMatch = normalized.match(
    /^(?:nexa[,:]?\s*)?(?:abre|abrir|volta|voltar|retoma|retomar)\s+(?:a\s+)?(?:conversa|chat)\s+(?:sobre|do|da|de)\s+(.+)$/
  );

  if (openMatch) {
    const query = openMatch[1].trim();
    const conversation = conversations.find(function(item) {
      const title = String(item.title || "").toLowerCase();
      const content = (item.messages || [])
        .map(function(message) {
          return message && message.content
            ? String(message.content).toLowerCase()
            : "";
        })
        .join(" ");

      return title.includes(query) || content.includes(query);
    });

    if (conversation) {
      openConversation(conversation.id);
      return "done";
    }

    addMessage("Não achei uma conversa sobre isso no histórico.", "nexa");
    return "done";
  }

  if (/^(?:nexa[,:]?\s*)?(?:volta|voltar|retoma|retomar)\s+(?:pra|para)\s+(?:aquela|essa)\s+conversa$/.test(normalized)) {
    if (conversations.length > 1) {
      const previous = conversations
        .filter(function(item) {
          return item.id !== activeConversationId;
        })
        .sort(function(a, b) {
          return (b.updatedAt || 0) - (a.updatedAt || 0);
        })[0];

      if (previous) {
        openConversation(previous.id);
        return "done";
      }
    }

    addMessage("Não encontrei outra conversa para voltar.", "nexa");
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

    if (!wakePermissionGranted) {
      enableWakeWord();
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

    if (window.NEXAAutomation?.handle) {
      try {
        const automation = await window.NEXAAutomation.handle(text);

        if (automation?.handled) {
          addMessage(automation.reply, "nexa");
          saveActiveConversation();

          sendButton.disabled = false;
          micButton.disabled = false;
          newChatButton.disabled = false;
          modeButton.disabled = false;
          wakeCommandMode = false;
          scheduleWakeRestart();
          input.focus();
          return;
        }
      } catch (automationError) {
        console.error("NEXA automation error:", automationError);
      }
    }

    sendButton.disabled = true;
    micButton.disabled = true;
    newChatButton.disabled = true;
    modeButton.disabled = true;

    showTyping();

    try {
      if (selectedImageData) {
        await askNexaWithImage(text, selectedImageData);
        clearSelectedImage();
      } else {
        await askNexa(text);
      }
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
    if (enableWakeWord()) {
      micButton.title = "Escuta da NEXA ativa";
    }
    return;

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

    if (item.role !== "user") {
      const message = chat.lastElementChild;
      const previousUser = history
        .slice(0, history.indexOf(item))
        .reverse()
        .find(function(previous) {
          return previous.role === "user";
        });

      addResponseActions(
        message,
        item.content,
        previousUser?.content || ""
      );
    }
  });
}

loadMemory();
loadConversations();

if (activeConversationId) {
  const active = conversations.find(function(item) {
    return item.id === activeConversationId;
  });

  if (active) {
    conversationImageData = typeof active.imageData === "string" ? active.imageData : "";

    if (active.messages && Array.isArray(active.messages) && active.messages.length) {
    history.length = 0;
      history.push(...active.messages);
    }
  }
}

restoreConversation();
renderHistory();
restoreSavedNexaVoice();


/* =========================
   CENTRAL DE AUTOMAÇÕES
========================= */

(function initNexaAutomationCenter() {
  const automationButton = document.getElementById("automationButton");
  const automationPanel = document.getElementById("automationPanel");
  const automationOverlay = document.getElementById("automationOverlay");
  const closeAutomationButton = document.getElementById("closeAutomationButton");
  const automationList = document.getElementById("automationList");
  const automationSummary = document.getElementById("automationSummary");

  if (!automationButton || !automationPanel || !automationList) return;

  let automationTab = "reminders";

  function openAutomationPanel() {
    automationPanel.classList.add("open");
    automationOverlay?.classList.add("open");
    renderAutomationCenter();
  }

  function closeAutomationPanel() {
    automationPanel.classList.remove("open");
    automationOverlay?.classList.remove("open");
  }

  function formatAutomationDate(timestamp) {
    const date = new Date(Number(timestamp));
    if (Number.isNaN(date.getTime())) return "data desconhecida";

    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function renderAutomationCenter() {
    const reminders = window.NEXAAutomation?.list?.() || [];
    const routines = window.NEXAAutomation?.routines?.() || [];

    automationSummary.textContent =
      reminders.length +
      (reminders.length === 1 ? " lembrete" : " lembretes") +
      " • " +
      routines.length +
      (routines.length === 1 ? " rotina salva" : " rotinas salvas");

    automationList.innerHTML = "";

    if (automationTab === "routines") {
      if (!routines.length) {
        automationList.innerHTML =
          '<div class="automation-empty">Nenhuma rotina salva ainda.<br>Ex.: “Cria uma rotina estudo: ...”</div>';
        return;
      }

      routines.forEach(function(routine) {
        const card = document.createElement("article");
        card.className = "automation-card";

        const title = document.createElement("div");
        title.className = "automation-card-title";
        title.textContent = routine.name;

        const meta = document.createElement("div");
        meta.className = "automation-card-meta";
        meta.textContent = routine.commands.join(" • ");

        const actions = document.createElement("div");
        actions.className = "automation-card-actions";

        const run = document.createElement("button");
        run.type = "button";
        run.textContent = "Executar";
        run.addEventListener("click", async function() {
          const result = await window.NEXAAutomation?.handle?.(
            "NEXA, executa a rotina " + routine.name
          );
          if (result?.reply) addMessage(result.reply, "nexa");
          renderAutomationCenter();
        });

        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "Excluir";
        remove.addEventListener("click", function() {
          if (!confirm("Excluir a rotina " + routine.name + "?")) return;

          const updated = (window.NEXAAutomation?.routines?.() || [])
            .filter(item => item.id !== routine.id);

          localStorage.setItem(
            "nexa_routines",
            JSON.stringify(updated)
          );

          renderAutomationCenter();
        });

        actions.append(run, remove);
        card.append(title, meta, actions);
        automationList.appendChild(card);
      });

      return;
    }

    if (!reminders.length) {
      automationList.innerHTML =
        '<div class="automation-empty">Nenhum lembrete agendado.</div>';
      return;
    }

    reminders.forEach(function(reminder) {
      const card = document.createElement("article");
      card.className = "automation-card" +
        (reminder.status === "paused" ? " paused" : "");

      const title = document.createElement("div");
      title.className = "automation-card-title";
      title.textContent = reminder.text;

      const remaining = Math.max(
        1,
        Math.round((Number(reminder.triggerAt) - Date.now()) / 1000)
      );

      const meta = document.createElement("div");
      meta.className = "automation-card-meta";
      meta.textContent =
        (reminder.status === "paused"
          ? "Pausado"
          : "Agendado para " + formatAutomationDate(reminder.triggerAt)) +
        (reminder.recurrence ? " • recorrente" : "");

      const actions = document.createElement("div");
      actions.className = "automation-card-actions";

      if (reminder.status !== "paused") {
        const pause = document.createElement("button");
        pause.type = "button";
        pause.textContent = "Pausar";
        pause.addEventListener("click", async function() {
          await window.NEXAAutomation?.pause?.(reminder.id);
          renderAutomationCenter();
        });
        actions.appendChild(pause);
      } else {
        const resume = document.createElement("button");
        resume.type = "button";
        resume.textContent = "Retomar";
        resume.addEventListener("click", async function() {
          await window.NEXAAutomation?.resume?.(reminder.id);
          renderAutomationCenter();
        });
        actions.appendChild(resume);
      }

      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "Excluir";
      cancel.addEventListener("click", async function() {
        await window.NEXAAutomation?.cancelById?.(reminder.id);
        renderAutomationCenter();
      });

      actions.appendChild(cancel);
      card.append(title, meta, actions);
      automationList.appendChild(card);
    });
  }

  automationButton.addEventListener("click", openAutomationPanel);
  closeAutomationButton?.addEventListener("click", closeAutomationPanel);
  automationOverlay?.addEventListener("click", closeAutomationPanel);

  document.addEventListener("keydown", function(event) {
    if (event.key === "Escape" && automationPanel.classList.contains("open")) {
      closeAutomationPanel();
    }
  });

  document.querySelectorAll("[data-automation-tab]").forEach(function(tab) {
    tab.addEventListener("click", function() {
      automationTab = tab.dataset.automationTab;
      document.querySelectorAll("[data-automation-tab]").forEach(function(item) {
        item.classList.toggle("active", item === tab);
      });
      renderAutomationCenter();
    });
  });

  window.addEventListener("nexa:automation-changed", renderAutomationCenter);
})();
