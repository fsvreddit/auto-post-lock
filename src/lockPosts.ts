import {Post, ScheduledJobEvent, TriggerContext, User, UserFlair} from "@devvit/public-api";
import {addDays, addHours, addMinutes, addMonths, addSeconds, addWeeks, differenceInSeconds} from "date-fns";
import {AppSetting, TimeUnit} from "./settings.js";
import {POST_LIST} from "./constants.js";
import _ from "lodash";
import {parseExpression} from "cron-parser";

export function lockTime (date: Date, lockDelay: number, lockDelayUnits: string) {
    switch (lockDelayUnits) {
        case "minutes":
            return addMinutes(date, lockDelay);
        case "hours":
            return addHours(date, lockDelay);
        case "days":
            return addDays(date, lockDelay);
        case "weeks":
            return addWeeks(date, lockDelay);
        case "months":
            return addMonths(date, lockDelay);
        default:
            throw new Error("Unhandled lock delay units");
    }
}

interface UserAndFlair {
    username: string,
    flair?: UserFlair,
}

async function getUserFlair (user: User, subredditName: string): Promise<UserAndFlair> {
    const userFlair = await user.getUserFlairBySubreddit(subredditName);
    return {
        username: user.username,
        flair: userFlair,
    };
}

async function getUserOrUndefined (username: string, context: TriggerContext): Promise<User | undefined> {
    try {
        return await context.reddit.getUserByUsername(username);
    } catch {
        // Deleted, shadowbanned or suspended user. Return undefined.
    }
}

export async function checkForPostsToLock (event: ScheduledJobEvent, context: TriggerContext) {
    console.log(`Post checker: Running job of type ${event.data?.source as string | undefined ?? "unknown"}`);
    const settings = await context.settings.getAll();
    const lockDelay = settings[AppSetting.LockDelay] as number ?? 1;
    const lockDelayUnits = (settings[AppSetting.LockDelayUnits] as string[] ?? [TimeUnit.Months])[0];

    const cutOffDate = lockTime(new Date(), -lockDelay, lockDelayUnits);

    // Get posts that need checking.
    const postsDueChecking = await context.redis.zRange(POST_LIST, 0, cutOffDate.getTime(), {by: "score"});
    if (postsDueChecking.length === 0) {
        console.log("Post checker: No posts are due a check.");
        await scheduleNextAdhocRun(context);
        return;
    }

    let posts: Post[] = [];
    for (const item of postsDueChecking) {
        const post = await context.reddit.getPostById(item.member);
        if (!post.locked) {
            posts.push(post);
        }
    }

    console.log(`Post checker: ${posts.length} posts need checking.`);

    const subreddit = await context.reddit.getCurrentSubreddit();

    if (posts.length && settings[AppSetting.IgnoreMods] as boolean) {
        const modList = await context.reddit.getModerators({subredditName: subreddit.name}).all();
        posts = posts.filter(post => post.authorName !== "AutoModerator" && !modList.some(mod => post.authorName === mod.username));
        console.log(`Post checker: ${posts.length} posts remain after excluding moderators.`);
    }

    const usersToIgnore = settings[AppSetting.IgnoreUsers] as string | undefined;
    if (posts.length && usersToIgnore) {
        const userList = usersToIgnore.split(",").map(userName => userName.toLowerCase().trim());
        posts = posts.filter(post => !userList.includes(post.authorName.toLowerCase()));
        console.log(`Post checker: ${posts.length} posts remain after excluding named users.`);
    }

    const postFlairToIgnore = settings[AppSetting.IgnorePostFlairText] as string | undefined;
    if (posts.length && postFlairToIgnore) {
        const flairs = postFlairToIgnore.split(",").map(flair => flair.toLowerCase().trim());
        posts = posts.filter(post => !post.flair || !post.flair.text || !flairs.includes(post.flair.text.toLowerCase()));
        console.log(`Post checker: ${posts.length} posts remain after excluding post flair text.`);
    }

    const postFlairCSSClassToIgnore = settings[AppSetting.IgnorePostFlairCSSClass] as string | undefined;
    if (posts.length && postFlairCSSClassToIgnore) {
        const flairs = postFlairCSSClassToIgnore.split(",").map(flair => flair.toLowerCase().trim());
        posts = posts.filter(post => !post.flair || !post.flair.cssClass || !flairs.includes(post.flair.cssClass.toLowerCase()));
        console.log(`Post checker: ${posts.length} posts remain after excluding post flair CSS class.`);
    }

    const postFlairTemplateToIgnore = settings[AppSetting.IgnorePostFlairTemplate] as string | undefined;
    if (posts.length && postFlairTemplateToIgnore) {
        const postTemplates = postFlairTemplateToIgnore.split(",").map(template => template.toLowerCase().trim());
        posts = posts.filter(post => !post.flair || !post.flair.templateId || !postTemplates.includes(post.flair.templateId.toLowerCase()));
        console.log(`Post checker: ${posts.length} posts remain after excluding post flair template IDs.`);
    }

    const userFlairToIgnore = settings[AppSetting.IgnoreUserFlairText] as string | undefined;
    const userFlairCSSClassToIgnore = settings[AppSetting.IgnoreUserFlairCSSClass] as string | undefined;
    if (posts.length && (userFlairToIgnore || userFlairCSSClassToIgnore)) {
        const distinctUsers: User[] = [];
        for (const username of _.uniq(posts.map(post => post.authorName).filter(user => user !== "[deleted]"))) {
            const user = await getUserOrUndefined(username, context);
            if (user) {
                distinctUsers.push(user);
            }
        }

        const userFlairs: UserAndFlair[] = [];
        for (const user of distinctUsers) {
            userFlairs.push(await getUserFlair(user, subreddit.name));
        }

        if (userFlairToIgnore) {
            const flairList = userFlairToIgnore.split(",").map(flair => flair.toLowerCase().trim());
            const usersWithMatchingFlair = userFlairs.filter(item => item.flair && item.flair.flairText && flairList.includes(item.flair.flairText.toLowerCase()));
            if (usersWithMatchingFlair.length) {
                posts = posts.filter(post => !usersWithMatchingFlair.some(user => user.username === post.authorName));
                console.log(`Post checker: ${posts.length} posts remain after excluding user flair text.`);
            }
        }

        if (posts.length && userFlairCSSClassToIgnore) {
            const flairList = userFlairCSSClassToIgnore.split(",").map(flair => flair.toLowerCase().trim());
            const usersWithMatchingFlair = userFlairs.filter(item => item.flair && item.flair.flairCssClass && flairList.includes(item.flair.flairCssClass.toLowerCase()));
            if (usersWithMatchingFlair.length) {
                posts = posts.filter(post => !usersWithMatchingFlair.some(user => user.username === post.authorName));
                console.log(`Post checker: ${posts.length} posts remain after excluding user flair CSS class.`);
            }
        }
    }

    if (posts.length) {
        const flairTemplate = settings[AppSetting.LockedFlairTemplateId] as string | undefined;

        for (const post of posts) {
            await post.lock();
            if (flairTemplate) {
                await context.reddit.setPostFlair({
                    postId: post.id,
                    subredditName: subreddit.name,
                    flairTemplateId: flairTemplate,
                });
            }
        }
        console.log(`Post checker: ${posts.length} posts have been locked.`);
    }

    await context.redis.zRem(POST_LIST, postsDueChecking.map(item => item.member));
    await scheduleNextAdhocRun(context);
}

