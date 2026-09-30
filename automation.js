/* =========================
   AUTOMAÇÕES DA NEXA
   Camada compartilhada entre Web e APK
========================= */

const NEXA_AUTOMATIONS_KEY = "nexa_automations";
const NEXA_ROUTINES_KEY = "nexa_routines";

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

function getNextTimeTodayOrTomorrow(hour, minute) {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);

  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }

  return target.getTime();
}

function getNextWeekdayTime(weekday, hour, minute) {
  const now = new Date();
  const target = new Date(now);
  const currentDay = target.getDay();
  let days = (weekday - currentDay + 7) % 7;

  target.setHours(hour, minute, 0, 0);

  if (days === 0 && target.getTime() <= now.getTime()) {
    days = 7;
  }

  target.setDate(target.getDate() + days);
  return target.getTime();
}

function parseClock(text) {
  const match = normalizeNexaText(text).match(/(?:as|às)\s+(\d{1,2})(?::(\d{2}))?\s*(?:h|horas?)?\b/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2] || 0);

  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function cleanReminderText(text) {
  let reminder = normalizeNexaText(text)
    .replace(/^(?:nexa[,:]?\s*)?/, "")
    .replace(/^(?:me\s+)?lembre(?:-me)?\s*/i, "")
    .replace(/^(?:que|de)\s+/i, "")
    .replace(/^[,.:;!?\s]+|[,.:;!?\s]+$/g, "")
    .replace(/^eu\s+(?:tenho|vou|preciso)\s+/i, "")
    .replace(/^tenho\s+que\s+/i, "")
    .replace(/^preciso\s+/i, "")
    .replace(/^de\s+/i, "")
    .trim();

  return reminder || "Você pediu um lembrete.";
}

