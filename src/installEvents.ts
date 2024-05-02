import {TriggerContext} from "@devvit/public-api";
import {AppInstall, AppUpgrade} from "@devvit/protos";
import {scheduleNextAdhocRun} from "./lockPosts.js";
import {parseExpression} from "cron-parser";

export async function handleAppInstallOrUpgrade (_: AppInstall | AppUpgrade, context: TriggerContext) {
    // Clear down existing scheduler jobs, if any, in case a new release changes the schedule
    const currentJobs = await context.scheduler.listJobs();
    await Promise.all(currentJobs.map(job => context.scheduler.cancelJob(job.id)));

    // Choose a randomised schedule per install. Run every 20 minutes but not all installs running at the same time.
    const minute = Math.floor(Math.random() * 20);
    const cron = `${minute}/20 * * * *`;
    await context.redis.set("cron", cron);

    await context.scheduler.runJob({
        cron,
        name: "checkForPostsToLock",
    });

    const interval = parseExpression(cron);
    const nextScheduledRun = interval.next().toDate();
    console.log(`Install or Upgrade: Next scheduled job run: ${nextScheduledRun.toISOString()}`);

    await scheduleNextAdhocRun(context);
}