export async function rescheduleAdhocTasks (_: ScheduledJobEvent, context: TriggerContext) {
    const jobs = await context.scheduler.listJobs();

    const adhocJobs = jobs.filter(job => job.name === "checkForPostsToLock" && job.data?.source === "adhoc");
    if (adhocJobs.length) {
        console.log("Settings Update: Cancelled adhoc jobs.");
        await Promise.all(adhocJobs.map(job => context.scheduler.cancelJob(job.id)));
    }
    await scheduleNextAdhocRun(context);
}

export async function scheduleNextAdhocRun (context: TriggerContext) {
    // Get the first post ordered by date ascending.
    const postsDueChecking = await context.redis.zRange(POST_LIST, 0, 0, {by: "rank"});
    if (postsDueChecking.length === 0) {
        console.log("Adhoc Scheduler: No posts in lock queue. No ad-hoc task is needed.");
        return;
    }

    // Is there already an ad-hoc scheduled job? If so, return.
    const jobs = await context.scheduler.listJobs();
    if (jobs.some(job => job.name === "checkForPostsToLock" && job.data?.source === "adhoc")) {
        console.log("Adhoc Scheduler: There is already an ad-hoc task scheduled.");
        return;
    }

    const settings = await context.settings.getAll();
    const lockDelay = settings[AppSetting.LockDelay] as number ?? 1;
    const lockDelayUnits = (settings[AppSetting.LockDelayUnits] as string[] ?? [TimeUnit.Months])[0];

    // If next lock event is due in the past, use the current date/time otherwise use the lock time due from the first post in queue.
    const nextLockTime = _.max([new Date(), lockTime(new Date(postsDueChecking[0].score), lockDelay, lockDelayUnits)]) ?? new Date();

    console.log(`Adhoc Scheduler: Next lock event due: ${nextLockTime.toISOString()}`);

    const cron = await context.redis.get("cron");
    if (!cron) {
        // Should never happen, because this is set during install/upgrade.
        console.log("Adhoc Scheduler: Cron is not set in redis!");
        return;
    }

    const interval = parseExpression(cron);
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

    const nextAdhocRun = addSeconds(nextLockTime, 1);

    await context.scheduler.runJob({
        data: {source: "adhoc"},
        runAt: nextAdhocRun,
        name: "checkForPostsToLock",
    });

    console.log(`Adhoc Scheduler: Ad-hoc job scheduled for ${nextAdhocRun.toISOString()}`);
}