function parseNexaReminder(text) {
  const normalized = normalizeNexaText(text);

  if (!/(?:me\s+)?lembre|lembra|lembrar/.test(normalized)) {
    return null;
  }

  const relative = normalized.match(
    /(?:daqui\s+a|em)\s+(\d+(?:[.,]\d+)?)\s*(segundos?|seg|s|minutos?|min|m|horas?|h|dias?|d)\b/
  );

  if (relative) {
    const amount = Number(String(relative[1]).replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) return null;

    const unit = relative[2];
    let multiplier = 60000;
    if (/^seg/.test(unit) || unit === "s") multiplier = 1000;
    else if (/^hora/.test(unit) || unit === "h") multiplier = 60 * 60000;
    else if (/^dia/.test(unit) || unit === "d") multiplier = 24 * 60 * 60000;

    return {
      id: nexaAutomationId(),
      type: "reminder",
      text: cleanReminderText(
        normalized.replace(
          /(?:daqui\s+a|em)\s+\d+(?:[.,]\d+)?\s*(?:segundos?|seg|s|minutos?|min|m|horas?|h|dias?|d)\b/i,
          ""
        )
      ).slice(0, 300),
      triggerAt: Date.now() + Math.round(amount * multiplier),
      createdAt: Date.now(),
      status: "scheduled",
      recurrence: null
    };
  }

  const clock = parseClock(normalized);
  if (!clock) return null;

  const weekdays = {
    domingo: 0, segunda: 1, "segunda-feira": 1,
    terca: 2, "terca-feira": 2,
    quarta: 3, "quarta-feira": 3,
    quinta: 4, "quinta-feira": 4,
    sexta: 5, "sexta-feira": 5,
    sabado: 6, "sabado": 6
  };

  const weekdayName = Object.keys(weekdays).find(day =>
    normalized.includes(day)
  );

  let triggerAt;
  let recurrence = null;

  if (/todo\s+dia|todos\s+os\s+dias|diariamente/.test(normalized)) {
    triggerAt = getNextTimeTodayOrTomorrow(clock.hour, clock.minute);
    recurrence = { type: "daily", hour: clock.hour, minute: clock.minute };
  } else if (weekdayName) {
    triggerAt = getNextWeekdayTime(
      weekdays[weekdayName],
      clock.hour,
      clock.minute
    );
    recurrence = {
      type: "weekly",
      weekday: weekdays[weekdayName],
      hour: clock.hour,
      minute: clock.minute
    };
  } else if (/amanha/.test(normalized)) {
    const target = new Date();
    target.setDate(target.getDate() + 1);
    target.setHours(clock.hour, clock.minute, 0, 0);
    triggerAt = target.getTime();
  } else {
    triggerAt = getNextTimeTodayOrTomorrow(clock.hour, clock.minute);
  }

  const textWithoutSchedule = normalized
    .replace(/(?:todo\s+dia|todos\s+os\s+dias|diariamente)/g, "")
    .replace(/(?:amanha)/g, "")
    .replace(/(?:de\s+)?(?:domingo|segunda(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sabado)/g, "")
    .replace(/(?:as|às)\s+\d{1,2}(?::\d{2})?\s*(?:h|horas?)?/g, "")
    .trim();

  return {
    id: nexaAutomationId(),
    type: "reminder",
    text: cleanReminderText(textWithoutSchedule).slice(0, 300),
    triggerAt,
    createdAt: Date.now(),
    status: "scheduled",
    recurrence
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

function loadNexaRoutines() {
  try {
    const value = JSON.parse(localStorage.getItem(NEXA_ROUTINES_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function saveNexaRoutines(items) {
  localStorage.setItem(NEXA_ROUTINES_KEY, JSON.stringify(items.slice(-50)));
}

function parseNexaRoutine(text) {
  const normalized = normalizeNexaText(text);
  const match = normalized.match(
    /^(?:nexa[,:]?\s*)?(?:cria|crie|salva|salve)\s+(?:uma\s+)?rotina\s+(.+?)\s*:\s*(.+)$/i
  );

  if (!match) return null;

  const name = match[1].trim();
  const commands = match[2]
    .split(/\s*(?:,|\s+e\s+)\s*/i)
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 10);

  if (!name || !commands.length) return null;

  return {
    id: nexaAutomationId(),
    type: "routine",
    name: name.slice(0, 80),
    commands,
    createdAt: Date.now()
  };
}

function formatReminderList(items) {
  if (!items.length) return "Você não tem lembretes agendados.";

  return "Seus lembretes:\n" + items.slice(0, 10).map(function(item, index) {
    const seconds = Math.max(1, Math.round((Number(item.triggerAt) - Date.now()) / 1000));
    const recurring = item.recurrence ? " (recorrente)" : "";
    return (index + 1) + ". " + item.text + " — em " + formatNexaDelay(seconds) + recurring;
  }).join("\n");
}

async function requestNativeNotificationPermission() {
  const notifications = window.Capacitor?.Plugins?.LocalNotifications;
  if (!notifications) return false;

  try {
    const current = await notifications.checkPermissions();
    if (current?.display === "granted") return true;

    const permission = await notifications.requestPermissions();
    return permission?.display === "granted";
  } catch (error) {
    console.error("NEXA: erro ao pedir permissão:", error);
    return false;
  }
}

async function scheduleNativeReminder(reminder) {
  const notifications = window.Capacitor?.Plugins?.LocalNotifications;
  if (!notifications || !(await requestNativeNotificationPermission())) return false;

  try {
    const notification = {
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
    };

    // No APK, o próprio Android mantém lembretes recorrentes agendados,
    // mesmo quando a NEXA é fechada. Lembretes únicos continuam sendo
    // disparados apenas uma vez.
    if (reminder.recurrence?.type === "daily") {
      notification.schedule.repeats = true;
      notification.schedule.every = "day";
    } else if (reminder.recurrence?.type === "weekly") {
      notification.schedule.repeats = true;
      notification.schedule.every = "week";
    }

    await notifications.schedule({
      notifications: [notification]
    });
    return true;
  } catch (error) {
    console.error("NEXA: erro ao agendar notificação:", error);
    return false;
  }
}

function scheduleWebReminder(reminder) {
  const delay = Math.max(0, reminder.triggerAt - Date.now());

  window.setTimeout(function() {
    const items = loadNexaAutomations();
    const current = items.find(item => item.id === reminder.id);

    if (!current) return;

    if (current.recurrence) {
      current.triggerAt = getNextRecurrence(current);
      saveNexaAutomations(items);
      scheduleWebReminder(current);
    } else {
      saveNexaAutomations(items.filter(item => item.id !== reminder.id));
    }

    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification("NEXA", { body: reminder.text, tag: reminder.id });
      } catch {}
    }

    window.dispatchEvent(new CustomEvent("nexa:reminder-fired", { detail: reminder }));
  }, Math.min(delay, 2147483647));
}

function getNextRecurrence(reminder) {
  const recurrence = reminder.recurrence;
  if (!recurrence) return null;

  if (recurrence.type === "daily") {
    const next = new Date(reminder.triggerAt);
    next.setDate(next.getDate() + 1);
    return next.getTime();
  }

  if (recurrence.type === "weekly") {
    const next = new Date(reminder.triggerAt);
    next.setDate(next.getDate() + 7);
    return next.getTime();
  }

  return null;
}

async function scheduleNexaReminder(reminder) {
  const items = loadNexaAutomations();
  items.push(reminder);
  saveNexaAutomations(items);

  const nativeScheduled = await scheduleNativeReminder(reminder);

  if (!nativeScheduled) {
    if ("Notification" in window && Notification.permission === "default") {
      try { await Notification.requestPermission(); } catch {}
    }
    scheduleWebReminder(reminder);
  }

  return nativeScheduled;
}

function restoreNexaReminders() {
  const now = Date.now();
  const active = loadNexaAutomations().filter(item =>
    item &&
    item.type === "reminder" &&
    Number(item.triggerAt) > now &&
    item.status !== "cancelled"
  );

  saveNexaAutomations(active);

  active.forEach(function(reminder) {
    if (window.Capacitor?.Plugins?.LocalNotifications) {
      scheduleNativeReminder(reminder);
    } else {
      scheduleWebReminder(reminder);
    }
  });
}

async function cancelNexaReminder(query) {
  const normalizedQuery = normalizeNexaText(query);
  const items = loadNexaAutomations();

  if (!items.length) {
    return { handled: true, reply: "Não tem nenhum lembrete agendado." };
  }

  const candidate = items
    .filter(item => item && item.type === "reminder")
    .sort((a, b) => Number(a.triggerAt) - Number(b.triggerAt))
    .find(item => !normalizedQuery || normalizeNexaText(item.text).includes(normalizedQuery));

  if (!candidate) {
    return { handled: true, reply: "Não achei um lembrete correspondente." };
  }

  const notifications = window.Capacitor?.Plugins?.LocalNotifications;
  if (notifications) {
    try {
      await notifications.cancel({
        notifications: [{ id: getNativeNotificationId(candidate.id) }]
      });
    } catch {}
  }

  saveNexaAutomations(items.filter(item => item.id !== candidate.id));

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

async function cancelNexaReminderById(id) {
  const items = loadNexaAutomations();
  const candidate = items.find(item => item.id === id);

  if (!candidate) {
    return { handled: true, reply: "Não achei esse lembrete." };
  }

  const notifications = window.Capacitor?.Plugins?.LocalNotifications;

  if (notifications) {
    try {
      await notifications.cancel({
        notifications: [{ id: getNativeNotificationId(candidate.id) }]
      });
    } catch {}
  }

  saveNexaAutomations(items.filter(item => item.id !== id));
  window.dispatchEvent(new CustomEvent("nexa:automation-changed"));

  return {
    handled: true,
    reply: "Lembrete excluído: " + candidate.text
  };
}

async function pauseNexaReminder(id) {
  const items = loadNexaAutomations();
  const candidate = items.find(item => item.id === id);

  if (!candidate) return false;

  const remainingMs = Math.max(
    1000,
    Number(candidate.triggerAt) - Date.now()
  );

  const notifications = window.Capacitor?.Plugins?.LocalNotifications;

  if (notifications) {
    try {
      await notifications.cancel({
        notifications: [{ id: getNativeNotificationId(candidate.id) }]
      });
    } catch {}
  }

  candidate.status = "paused";
  candidate.remainingMs = remainingMs;
  candidate.pausedAt = Date.now();

  saveNexaAutomations(items);
  window.dispatchEvent(new CustomEvent("nexa:automation-changed"));
  return true;
}

async function resumeNexaReminder(id) {
  const items = loadNexaAutomations();
  const candidate = items.find(item => item.id === id);

  if (!candidate) return false;

  if (candidate.status !== "paused") return true;

  if (candidate.recurrence) {
    candidate.triggerAt = getNextRecurrence({
      ...candidate,
      triggerAt: Date.now()
    });
  } else {
    candidate.triggerAt = Date.now() + Math.max(
      1000,
      Number(candidate.remainingMs) || 60000
    );
  }

  candidate.status = "scheduled";
  delete candidate.remainingMs;
  delete candidate.pausedAt;

  saveNexaAutomations(items);

  const nativeScheduled = await scheduleNativeReminder(candidate);

  if (!nativeScheduled) {
    if ("Notification" in window && Notification.permission === "default") {
      try { await Notification.requestPermission(); } catch {}
    }
    scheduleWebReminder(candidate);
  }

  window.dispatchEvent(new CustomEvent("nexa:automation-changed"));
  return true;
}

async function handleNexaAutomation(text) {
  const normalized = normalizeNexaText(text);

  const routine = parseNexaRoutine(text);
  if (routine) {
    const routines = loadNexaRoutines();
    routines.push(routine);
    saveNexaRoutines(routines);

    return {
      handled: true,
      reply: "Rotina " + routine.name + " salva. Comandos: " + routine.commands.join(" • ")
    };
  }

  const routineRun = normalized.match(
    /^(?:nexa[,:]?\s*)?(?:ativa|executa|inicia|roda)\s+(?:a\s+)?rotina\s+(.+)$/i
  );

  if (routineRun) {
    const name = routineRun[1].trim();
    const routineToRun = loadNexaRoutines().find(
      item => normalizeNexaText(item.name) === name
    );

    if (!routineToRun) {
      return { handled: true, reply: "Não achei essa rotina." };
    }

    const results = [];
    for (const command of routineToRun.commands) {
      const reminder = parseNexaReminder(command);
      if (reminder) {
        await scheduleNexaReminder(reminder);
        results.push("lembrete: " + reminder.text);
      } else {
        results.push("comando preparado: " + command);
      }
    }

    return {
      handled: true,
      reply: "Rotina " + routineToRun.name + " executada.\n" + results.join("\n")
    };
  }

  if (
    /^(?:nexa[,:]?\s*)?(?:mostra|mostrar|lista|listar|quais sao|quais)\s+(?:meus\s+)?lembretes$/.test(normalized) ||
    /^(?:nexa[,:]?\s*)?(?:meus\s+)?lembretes$/.test(normalized)
  ) {
    return { handled: true, reply: formatReminderList(listNexaReminders()) };
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
  const seconds = Math.max(1, Math.round((reminder.triggerAt - Date.now()) / 1000));

  return {
    handled: true,
    nativeScheduled,
    reminder,
    reply:
      "Fechou. Vou te lembrar em " +
      formatNexaDelay(seconds) +
      ": " +
      reminder.text +
      (reminder.recurrence ? " Isso vai se repetir automaticamente." : "") +
      (nativeScheduled ? "" : " Enquanto estiver no navegador, também deixei o lembrete ativo.")
  };
}

window.NEXAAutomation = {
  parseReminder: parseNexaReminder,
  handle: handleNexaAutomation,
  list: listNexaReminders,
  cancel: cancelNexaReminder,
  cancelById: cancelNexaReminderById,
  pause: pauseNexaReminder,
  resume: resumeNexaReminder,
  restore: restoreNexaReminders,
  routines: loadNexaRoutines
};

restoreNexaReminders();
