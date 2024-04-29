import {TriggerContext} from "@devvit/public-api";
import {AppInstall, AppUpgrade} from "@devvit/protos";

export async function handleAppInstallOrUpgrade (_: AppInstall | AppUpgrade, context: TriggerContext) {
    // Clear down existing scheduler jobs, if any, in case a new release changes the schedule
    const currentJobs = await context.scheduler.listJobs();
    await Promise.all(currentJobs.map(job => context.scheduler.cancelJob(job.id)));

    // Choose a randomised schedule per install. Run every 5 minutes but not all running at the same time.
    const minute = Math.floor(Math.random() * 5);

    await context.scheduler.runJob({
        cron: `${minute}/5 * * * *`,
        name: "checkForPostsToLock",
    });
}
