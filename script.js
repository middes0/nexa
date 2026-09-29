const composer = document.getElementById("composer");
const input = document.getElementById("messageInput");
const chat = document.getElementById("chat");
const micButton = document.getElementById("micButton");
const sendButton = composer.querySelector('button[type="submit"]');
const newChatButton = document.getElementById("newChatButton");

const MEMORY_KEY = "nexa_conversation";
const USER_ID_KEY = "nexa_user_id";

const history = [];

/*
  ================================
  VOZ DA NEXA
  ================================
*/

let speechEnabled = true;
let selectedVoice = null;

function loadNexaVoice() {
  if (!("speechSynthesis" in window)) {
    return;
  }

  const voices =
    window.speechSynthesis.getVoices();

  if (!voices.length) {
    return;
  }

  /*
    Primeiro tenta encontrar uma voz
    brasileira em português.
  */
  selectedVoice =
    voices.find(voice =>
      voice.lang.toLowerCase() === "pt-br"
    ) ||
    voices.find(voice =>
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

  /*
    Cancela uma fala anterior para
    evitar duas falas ao mesmo tempo.
  */
  window.speechSynthesis.cancel();

  const cleanText =
    text
      .replace(/[*_`#]/g, "")
      .replace(/\n+/g, " ")
      .trim();

  if (!cleanText) {
    return;
  }

  const utterance =
    new SpeechSynthesisUtterance(
      cleanText
    );

  utterance.lang = "pt-BR";

  if (selectedVoice) {
    utterance.voice =
      selectedVoice;
  }

  /*
    Ajustes iniciais da voz.
  */
  utterance.rate = 1.02;
  utterance.pitch = 1;
  utterance.volume = 1;

  window.speechSynthesis.speak(
    utterance
  );
}

/*
  Alguns navegadores carregam as vozes
  de forma assíncrona.
*/
if ("speechSynthesis" in window) {
  loadNexaVoice();

  window.speechSynthesis.onvoiceschanged =
    loadNexaVoice;
}

/*
  ================================
  ID PERMANENTE DO NAVEGADOR
  ================================
*/

function getUserId() {
  let userId =
    localStorage.getItem(
      USER_ID_KEY
    );

  if (!userId) {
    userId =
      "user_" +
      crypto.randomUUID();

    localStorage.setItem(
      USER_ID_KEY,
      userId
    );
  }

  return userId;
}

const userId = getUserId();

function saveMemory() {
  localStorage.setItem(
    MEMORY_KEY,
    JSON.stringify(history)
  );
}

function loadMemory() {
  try {
    const saved =
      localStorage.getItem(
        MEMORY_KEY
      );

    if (!saved) {
      return;
    }

    const savedHistory =
      JSON.parse(saved);

    if (!Array.isArray(savedHistory)) {
      return;
    }

    history.push(
      ...savedHistory.filter(item =>
        item &&
        typeof item.role === "string" &&
        typeof item.content === "string"
      )
    );

  } catch (error) {
    console.error(
      "Erro ao carregar memória:",
      error
    );
  }
}

function addMessage(text, type) {
  const message =
    document.createElement("div");

  message.className =
    "message " + type;

  const label =
    document.createElement("span");

  label.className = "label";

  label.textContent =
    type === "user"
      ? "VOCÊ"
      : "NEXA";

  const paragraph =
    document.createElement("p");

  paragraph.textContent =
    text;

  message.appendChild(label);
  message.appendChild(paragraph);

  chat.appendChild(message);

  message.scrollIntoView({
    behavior: "smooth",
    block: "end"
  });
}

function showTyping() {
  if (
    document.getElementById(
      "nexaTyping"
    )
  ) {
    return;
  }

  const message =
    document.createElement("div");

  message.className =
    "message nexa typing-message";

  message.id =
    "nexaTyping";

  const label =
    document.createElement("span");

  label.className = "label";
  label.textContent = "NEXA";

  const typing =
    document.createElement("p");

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
  const typing =
    document.getElementById(
      "nexaTyping"
    );

  if (typing) {
    typing.remove();
  }
}

function addAnimatedMessage(text) {
  const message =
    document.createElement("div");

  message.className =
    "message nexa";

  const label =
    document.createElement("span");

  label.className = "label";
  label.textContent = "NEXA";

  const paragraph =
    document.createElement("p");

  paragraph.textContent = "";

  message.appendChild(label);
  message.appendChild(paragraph);

  chat.appendChild(message);

  let index = 0;

  const speed = 18;

  function typeNextCharacter() {
    if (index >= text.length) {
      /*
        Só começa a falar depois que
        a resposta terminou de aparecer.
      */
      speakNexa(text);

      return;
    }

    paragraph.textContent +=
      text[index];

    index++;

    message.scrollIntoView({
      behavior: "smooth",
      block: "end"
    });

    setTimeout(
      typeNextCharacter,
      speed
    );
  }

  typeNextCharacter();
}

function restoreConversation() {
  if (history.length === 0) {
    return;
  }

  chat.innerHTML = "";

  history.forEach(item => {
    addMessage(
      item.content,
      item.role === "user"
        ? "user"
        : "nexa"
    );
  });
}

function clearConversation() {
  /*
    Apaga somente a conversa local.

    O USER_ID continua salvo.
    As memórias reais do D1 continuam intactas.
  */

  /*
    Também interrompe uma fala em andamento.
  */
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }

  history.length = 0;

  localStorage.removeItem(
    MEMORY_KEY
  );

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

async function askNexa(text) {
  const response =
    await fetch("/api/chat", {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json"
      },

      body: JSON.stringify({
        message: text,

        history:
          history.slice(-12),

        userId
      })
    });

  let data;

  try {
    data =
      await response.json();

  } catch {
    throw new Error(
      `O servidor retornou uma resposta inválida (HTTP ${response.status}).`
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
      `Erro na API (HTTP ${response.status}).`
    );
  }

  if (!data?.reply) {
    throw new Error(
      "O servidor não retornou uma resposta da NEXA."
    );
  }

  return data.reply;
}

composer.addEventListener(
  "submit",
  async function (event) {

    event.preventDefault();

    const text =
      input.value.trim();

    if (
      !text ||
      sendButton.disabled
    ) {
      return;
    }

    /*
      Garante que a fala anterior
      seja interrompida quando uma
      nova pergunta começar.
    */
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    addMessage(
      text,
      "user"
    );

    input.value = "";

    sendButton.disabled = true;
    micButton.disabled = true;
    newChatButton.disabled = true;

    showTyping();

    try {

      const reply =
        await askNexa(text);

      hideTyping();

      history.push({
        role: "user",
        content: text
      });

      history.push({
        role: "model",
        content: reply
      });

      saveMemory();

      addAnimatedMessage(
        reply
      );

    } catch (error) {

      console.error(
        "NEXA error:",
        error
      );

      hideTyping();

      addMessage(
        "Erro ao conectar com a NEXA: " +
        (
          error?.message ||
          "erro desconhecido"
        ),
        "nexa"
      );

    } finally {

      sendButton.disabled = false;
      micButton.disabled = false;
      newChatButton.disabled = false;

      input.focus();
    }
  }
);

newChatButton.addEventListener(
  "click",
  clearConversation
);

micButton.addEventListener(
  "click",
  function () {

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

    const recognition =
      new SpeechRecognition();

    recognition.lang =
      "pt-BR";

    recognition.interimResults =
      false;

    recognition.onstart =
      function () {

        micButton.textContent =
          "●";

        micButton.disabled =
          true;
      };

    recognition.onresult =
      function (event) {

        input.value =
          event.results[0][0]
            .transcript;

        input.focus();
      };

    recognition.onerror =
      function () {

        addMessage(
          "Não consegui entender o áudio. Tente falar novamente.",
          "nexa"
        );
      };

    recognition.onend =
      function () {

        micButton.textContent =
          "◉";

        micButton.disabled =
          false;
      };

    recognition.start();
  }
);

loadMemory();
restoreConversation();
