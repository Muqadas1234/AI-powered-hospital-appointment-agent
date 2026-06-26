export const dynamic = "force-dynamic";

import { runDueReminders, retryFailedNotifications } from "../../../../../lib/notification.js";

export async function GET(req) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    const remindersCount = await runDueReminders();
    const retriedCount = await retryFailedNotifications();

    return Response.json({
      success: true,
      reminders_sent: remindersCount,
      notifications_retried: retriedCount,
    });
  } catch (error) {
    console.error("Cron handler error:", error);
    return Response.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
