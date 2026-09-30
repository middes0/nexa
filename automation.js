/* =========================
   AUTOMAÇÕES DA NEXA
   Camada compartilhada entre Web e APK
========================= */

const NEXA_AUTOMATIONS_KEY = "nexa_automations";

function nexaAutomationId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return "automation_" + Date.now() + "_" + Math.random().toString(16).slice(2);
}

function normalizeNexaText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function getNativeNotificationId(id) {
  const hash = Array.from(String(id)).reduce(
    (value, char) => ((value << 5) - value + char.charCodeAt(0)) | 0,
    0
  );

  return Math.abs(hash) || (Date.now() % 2147483647);
}

function formatNexaDelay(seconds) {
  if (seconds < 60) {
    return seconds + (seconds === 1 ? " segundo" : " segundos");
  }

  const minutes = Math.round(seconds / 60);

  if (minutes < 60) {
    return minutes + (minutes === 1 ? " minuto" : " minutos");
  }

  const hours = Math.round(minutes / 60);
  return hours + (hours === 1 ? " hora" : " horas");
}

function parseNexaReminder(text) {
  const normalized = normalizeNexaText(text);

  if (!/(?:me\s+)?lembre|lembra|lembrar/.test(normalized)) {
    return null;
  }

  const match = normalized.match(
    /(?:daqui\s+a|em)\s+(\d+(?:[.,]\d+)?)\s*(segundos?|seg|s|minutos?|min|m|horas?|h|dias?|d)\b/
  );

  if (!match) return null;

  const amount = Number(String(match[1]).replace(",", "."));

  if (!Number.isFinite(amount) || amount <= 0) return null;

  const unit = match[2];
  let multiplier = 60000;

  if (/^seg/.test(unit) || unit === "s") {
    multiplier = 1000;
  } else if (/^hora/.test(unit) || unit === "h") {
    multiplier = 60 * 60000;
  } else if (/^dia/.test(unit) || unit === "d") {
    multiplier = 24 * 60 * 60000;
  }

  const triggerAt = Date.now() + Math.round(amount * multiplier);

  let reminder = normalized
    .replace(/^(?:nexa[,:]?\s*)?/, "")
    .replace(/^(?:me\s+)?lembre(?:-me)?\s*/i, "")
    .replace(/^(?:que|de)\s+/i, "")
    .replace(
      /(?:daqui\s+a|em)\s+\d+(?:[.,]\d+)?\s*(?:segundos?|seg|s|minutos?|min|m|horas?|h|dias?|d)\b/i,
      ""
    )
    .trim();

  reminder = reminder
    .replace(/^[,.:;!?\s]+|[,.:;!?\s]+$/g, "")
    .replace(/^eu\s+(?:tenho|vou|preciso)\s+/i, "")
    .replace(/^tenho\s+que\s+/i, "")
    .replace(/^preciso\s+/i, "")
    .replace(/^de\s+/i, "")
    .trim();

  if (!reminder) {
    reminder = "Você pediu um lembrete.";
  }

  return {
    id: nexaAutomationId(),
    type: "reminder",
    text: reminder.slice(0, 300),
    triggerAt,
    createdAt: Date.now(),
    status: "scheduled"
  };
}

function loadNexaAutomations() {
  try {
    const value = JSON.parse(
      localStorage.getItem(NEXA_AUTOMATIONS_KEY) || "[]"
    );

    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function saveNexaAutomations(items) {
  localStorage.setItem(
    NEXA_AUTOMATIONS_KEY,
    JSON.stringify(items.slice(-100))
  );
}

async function requestNativeNotificationPermission() {
  const notifications = window.Capacitor?.Plugins?.LocalNotifications;

  if (!notifications) return false;

  try {
    const current = await notifications.checkPermissions();

    if (current?.display === "granted") {
      return true;
    }

    const permission = await notifications.requestPermissions();

    return permission?.display === "granted";
  } catch (error) {
    console.error("NEXA: erro ao pedir permissão de notificações:", error);
    return false;
  }
}

async function scheduleNativeReminder(reminder) {
  const notifications = window.Capacitor?.Plugins?.LocalNotifications;

  if (!notifications) return false;

  const granted = await requestNativeNotificationPermission();

  if (!granted) return false;

  try {
    await notifications.schedule({
      notifications: [{
        id: getNativeNotificationId(reminder.id),
        title: "NEXA",
        body: reminder.text,
        schedule: {
          at: new Date(reminder.triggerAt),
          allowWhileIdle: true
        },
        extra: {
          type: "nexa-reminder",
          reminderId: reminder.id
        }
      }]
    });

    return true;
  } catch (error) {
    console.error("NEXA: erro ao agendar notificação nativa:", error);
    return false;
  }
}

function scheduleWebReminder(reminder) {
  const delay = Math.max(0, reminder.triggerAt - Date.now());

  window.setTimeout(function() {
    const items = loadNexaAutomations().filter(
      item => item.id !== reminder.id
    );

    saveNexaAutomations(items);

    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification("NEXA", {
          body: reminder.text,
          tag: reminder.id
        });
      } catch (error) {
        console.error("NEXA: não consegui mostrar a notificação web:", error);
      }
    }

    window.dispatchEvent(
      new CustomEvent("nexa:reminder-fired", {
        detail: reminder
      })
    );
  }, Math.min(delay, 2147483647));
}

