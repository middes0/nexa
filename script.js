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
  ==========================================
  VOZ DA NEXA
  ==========================================
*/

let speechEnabled = true;
let selectedVoice = null;

function loadNexaVoice() {
  if (!("speechSynthesis" in window)) {
    return;
  }

  const voices = window.speechSynthesis.getVoices();

  if (!voices.length) {
    return;
  }

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

  if (!cleanText) {
    return;
  }

  const utterance =
    new SpeechSynthesisUtterance(cleanText);

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

  window.speechSynthesis.onvoiceschanged =
    loadNexaVoice;
}

/*
  ==========================================
  ID PERMANENTE
  ==========================================
*/

function getUserId() {
  let userId =
    localStorage.getItem(USER_ID_KEY);

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

/*
  ==========================================
  MEMÓRIA LOCAL DA CONVERSA
  ==========================================
*/

function saveMemory() {
  localStorage.setItem(
    MEMORY_KEY,
    JSON.stringify(history)
  );
}

function loadMemory() {
  try {
    const saved =
      localStorage.getItem(MEMORY_KEY);

    if (!saved) {
      return;
    }

    const savedHistory =
      JSON.parse(saved);

    if (!Array.isArray(savedHistory)) {
      return;
    }

    history.push(
      ...savedHistory.filter(
        item =>
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

/*
  ==========================================
  MENSAGENS
  ==========================================
*/

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

  paragraph.textContent = text;

  message.appendChild(label);
  message.appendChild(paragraph);

  chat.appendChild(message);

  message.scrollIntoView({
    behavior: "smooth",
    block: "end"
  });
}

/*
  ==========================================
  INDICADOR DE DIGITAÇÃO
  ==========================================
*/

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

/*
  ==========================================
  MENSAGEM STREAMING
  ==========================================
*/

function createStreamingMessage() {
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

  message.scrollIntoView({
    behavior: "smooth",
    block: "end"
  });

  return {
    message,
    paragraph
  };
}

function updateStreamingMessage(
  paragraph,
  text
) {
  paragraph.textContent = text;

  /*
    Mantém a resposta visível
    enquanto ela é recebida.
  */

  chat.scrollTop =
    chat.scrollHeight;
}

/*
  ==========================================
  STREAMING DA NEXA
  ==========================================
*/

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

  /*
    Se o servidor responder com
    JSON de erro antes do streaming.
  */

  if (!response.ok) {
    let data = null;

    try {
      data =
        await response.json();
    } catch {
      // Resposta não era JSON.
    }

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

  /*
    Cria a mensagem vazia da NEXA.
  */

  hideTyping();

  const {
    paragraph
  } = createStreamingMessage();

  const reader =
    response.body.getReader();

  const decoder =
    new TextDecoder();

  let buffer = "";
  let fullReply = "";
  let finished = false;

  /*
    Processa um evento SSE.
  */

  function processEvent(event) {
    const lines =
      event.split(/\r?\n/);

    for (const line of lines) {
      if (!line.startsWith("data:")) {
        continue;
      }

      const dataText =
        line.slice(5).trim();

      if (!dataText) {
        continue;
      }

      let data;

      try {
        data =
          JSON.parse(dataText);
      } catch {
        continue;
      }

      /*
        Pedaço normal da resposta.
      */

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

      /*
        Streaming terminou.
      */

      if (
        data.type === "done"
      ) {
        finished = true;
      }

      /*
        O backend encontrou um erro
        durante o streaming.
      */

      if (
        data.type === "error"
      ) {
        throw new Error(
          data.error ||
          "Erro durante a resposta da NEXA."
        );
      }
    }
  }

  /*
    Lê o stream até terminar.
  */

  while (true) {
    const {
      value,
      done
    } = await reader.read();

    if (done) {
      break;
    }

    buffer +=
      decoder.decode(
        value,
        {
          stream: true
        }
      );

    /*
      Eventos SSE são separados
      por uma linha vazia.
    */

    const events =
      buffer.split(/\r?\n\r?\n/);

    buffer =
      events.pop() || "";

    for (const event of events) {
      processEvent(event);
    }
  }

  /*
    Processa qualquer resto do buffer.
  */

  if (buffer.trim()) {
    processEvent(buffer);
  }

  if (!fullReply.trim()) {
    throw new Error(
      "A NEXA não retornou nenhum texto."
    );
  }

  /*
    Salva a conversa somente depois
    que a resposta terminou.
  */

  history.push({
    role: "user",
    content: text
  });

  history.push({
    role: "model",
    content: fullReply
  });

  saveMemory();

  /*
    A voz só começa depois que
    todo o streaming terminou.
  */

  speakNexa(fullReply);

  return {
    reply: fullReply,
    finished
  };
}

/*
  ==========================================
  NOVA CONVERSA
  ==========================================
*/

function clearConversation() {
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

/*
  ==========================================
  ENVIO DA MENSAGEM
  ==========================================
*/

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
      Para qualquer fala anterior.
    */

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    /*
      Mostra a mensagem do usuário.
    */

    addMessage(
      text,
      "user"
    );

    input.value = "";

    sendButton.disabled = true;
    micButton.disabled = true;
    newChatButton.disabled = true;

    /*
      Indicador enquanto o primeiro
      pedaço da resposta ainda não chegou.
    */

    showTyping();

    try {
      await askNexa(text);

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

/*
  ==========================================
  NOVA CONVERSA
  ==========================================
*/

newChatButton.addEventListener(
  "click",
  clearConversation
);

/*
  ==========================================
  MICROFONE
  ==========================================
*/

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

/*
  ==========================================
  RESTAURAÇÃO
  ==========================================
*/

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

loadMemory();
restoreConversation();
