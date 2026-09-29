const composer = document.getElementById("composer");
const input = document.getElementById("messageInput");
const chat = document.getElementById("chat");
const micButton = document.getElementById("micButton");
const sendButton = composer.querySelector('button[type="submit"]');
const newChatButton = document.getElementById("newChatButton");

const history = [];

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
  if (document.getElementById("nexaTyping")) {
    return;
  }

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

  if (typing) {
    typing.remove();
  }
}

function addAnimatedMessage(text) {
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

  let index = 0;
  const speed = 18;

  function typeNextCharacter() {
    if (index >= text.length) {
      return;
    }

    paragraph.textContent += text[index];
    index++;

    message.scrollIntoView({
      behavior: "smooth",
      block: "end"
    });

    setTimeout(typeNextCharacter, speed);
  }

  typeNextCharacter();
}

function clearConversation() {
  history.length = 0;
  hideTyping();

  chat.innerHTML = `
    <div class="message nexa">
      <span class="label">NEXA</span>
      <p>Conversa limpa. Tô pronta de novo — manda a boa.</p>
    </div>
  `;

  input.value = "";
  input.focus();
}

async function askNexa(text) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: text,
      history: history.slice(-12)
    })
  });

  let data;

  try {
    data = await response.json();
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

composer.addEventListener("submit", async function (event) {
  event.preventDefault();

  const text = input.value.trim();

  if (!text || sendButton.disabled) {
    return;
  }

  addMessage(text, "user");

  input.value = "";

  sendButton.disabled = true;
  micButton.disabled = true;
  newChatButton.disabled = true;

  showTyping();

  try {
    const reply = await askNexa(text);

    hideTyping();

    history.push({
      role: "user",
      content: text
    });

    history.push({
      role: "model",
      content: reply
    });

    addAnimatedMessage(reply);

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
    input.focus();
  }
});

newChatButton.addEventListener("click", clearConversation);

micButton.addEventListener("click", function () {
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

  recognition.onstart = function () {
    micButton.textContent = "●";
    micButton.disabled = true;
  };

  recognition.onresult = function (event) {
    input.value = event.results[0][0].transcript;
    input.focus();
  };

  recognition.onerror = function () {
    addMessage(
      "Não consegui entender o áudio. Tente falar novamente.",
      "nexa"
    );
  };

  recognition.onend = function () {
    micButton.textContent = "◉";
    micButton.disabled = false;
  };

  recognition.start();
});
