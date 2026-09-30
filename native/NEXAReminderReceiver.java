package com.nexa.assistant;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public class NEXAReminderReceiver extends BroadcastReceiver {
    private static final String CHANNEL_ID = "nexa_reminders";

    @Override
    public void onReceive(Context context, Intent intent) {
        String text = intent.getStringExtra("text");
        if (text == null || text.trim().isEmpty()) {
            text = "Você tem um lembrete agendado.";
        }

        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Lembretes da NEXA",
                NotificationManager.IMPORTANCE_HIGH
            );
            manager.createNotificationChannel(channel);
        }

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(context, CHANNEL_ID)
            : new Notification.Builder(context);

        builder
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Lembrete da NEXA")
            .setContentText("Lembrete: " + text)
            .setStyle(new Notification.BigTextStyle().bigText("Lembrete: " + text))
            .setAutoCancel(true)
            .setPriority(Notification.PRIORITY_HIGH);

        manager.notify((int) (System.currentTimeMillis() & 0x7fffffff), builder.build());
    }
}
