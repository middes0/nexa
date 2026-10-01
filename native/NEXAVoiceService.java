package com.nexa.assistant;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Bundle;
import android.os.IBinder;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import java.util.ArrayList;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class NEXAVoiceService extends Service implements TextToSpeech.OnInitListener {
    private static final String CHANNEL_ID = "nexa_voice";
    private static final int NOTIFICATION_ID = 4101;

    private SpeechRecognizer recognizer;
    private TextToSpeech tts;
    private boolean commandMode = false;
    private boolean readyToSpeak = false;
    private boolean pendingWakeResponse = false;
    private final android.os.Handler handler = new android.os.Handler(android.os.Looper.getMainLooper());

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
        startForeground(NOTIFICATION_ID, buildNotification());
        tts = new TextToSpeech(this, this);
        startWakeListening();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Reafirma o foreground e a escuta sempre que o Android recriar o serviço.
        try {
            startForeground(NOTIFICATION_ID, buildNotification());
        } catch (Exception ignored) {}
        if (recognizer == null) {
            startWakeListening();
        }
        return START_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // Sair da tela/fechar a tarefa não deve desligar a NEXA.
        try {
            Intent restart = new Intent(getApplicationContext(), NEXAVoiceService.class);
            if (android.os.Build.VERSION.SDK_INT >= 26) {
                getApplicationContext().startForegroundService(restart);
            } else {
                getApplicationContext().startService(restart);
            }
        } catch (Exception ignored) {}
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        stopRecognizer();
        if (tts != null) tts.shutdown();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onInit(int status) {
        readyToSpeak = status == TextToSpeech.SUCCESS;
        if (readyToSpeak) {
            tts.setLanguage(new Locale("pt", "BR"));
            if (pendingWakeResponse) {
                pendingWakeResponse = false;
                speak("Estou ouvindo, pode falar.", "listen_command");
            }
        }
    }

    private void createChannel() {
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "NEXA — escuta por voz",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Mantém a NEXA disponível para o comando de voz.");
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.createNotificationChannel(channel);
    }

    private Notification buildNotification() {
        Intent launch = new Intent(this, MainActivity.class);
        PendingIntent pending = PendingIntent.getActivity(
            this,
            0,
            launch,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        return new Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle("NEXA está ouvindo")
            .setContentText("Diga “NEXA” para ativar.")
            .setContentIntent(pending)
            .setOngoing(true)
            .build();
    }

    private void startWakeListening() {
        commandMode = false;
        startRecognition(false);
    }

    private void startCommandListening() {
        commandMode = true;
        if (readyToSpeak) {
            speak("Estou ouvindo, pode falar.", "listen_command");
        } else {
            pendingWakeResponse = true;
            startRecognition(true);
        }
    }

    private void speak(String text, String utteranceId) {
        if (!readyToSpeak) {
            if ("listen_command".equals(utteranceId)) {
                startRecognition(true);
            }
            return;
        }

        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String id) {}

            @Override public void onDone(String id) {
                if ("listen_command".equals(id)) {
                    startRecognition(true);
                }
            }

            @Override public void onError(String id) {
                if ("listen_command".equals(id)) {
                    startRecognition(true);
                }
            }
        });

        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId);
    }

    private void startRecognition(boolean command) {
        stopRecognizer();

        if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)
                != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            return;
        }

        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            return;
        }

        try {
            recognizer = SpeechRecognizer.createSpeechRecognizer(this);
        } catch (SecurityException e) {
            recognizer = null;
            handler.postDelayed(() -> startRecognition(command), 1000L);
            return;
        }
        recognizer.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle params) {}

            @Override public void onBeginningOfSpeech() {}

            @Override public void onRmsChanged(float rmsdB) {}

            @Override public void onBufferReceived(byte[] buffer) {}

            @Override public void onEndOfSpeech() {}

            @Override public void onError(int error) {
                recognizer = null;
                handler.postDelayed(() -> {
                    if (commandMode == command) {
                        startRecognition(command);
                    } else {
                        startRecognition(false);
                    }
                }, command ? 350L : 250L);
            }

            @Override public void onResults(Bundle results) {
                ArrayList<String> values =
                    results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);

                String text = values != null && !values.isEmpty() ? values.get(0) : "";

                if (!command) {
                    if (containsWakeWord(text)) {
                        commandMode = true;
                        startCommandListening();
                    } else {
                        startRecognition(false);
                    }
                    return;
                }

                handleCommand(text);
            }

            @Override public void onPartialResults(Bundle partialResults) {
                // Wait for the final result before switching to command mode.
                // This prevents the recognizer from being stopped too early.
            }

            @Override public void onEvent(int eventType, Bundle params) {}
        });

        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(
            RecognizerIntent.EXTRA_LANGUAGE_MODEL,
            RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
        );
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pt-BR");
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "pt-BR");
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, !command);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);

        try {
            recognizer.startListening(intent);
        } catch (SecurityException e) {
            recognizer = null;
            handler.postDelayed(() -> startRecognition(command), 1000L);
        } catch (Exception e) {
            recognizer = null;
            handler.postDelayed(() -> startRecognition(command), 500L);
        }
    }

    private boolean containsWakeWord(String text) {
        String normalized = normalize(text);
        return normalized.matches(".*\\bnexa\\b.*");
    }

    private String normalize(String text) {
        return text == null ? "" : text
            .toLowerCase(Locale.ROOT)
            .replace("á", "a")
            .replace("à", "a")
            .replace("ã", "a")
            .replace("â", "a")
            .replace("é", "e")
            .replace("ê", "e")
            .replace("í", "i")
            .replace("ó", "o")
            .replace("ô", "o")
            .replace("õ", "o")
            .replace("ú", "u")
            .replace("ç", "c")
            .trim();
    }

    private void handleCommand(String command) {
        String normalized = normalize(command);
        Matcher matcher = Pattern.compile(
            "(?:daqui\\s+a|em|depois\\s+de)\\s+(\\d+(?:[.,]\\d+)?)\\s*(segundos?|seg|minutos?|min|horas?|h|dias?|d)\\b"
        ).matcher(normalized);

        if (!matcher.find()) {
            speak("Não entendi o comando. Pode falar de novo.", "retry_command");
            new android.os.Handler().postDelayed(() -> startCommandListening(), 1800);
            return;
        }

        double amount = Double.parseDouble(matcher.group(1).replace(",", "."));
        String unit = matcher.group(2);

        long multiplier = 60_000L;
        if (unit.startsWith("seg")) multiplier = 1_000L;
        else if (unit.startsWith("hora") || unit.equals("h")) multiplier = 3_600_000L;
        else if (unit.startsWith("dia") || unit.equals("d")) multiplier = 86_400_000L;

        long delay = Math.max(1_000L, Math.round(amount * multiplier));

        String reminder = normalized.substring(0, matcher.start()) +
            normalized.substring(matcher.end());

        reminder = reminder
            .replaceFirst("^.*?\\bnexa\\b[,.:]?\\s*", "")
            .replaceFirst("^\\s*(?:que|eu\\s+)?(?:eu\\s+)?(?:va|vou|irei|ire)\\s+", "")
            .replaceFirst("^\\s*(?:me\\s+)?(?:lembra|avisa|avise|notifica)\\s+", "")
            .replaceAll("\\s+", " ")
            .replaceAll("^[,.:;!?\\s]+|[,.:;!?\\s]+$", "")
            .trim();

        if (reminder.isEmpty()) {
            reminder = "Você tem um lembrete agendado.";
        }

        scheduleReminder(reminder, System.currentTimeMillis() + delay);
        speak("Fechado. Vou te lembrar em " + formatDelay(delay) + ": " + reminder + ".", "done");
        new android.os.Handler().postDelayed(() -> startWakeListening(), 3500);
    }

    private void scheduleReminder(String text, long triggerAt) {
        android.app.AlarmManager alarm =
            (android.app.AlarmManager) getSystemService(ALARM_SERVICE);

        Intent intent = new Intent(this, NEXAReminderReceiver.class);
        intent.putExtra("text", text);

        int requestCode = (int) (System.currentTimeMillis() & 0x7fffffff);

        PendingIntent pending = PendingIntent.getBroadcast(
            this,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        if (android.os.Build.VERSION.SDK_INT >= 23) {
            alarm.setExactAndAllowWhileIdle(
                android.app.AlarmManager.RTC_WAKEUP,
                triggerAt,
                pending
            );
        } else {
            alarm.setExact(
                android.app.AlarmManager.RTC_WAKEUP,
                triggerAt,
                pending
            );
        }
    }

    private String formatDelay(long millis) {
        long seconds = Math.max(1, Math.round(millis / 1000.0));
        if (seconds < 60) return seconds + (seconds == 1 ? " segundo" : " segundos");
        long minutes = Math.round(seconds / 60.0);
        if (minutes < 60) return minutes + (minutes == 1 ? " minuto" : " minutos");
        long hours = Math.round(minutes / 60.0);
        return hours + (hours == 1 ? " hora" : " horas");
    }

    private void stopRecognizer() {
        if (recognizer != null) {
            try { recognizer.cancel(); } catch (Exception ignored) {}
            try { recognizer.destroy(); } catch (Exception ignored) {}
            recognizer = null;
        }
    }
}
