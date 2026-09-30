/* =========================
   AUTOMAÇÕES DA NEXA
========================= */

const NEXA_AUTOMATIONS_KEY = "nexa_automations";

function nexaAutomationId() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return "automation_" + Date.now() + "_" + Math.random().toString(16).slice(2);
}

function parseNexaReminder(text) {
  const normalized = String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

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

  if (/^seg/.test(unit) || unit === "s") multiplier = 1000;
  else if (/^hora/.test(unit) || unit === "h") multiplier = 60 * 60000;
  else if (/^dia/.test(unit) || unit === "d") multiplier = 24 * 60 * 60000;

  const triggerAt = Date.now() + Math.round(amount * multiplier);

  let reminder = normalized
    .replace(/^(?:nexa[,:]?\s*)?/, "")
    .replace(/^(?:me\s+)?lembre(?:-me)?\s*/i, "")
    .replace(/^(?:que|de)\s+/i, "")
    .replace(/(?:daqui\s+a|em)\s+\d+(?:[.,]\d+)?\s*(?:segundos?|seg|s|minutos?|min|m|horas?|h|dias?|d)\b/i, "")
    .trim();

  reminder = reminder
    .replace(/^[,.:;!?\s]+|[,.:;!?\s]+$/g, "")
    .replace(/^eu\s+(?:tenho|vou|preciso)\s+/i, "");

  if (!reminder) {
    reminder = "Você pediu um lembrete.";
  }

  return {
    id: nexaAutomationId(),
    type: "reminder",
    text: reminder.slice(0, 300),
    triggerAt
  };
}

function loadNexaAutomations() {
  try {
    const value = JSON.parse(localStorage.getItem(NEXA_AUTOMATIONS_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function saveNexaAutomations(items) {
  localStorage.setItem(NEXA_AUTOMATIONS_KEY, JSON.stringify(items.slice(-100)));
}

async function scheduleNativeReminder(reminder) {
  const plugins = window.Capacitor?.Plugins;
  const notifications = plugins?.LocalNotifications;

  if (!notifications) return false;

  try {
    const permission = await notifications.requestPermissions();

    if (permission?.display !== "granted") {
      return false;
    }

    const numericId = Math.abs(
      Array.from(reminder.id).reduce(
        (hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0,
        0
      )
    ) || Date.now() % 2147483647;

    await notifications.schedule({
      notifications: [{
        id: numericId,
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

  setTimeout(function() {
    const items = loadNexaAutomations().filter(
      item => item.id !== reminder.id
    );
    saveNexaAutomations(items);

    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("NEXA", { body: reminder.text });
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
  const active = loadNexaAutomations().filter(
    item => item && item.type === "reminder" && Number(item.triggerAt) > now
  );

  saveNexaAutomations(active);

  active.forEach(function(reminder) {
    if (!(window.Capacitor?.Plugins?.LocalNotifications)) {
      scheduleWebReminder(reminder);
    }
  });
}

async function handleNexaAutomation(text) {
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
      reminder.text
  };
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

window.NEXAAutomation = {
  parseReminder: parseNexaReminder,
  handle: handleNexaAutomation,
  list: loadNexaAutomations,
  restore: restoreNexaReminders
};

restoreNexaReminders();
