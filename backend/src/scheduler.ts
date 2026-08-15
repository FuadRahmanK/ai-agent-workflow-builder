import { pool } from "./db.js";
import { executeWorkflow } from "./workflow/executor.js";

type ScheduleType =
  | "interval"
  | "daily"
  | "weekly";

interface ScheduledTriggerConfig {
  schedule_type?: ScheduleType;
  interval_minutes?: number;
  time?: string;
  day_of_week?: number;
  timezone?: string;
}

interface ScheduledTriggerRow {
  trigger_id: string;
  workflow_id: string;
  org_id: string;
  config: ScheduledTriggerConfig;
  next_run_at: string | null;
  quota_limit: number;
  quota_used: number;
}

const POLL_INTERVAL_MS = Math.max(
  5_000,
  Number(
    process.env.WORKFLOW_SCHEDULER_POLL_MS ??
      10_000
  )
);

let schedulerTimer: NodeJS.Timeout | null = null;
let schedulerRunning = false;

export function startWorkflowScheduler(): void {
  if (schedulerTimer) {
    return;
  }

  console.log(
    `Workflow scheduler started (poll ${POLL_INTERVAL_MS}ms)`
  );

  void runSchedulerTick();

  schedulerTimer = setInterval(() => {
    void runSchedulerTick();
  }, POLL_INTERVAL_MS);
}

export function stopWorkflowScheduler(): void {
  if (!schedulerTimer) {
    return;
  }

  clearInterval(schedulerTimer);
  schedulerTimer = null;
}

async function runSchedulerTick(): Promise<void> {
  if (schedulerRunning) {
    return;
  }

  schedulerRunning = true;

  try {
    const result =
      await pool.query<ScheduledTriggerRow>(
        `
        SELECT
          wt.id AS trigger_id,
          wt.workflow_id,
          wt.config,
          wt.next_run_at,
          w.org_id,
          o.quota_limit,
          o.quota_used
        FROM workflow_triggers wt
        JOIN workflows w
          ON w.id = wt.workflow_id
        JOIN organizations o
          ON o.id = w.org_id
        WHERE wt.type = 'scheduled'
          AND wt.enabled = TRUE
        ORDER BY
          wt.next_run_at NULLS FIRST,
          wt.created_at ASC
        LIMIT 100
        `
      );

    for (const trigger of result.rows) {
      await processScheduledTrigger(
        trigger
      );
    }
  } catch (error) {
    console.error(
      "Workflow scheduler tick failed:",
      error
    );
  } finally {
    schedulerRunning = false;
  }
}

async function processScheduledTrigger(
  trigger: ScheduledTriggerRow
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const lockedResult =
      await client.query<ScheduledTriggerRow>(
        `
        SELECT
          wt.id AS trigger_id,
          wt.workflow_id,
          wt.config,
          wt.next_run_at,
          w.org_id,
          o.quota_limit,
          o.quota_used
        FROM workflow_triggers wt
        JOIN workflows w
          ON w.id = wt.workflow_id
        JOIN organizations o
          ON o.id = w.org_id
        WHERE wt.id = $1
          AND wt.type = 'scheduled'
          AND wt.enabled = TRUE
        FOR UPDATE OF wt, o
        `,
        [trigger.trigger_id]
      );

    if (lockedResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return;
    }

    const current =
      lockedResult.rows[0];

    const config =
      current.config ?? {};

    const now = new Date();

    if (!current.next_run_at) {
      const nextRunAt =
        calculateNextRunAt(
          config,
          now
        );

      await client.query(
        `
        UPDATE workflow_triggers
        SET next_run_at = $1
        WHERE id = $2
        `,
        [
          nextRunAt,
          current.trigger_id,
        ]
      );

      await client.query("COMMIT");
      return;
    }

    const nextRunAt =
      new Date(current.next_run_at);

    if (
      Number.isNaN(nextRunAt.getTime()) ||
      nextRunAt > now
    ) {
      await client.query("COMMIT");
      return;
    }

    if (
      current.quota_used >=
      current.quota_limit
    ) {
      await client.query("COMMIT");

      console.warn(
        `Scheduled workflow ${current.workflow_id} skipped: organization quota exhausted.`
      );

      return;
    }

    const runResult =
      await client.query<{
        id: string;
        workflow_id: string;
        status: string;
      }>(
        `
        INSERT INTO workflow_runs (
          workflow_id,
          trigger_type,
          status,
          started_at
        )
        VALUES (
          $1,
          'scheduled',
          'running',
          NOW()
        )
        RETURNING
          id,
          workflow_id,
          status
        `,
        [current.workflow_id]
      );

    const run = runResult.rows[0];

    const followingRunAt =
      calculateNextRunAt(
        config,
        nextRunAt
      );

    await client.query(
      `
      UPDATE workflow_triggers
      SET next_run_at = $1
      WHERE id = $2
      `,
      [
        followingRunAt,
        current.trigger_id,
      ]
    );

    await client.query("COMMIT");

    const finalStatus =
      await executeWorkflow({
        id: run.id,
        workflow_id: run.workflow_id,
        organization_id: current.org_id,
      });

    console.log(
      `Scheduled workflow ${current.workflow_id} executed: ${finalStatus}`
    );
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
    }

    console.error(
      `Scheduled trigger ${trigger.trigger_id} failed:`,
      error
    );
  } finally {
    client.release();
  }
}