async function scheduleNexaReminder(reminder) {
  const items = loadNexaAutomations();

  items.push(reminder);
  saveNexaAutomations(items);

  const nativeScheduled = await scheduleNativeReminder(reminder);

  if (!nativeScheduled) {
    if ("Notification" in window && Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch {}
    }

    scheduleWebReminder(reminder);
  }

  return nativeScheduled;
}

function restoreNexaReminders() {
  const now = Date.now();

  const active = loadNexaAutomations().filter(function(item) {
    return (
      item &&
      item.type === "reminder" &&
      Number(item.triggerAt) > now &&
      item.status !== "cancelled"
    );
  });

  saveNexaAutomations(active);

  active.forEach(function(reminder) {
    if (!window.Capacitor?.Plugins?.LocalNotifications) {
      scheduleWebReminder(reminder);
    }
  });
}

async function cancelNexaReminder(query) {
  const normalizedQuery = normalizeNexaText(query);

  const items = loadNexaAutomations();

  if (!items.length) {
    return {
      handled: true,
      reply: "Não tem nenhum lembrete agendado."
    };
  }

  const candidate = items
    .filter(item => item && item.type === "reminder")
    .sort((a, b) => Number(a.triggerAt) - Number(b.triggerAt))
    .find(function(item) {
      const reminderText = normalizeNexaText(item.text);
      return !normalizedQuery || reminderText.includes(normalizedQuery);
    });

  if (!candidate) {
    return {
      handled: true,
      reply: "Não achei um lembrete correspondente."
    };
  }

  const notifications = window.Capacitor?.Plugins?.LocalNotifications;

  if (notifications) {
    try {
      await notifications.cancel({
        notifications: [{
          id: getNativeNotificationId(candidate.id)
        }]
      });
    } catch (error) {
      console.error("NEXA: erro ao cancelar notificação nativa:", error);
    }
  }

  saveNexaAutomations(
    items.filter(item => item.id !== candidate.id)
  );

  return {
    handled: true,
    reply: "Certo. Cancelei o lembrete: " + candidate.text
  };
}

function listNexaReminders() {
  return loadNexaAutomations()
    .filter(item => item && item.type === "reminder")
    .sort((a, b) => Number(a.triggerAt) - Number(b.triggerAt));
}

function formatReminderList(items) {
  if (!items.length) {
    return "Você não tem lembretes agendados.";
  }

  const lines = items.slice(0, 10).map(function(item, index) {
    const seconds = Math.max(
      1,
      Math.round((Number(item.triggerAt) - Date.now()) / 1000)
    );

    return (index + 1) + ". " + item.text + " — em " + formatNexaDelay(seconds);
  });

  return "Seus lembretes:\n" + lines.join("\n");
}

async function handleNexaAutomation(text) {
  const normalized = normalizeNexaText(text);

  if (
    /^(?:nexa[,:]?\s*)?(?:mostra|mostrar|lista|listar|quais sao|quais)\s+(?:meus\s+)?lembretes$/.test(normalized) ||
    /^(?:nexa[,:]?\s*)?(?:meus\s+)?lembretes$/.test(normalized)
  ) {
    return {
      handled: true,
      reply: formatReminderList(listNexaReminders())
    };
  }

  if (
    /\b(?:cancela|cancelar|cancele|apaga|apagar|remove|remover)\b/.test(normalized) &&
    /\blembrete|lembretes\b/.test(normalized)
  ) {
    const query = normalized
      .replace(/^(?:nexa[,:]?\s*)?/, "")
      .replace(/\b(?:cancela|cancelar|cancele|apaga|apagar|remove|remover)\b/g, "")
      .replace(/\blembrete|lembretes\b/g, "")
      .replace(/\b(?:o|os|um|uma|meu|meus|do|da|de)\b/g, " ")
      .trim();

    return cancelNexaReminder(query);
  }

  const reminder = parseNexaReminder(text);

  if (!reminder) return null;

  const nativeScheduled = await scheduleNexaReminder(reminder);

  const seconds = Math.max(
    1,
    Math.round((reminder.triggerAt - Date.now()) / 1000)
  );

  return {
    handled: true,
    nativeScheduled,
    reminder,
    reply:
      "Fechou. Vou te lembrar em " +
      formatNexaDelay(seconds) +
      ": " +
      reminder.text +
      (nativeScheduled
        ? ""
        : " Enquanto estiver no navegador, também deixei o lembrete ativo.")
  };
}

window.NEXAAutomation = {
  parseReminder: parseNexaReminder,
  handle: handleNexaAutomation,
  list: listNexaReminders,
  cancel: cancelNexaReminder,
  restore: restoreNexaReminders
};

restoreNexaReminders();
