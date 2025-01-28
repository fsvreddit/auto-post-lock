import { TriggerContext } from "@devvit/public-api";
import { AppInstall, AppUpgrade } from "@devvit/protos";
import { scheduleNextAdhocRun } from "./lockPosts.js";
import { parseExpression } from "cron-parser";
import { CHECK_FOR_POSTS_TO_LOCK_JOB } from "./constants.js";

export async function handleAppInstallOrUpgrade (_: AppInstall | AppUpgrade, context: TriggerContext) {
    // Clear down existing scheduler jobs, if any, in case a new release changes the schedule
    const currentJobs = await context.scheduler.listJobs();
    await Promise.all(currentJobs.map(job => context.scheduler.cancelJob(job.id)));

    // Choose a randomised schedule per install. Run once a day.
    const minute = Math.floor(Math.random() * 60);
    const hour = Math.floor(Math.random() * 24);
    const cron = `${minute} ${hour} * * *`;
    await context.redis.set("cron", cron);

    await context.scheduler.runJob({
        data: { source: "scheduled" },
        cron,
        name: CHECK_FOR_POSTS_TO_LOCK_JOB,
    });

    const interval = parseExpression(cron);
    const nextScheduledRun = interval.next().toDate();
    console.log(`Install or Upgrade: Next scheduled job run: ${nextScheduledRun.toISOString()}`);

    await scheduleNextAdhocRun(context);
}