function calculateNextRunAt(
  config: ScheduledTriggerConfig,
  from: Date
): Date {
  const scheduleType =
    config.schedule_type ?? "daily";

  if (scheduleType === "interval") {
    const minutes = Math.min(
      10080,
      Math.max(
        1,
        Number(
          config.interval_minutes ?? 15
        )
      )
    );

    return new Date(
      from.getTime() +
        minutes * 60 * 1000
    );
  }

  const timezone =
    config.timezone || "UTC";

  const time =
    normalizeTime(
      config.time ?? "09:00"
    );

  if (scheduleType === "weekly") {
    return calculateNextWeekly(
      from,
      time,
      Number(
        config.day_of_week ?? 1
      ),
      timezone
    );
  }

  return calculateNextDaily(
    from,
    time,
    timezone
  );
}

function calculateNextDaily(
  from: Date,
  time: string,
  timezone: string
): Date {
  const parts =
    getTimeZoneParts(
      from,
      timezone
    );

  let candidate =
    zonedDateTimeToUtc(
      parts.year,
      parts.month,
      parts.day,
      time,
      timezone
    );

  if (candidate <= from) {
    candidate =
      zonedDateTimeToUtc(
        parts.year,
        parts.month,
        parts.day + 1,
        time,
        timezone
      );
  }

  return candidate;
}

function calculateNextWeekly(
  from: Date,
  time: string,
  targetDay: number,
  timezone: string
): Date {
  const parts =
    getTimeZoneParts(
      from,
      timezone
    );

  const currentDay =
    getWeekday(
      parts.year,
      parts.month,
      parts.day
    );

  let daysAhead =
    (targetDay - currentDay + 7) % 7;

  let candidate =
    zonedDateTimeToUtc(
      parts.year,
      parts.month,
      parts.day + daysAhead,
      time,
      timezone
    );

  if (candidate <= from) {
    daysAhead =
      daysAhead === 0
        ? 7
        : daysAhead;

    candidate =
      zonedDateTimeToUtc(
        parts.year,
        parts.month,
        parts.day + daysAhead,
        time,
        timezone
      );
  }

  return candidate;
}

function normalizeTime(
  value: string
): string {
  const match =
    /^([01]\d|2[0-3]):([0-5]\d)$/.exec(
      value
    );

  return match
    ? `${match[1]}:${match[2]}`
    : "09:00";
}

function getTimeZoneParts(
  date: Date,
  timezone: string
): {
  year: number;
  month: number;
  day: number;
} {
  const formatter =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    );

  const parts =
    formatter.formatToParts(date);

  return {
    year: Number(
      parts.find(
        (part) =>
          part.type === "year"
      )?.value
    ),
    month: Number(
      parts.find(
        (part) =>
          part.type === "month"
      )?.value
    ),
    day: Number(
      parts.find(
        (part) =>
          part.type === "day"
      )?.value
    ),
  };
}

function getWeekday(
  year: number,
  month: number,
  day: number
): number {
  return new Date(
    Date.UTC(
      year,
      month - 1,
      day
    )
  ).getUTCDay();
}

function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  time: string,
  timezone: string
): Date {
  const [hours, minutes] =
    normalizeTime(time)
      .split(":")
      .map(Number);

  const naiveUtc =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
        hours,
        minutes,
        0,
        0
      )
    );

  const offset =
    getTimeZoneOffsetMs(
      naiveUtc,
      timezone
    );

  return new Date(
    naiveUtc.getTime() -
      offset
  );
}

function getTimeZoneOffsetMs(
  date: Date,
  timezone: string
): number {
  const formatter =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }
    );

  const parts =
    formatter.formatToParts(date);

  const values = {
    year: Number(
      parts.find(
        (part) =>
          part.type === "year"
      )?.value
    ),
    month: Number(
      parts.find(
        (part) =>
          part.type === "month"
      )?.value
    ),
    day: Number(
      parts.find(
        (part) =>
          part.type === "day"
      )?.value
    ),
    hour: Number(
      parts.find(
        (part) =>
          part.type === "hour"
      )?.value
    ),
    minute: Number(
      parts.find(
        (part) =>
          part.type === "minute"
      )?.value
    ),
    second: Number(
      parts.find(
        (part) =>
          part.type === "second"
      )?.value
    ),
  };

  const asUtc =
    Date.UTC(
      values.year,
      values.month - 1,
      values.day,
      values.hour,
      values.minute,
      values.second
    );

  return (
    asUtc - date.getTime()
  );
}