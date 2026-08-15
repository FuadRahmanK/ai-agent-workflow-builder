import { Request, Response } from "express";
import { Resend } from "resend";
import { pool } from "../db.js";

const resendApiKey = process.env.RESEND_API_KEY;
const notificationFromEmail =
  process.env.NOTIFICATION_FROM_EMAIL ||
  "onboarding@resend.dev";

const resend = resendApiKey
  ? new Resend(resendApiKey)
  : null;

export async function notificationEvent(
  req: Request,
  res: Response
) {
  try {

    const event = req.body?.event;

    const notification =
      event?.data?.new;

    if (!notification?.id) {
      return res.status(400).json({
        message:
          "Notification event is missing notification data",
      });
    }

    if (notification.channel !== "email") {
      return res.status(400).json({
        message:
          `Unsupported notification channel: ${notification.channel}`,
      });
    }

    if (!resend) {
      console.error(
        "RESEND_API_KEY is not configured."
      );

      await pool.query(
        `
        UPDATE notifications
        SET
          status = 'failed',
          processed_at = NOW()
        WHERE id = $1
        `,
        [notification.id]
      );

      return res.status(500).json({
        message:
          "Notification provider is not configured",
      });
    }

    if (!notification.recipient) {
      await pool.query(
        `
        UPDATE notifications
        SET
          status = 'failed',
          processed_at = NOW()
        WHERE id = $1
        `,
        [notification.id]
      );

      return res.status(400).json({
        message:
          "Notification recipient is missing",
      });
    }

    const { data, error } =
      await resend.emails.send({
        from: notificationFromEmail,
        to: [notification.recipient],
        subject:
          notification.subject ||
          "Workflow Notification",
        text:
          notification.message ||
          "Your workflow generated a notification.",
      });

    if (error) {
      console.error(
        "Resend email error:",
        error
      );

      await pool.query(
        `
        UPDATE notifications
        SET
          status = 'failed',
          processed_at = NOW()
        WHERE id = $1
        `,
        [notification.id]
      );

      return res.status(502).json({
        message:
          "Failed to send notification",
        error: error.message,
      });
    }

    await pool.query(
      `
      UPDATE notifications
      SET
        status = 'sent',
        processed_at = NOW()
      WHERE id = $1
      `,
      [notification.id]
    );

    console.log(
      "Notification sent successfully:",
      {
        notificationId: notification.id,
        resendId: data?.id,
        recipient:
          notification.recipient,
      }
    );

    return res.status(200).json({
      message:
        "Notification sent successfully",
      notification_id:
        notification.id,
      provider_id:
        data?.id ?? null,
    });
  } catch (error) {
    console.error(
      "Notification event error:",
      error
    );

    try {
      const notificationId =
        req.body?.event?.data?.new?.id;

      if (notificationId) {
        await pool.query(
          `
          UPDATE notifications
          SET
            status = 'failed',
            processed_at = NOW()
          WHERE id = $1
          `,
          [notificationId]
        );
      }
    } catch (updateError) {
      console.error(
        "Failed to update notification status:",
        updateError
      );
    }

    return res.status(500).json({
      message:
        "Failed to process notification event",
    });
  }
}