import { JobContext, Post, ScheduledJob, ScheduledJobEvent, SettingsValues, SubredditInfo, TriggerContext } from "@devvit/public-api";
import { addDays, addHours, addMinutes, addMonths, addSeconds, addWeeks, differenceInSeconds, subMonths } from "date-fns";
import { AppSetting, TimeUnit } from "./settings.js";
import { POST_LIST, SchedulerJob } from "./constants.js";
import { max } from "lodash";
import { CronExpressionParser } from "cron-parser";
import { hasTriggerBeenHandled } from "@fsvreddit/fsv-devvit-helpers";
import { queueCommentToAdd } from "./commentQueue.js";
import { isUserModerator } from "./modCache.js";

export function lockTime (date: Date, lockDelay: number, lockDelayUnits: TimeUnit) {
    switch (lockDelayUnits) {
        case TimeUnit.Minutes:
            return addMinutes(date, lockDelay);
        case TimeUnit.Hours:
            return addHours(date, lockDelay);
        case TimeUnit.Days:
            return addDays(date, lockDelay);
        case TimeUnit.Weeks:
            return addWeeks(date, lockDelay);
        case TimeUnit.Months:
            return addMonths(date, lockDelay);
        default:
            throw new Error("Unhandled lock delay units");
    }
}

export type CheckForPostsToLockEventData = {
    source: "adhoc" | "scheduled";
    jobGuid?: string;
};

async function logRemoveAndReschedule (post: Post, message: string, context: JobContext) {
    console.log(`Post checker: ${post.id}: ${message}`);
    await context.redis.zRem(POST_LIST, [post.id]);
    await scheduleNextAdhocRun(context);
}

async function handlePost (post: Post, settings: SettingsValues, subInfo: SubredditInfo, context: JobContext): Promise<string> {
    console.log(`Post checker: Checking post ${post.id}, created ${post.createdAt.toISOString()}`);

    const subredditName = context.subredditName ?? await context.reddit.getCurrentSubredditName();

    if (subInfo.isArchivePostsEnabled && post.archived) {
        return "Post is archived";
    }

    if (post.removedByCategory === "deleted" || post.title.startsWith("[deleted")) {
        return "Post has been deleted.";
    }

    if (post.locked) {
        return "Post is already locked.";
    }

    if (settings[AppSetting.LockNSFWOnly] && !post.nsfw) {
        return "Post is not NSFW.";
    }

    if (settings[AppSetting.IgnoreMods] && await isUserModerator(post.authorName, context)) {
        return "Post author is a moderator.";
    }

    const usersToIgnore = settings[AppSetting.IgnoreUsers] as string | undefined;
    if (usersToIgnore) {
        const userList = new Set(usersToIgnore.split(",").map(userName => userName.toLowerCase().trim()));
        if (userList.has(post.authorName.toLowerCase())) {
            return "Post author is in the ignore list.";
        }
    }

    const postFlairToIgnore = settings[AppSetting.IgnorePostFlairText] as string | undefined;
    if (postFlairToIgnore) {
        const flairs = postFlairToIgnore.split(",").map(flair => flair.toLowerCase().trim());
        if (post.flair?.text && flairs.includes(post.flair.text.toLowerCase())) {
            return "Post flair text is in the ignore list.";
        }
    }

    const postFlairCSSClassToIgnore = settings[AppSetting.IgnorePostFlairCSSClass] as string | undefined;
    if (postFlairCSSClassToIgnore) {
        const flairs = postFlairCSSClassToIgnore.split(",").map(flair => flair.toLowerCase().trim());
        if (post.flair?.cssClass && flairs.includes(post.flair.cssClass.toLowerCase())) {
            return "Post flair CSS class is in the ignore list.";
        }
    }

    const postFlairTemplateToIgnore = settings[AppSetting.IgnorePostFlairTemplate] as string | undefined;
    if (postFlairTemplateToIgnore) {
        const postTemplates = postFlairTemplateToIgnore.split(",").map(template => template.toLowerCase().trim());
        if (post.flair?.templateId && postTemplates.includes(post.flair.templateId.toLowerCase())) {
            return "Post flair template ID is in the ignore list.";
        }
    }

    const userFlairToIgnore = settings[AppSetting.IgnoreUserFlairText] as string | undefined;
    if (userFlairToIgnore) {
        const flairList = userFlairToIgnore.split(",").map(flair => flair.toLowerCase().trim());
        if (post.authorFlair?.text && flairList.includes(post.authorFlair.text.toLowerCase())) {
            return "Post author's flair text is in the ignore list.";
        }
    }

    const userFlairCSSClassToIgnore = settings[AppSetting.IgnoreUserFlairCSSClass] as string | undefined;
    if (userFlairCSSClassToIgnore) {
        const flairList = userFlairCSSClassToIgnore.split(",").map(flair => flair.toLowerCase().trim());
        if (post.authorFlair?.cssClass && flairList.includes(post.authorFlair.cssClass.toLowerCase())) {
            return "Post author's flair CSS class is in the ignore list.";
        }
    }

    await post.lock();

    const outcomes = [
        "locked.",
    ];

    const flairTemplate = settings[AppSetting.LockedFlairTemplateId] as string | undefined;
    if (flairTemplate) {
        await context.reddit.setPostFlair({
            postId: post.id,
            subredditName,
            flairTemplateId: flairTemplate,
        });
        outcomes.push("flair has been set");
    }

    const commentToAdd = settings[AppSetting.AddCommentWhenLocking] as string | undefined;
    if (commentToAdd?.trim()) {
        await queueCommentToAdd({ postId: post.id, commentText: commentToAdd.trim() }, context);
        outcomes.push("comment has been queued");
    }

    return "Post handled: " + outcomes.join(", ");
}

