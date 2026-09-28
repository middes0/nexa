const composer = document.getElementById("composer");
const input = document.getElementById("messageInput");
const chat = document.getElementById("chat");
const micButton = document.getElementById("micButton");

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

composer.addEventListener("submit", function(event) {
  event.preventDefault();

  const text = input.value.trim();

  if (!text) {
    return;
  }

  addMessage(text, "user");
  input.value = "";

  setTimeout(function() {
    addMessage(
      "Recebi sua mensagem. Minha inteligência artificial ainda será conectada nesta versão.",
      "nexa"
    );
  }, 450);
});

micButton.addEventListener("click", function() {
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
  };

  recognition.onresult = function(event) {
    input.value = event.results[0][0].transcript;
  };

  recognition.onerror = function() {
    addMessage(
      "Não consegui entender o áudio. Tente falar novamente.",
      "nexa"
    );
  };

  recognition.onend = function() {
    micButton.textContent = "◉";
  };

  recognition.start();
});