export async function checkForPostsToLock (event: ScheduledJobEvent<CheckForPostsToLockEventData>, context: JobContext) {
    const jobGuid = event.data.jobGuid;
    if (jobGuid && await hasTriggerBeenHandled(context.redis, `job:${jobGuid}`, { expiration: addMinutes(new Date(), 5) })) {
        console.warn(`Post checker: Job with guid ${jobGuid} has already been handled. Skipping.`);
        return;
    }

    if (!jobGuid && await hasTriggerBeenHandled(context.redis, `job:${event.name}`, { expiration: addSeconds(new Date(), 5) })) {
        console.warn(`Post checker: Job with name ${event.name} has already been handled. Skipping.`);
        return;
    }

    const subredditName = context.subredditName ?? await context.reddit.getCurrentSubredditName();

    const subInfo = await context.reddit.getSubredditInfoByName(subredditName);
    if (subInfo.isArchivePostsEnabled) {
        const removed = await context.redis.zRemRangeByScore(POST_LIST, 0, subMonths(new Date(), 6).getTime());
        if (removed > 0) {
            console.log(`Post checker: Removed ${removed} archived posts from the list.`);
        }
    }

    console.log(`Post checker: Running job of type ${event.data.source}`);
    const settings = await context.settings.getAll();
    const lockDelay = settings[AppSetting.LockDelay] as number | undefined ?? 1;
    const lockDelayUnits = (settings[AppSetting.LockDelayUnits] as TimeUnit[] | undefined ?? [TimeUnit.Months])[0];

    const cutOffDate = lockTime(new Date(), -lockDelay, lockDelayUnits);

    const postsDueChecking = await context.redis.zRange(POST_LIST, 0, cutOffDate.getTime(), { by: "score" });
    if (postsDueChecking.length === 0) {
        console.log("Post checker: No posts are due a check.");
        await scheduleNextAdhocRun(context);
        return;
    }

    console.log(`Post checker: ${postsDueChecking.length} posts are due a check.`);

    const firstPost = postsDueChecking.shift();
    if (!firstPost) {
        console.error("Post checker: Lost the first post to check.");
        await scheduleNextAdhocRun(context);
        return;
    }

    const post = await context.reddit.getPostById(firstPost.member);

    try {
        const outcome = await handlePost(post, settings, subInfo, context);
        await logRemoveAndReschedule(post, outcome, context);
    } catch (error) {
        console.error(`Post checker: Error handling post ${post.id}:`, error);
        await logRemoveAndReschedule(post, "Error handling post.", context);
    }
}

export type RescheduleAdhocTasksEventData = {
    jobGuid?: string;
};

export async function rescheduleAdhocTasks (event: ScheduledJobEvent<RescheduleAdhocTasksEventData>, context: JobContext) {
    const jobGuid = event.data.jobGuid;
    if (jobGuid && await hasTriggerBeenHandled(context.redis, `job:${jobGuid}`, { expiration: addMinutes(new Date(), 5) })) {
        console.warn(`Task Rescheduler: Job with guid ${jobGuid} has already been handled. Skipping.`);
        return;
    }

    console.log("Settings Update: Settings have been updated. Requeuing jobs if needed.");
    const jobs = await context.scheduler.listJobs();

    const adhocJobs = jobs.filter(job => job.name === SchedulerJob.CheckForPostsToLock as string && job.data?.source === "adhoc");
    if (adhocJobs.length) {
        console.log("Settings Update: Cancelled adhoc jobs.");
        await Promise.all(adhocJobs.map(job => context.scheduler.cancelJob(job.id)));
    }

    const settings = await context.settings.getAll();
    if (settings[AppSetting.HandleHistoricalPosts]) {
        const redisKey = "historicalPostsQueued";
        const historicalPostsQueued = await context.redis.get(redisKey);
        if (!historicalPostsQueued) {
            console.log("Settings Update: Historical posts option enabled. Queueing most recent 1000 posts.");
            const subreddit = await context.reddit.getCurrentSubreddit();
            const posts = await context.reddit.getNewPosts({
                subredditName: subreddit.name,
                limit: 1000,
            }).all();
            const unlockedPosts = posts.filter(post => !post.locked);
            console.log(`Settings Update: Found ${unlockedPosts.length} posts to add to queue.`);
            await context.redis.zAdd(POST_LIST, ...unlockedPosts.map(post => ({ member: post.id, score: post.createdAt.getTime() })));
            await context.redis.set(redisKey, new Date().getTime().toString());
        }
    }

    await scheduleNextAdhocRun(context);
}

export async function scheduleNextAdhocRun (context: TriggerContext) {
    // Get the first post ordered by date ascending.
    const postsDueChecking = await context.redis.zRange(POST_LIST, 0, 0, { by: "rank" });
    if (postsDueChecking.length === 0) {
        console.log("Adhoc Scheduler: No posts in lock queue. No ad-hoc task is needed.");
        return;
    }

    // Is there already an ad-hoc scheduled job? If so, return.
    const jobs = await context.scheduler.listJobs();
    const adhocJob = jobs.filter(job => job.name === SchedulerJob.CheckForPostsToLock as string && "runAt" in job && job.data?.source === "adhoc") as ScheduledJob[];
    if (adhocJob.length > 0) {
        console.log(`Adhoc Scheduler: Ad-hoc task(s) scheduled, cancelling`);
        await Promise.all(adhocJob.map(job => context.scheduler.cancelJob(job.id)));
    }

    const settings = await context.settings.getAll();
    const lockDelay = settings[AppSetting.LockDelay] as number | undefined ?? 1;
    const lockDelayUnits = (settings[AppSetting.LockDelayUnits] as TimeUnit[] | undefined ?? [TimeUnit.Months])[0];

    // If next lock event is due in the past, use the current date/time otherwise use the lock time due from the first post in queue.
    const nextPostLockTime = lockTime(new Date(postsDueChecking[0].score), lockDelay, lockDelayUnits);
    const nextLockTime = max([new Date(), nextPostLockTime]);

    console.log(`Adhoc Scheduler: Next lock event due: ${nextLockTime.toISOString()} for post due at ${nextPostLockTime.toISOString()}`);

    const cron = await context.redis.get("cron");
    if (!cron) {
        // Should never happen, because this is set during install/upgrade.
        console.log("Adhoc Scheduler: Cron is not set in redis!");
        return;
    }

    const interval = CronExpressionParser.parse(cron);
    const nextScheduledRun = interval.next().toDate();
    console.log(`Adhoc Scheduler: Next scheduled job run: ${nextScheduledRun.toISOString()}`);

    if (nextLockTime > nextScheduledRun) {
        console.log("Adhoc Scheduler: Next scheduled run is before the next lock event. No ad-hoc task needed.");
        return;
    }

    if (differenceInSeconds(nextScheduledRun, nextLockTime) < 30) {
        // We don't need an ad-hoc run if the next scheduled run time is in the next 30 seconds.
        console.log("Adhoc Scheduler: Scheduled run is within the next 30 seconds of the next lock event. No ad-hoc task needed.");
        return;
    }

    // Run at the next lock time plus one second, or ten seconds from now, whichever is later.
    // This prevents rate limiting issues
    const nextAdhocRun = max([addSeconds(nextLockTime, 1), addSeconds(new Date(), 1)]);

    await context.scheduler.runJob<CheckForPostsToLockEventData>({
        data: { source: "adhoc", jobGuid: crypto.randomUUID() },
        runAt: nextAdhocRun,
        name: SchedulerJob.CheckForPostsToLock,
    });

    console.log(`Adhoc Scheduler: Ad-hoc job scheduled for ${nextAdhocRun.toISOString()}`);
}
