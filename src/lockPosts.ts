import {Post, ScheduledJobEvent, TriggerContext, User, UserFlair} from "@devvit/public-api";
import {subDays, subHours, subMinutes, subMonths, subWeeks} from "date-fns";
import {AppSetting, TimeUnit} from "./settings.js";
import {POST_LIST} from "./constants.js";
import _ from "lodash";

export function getCutoff (lockDelay: number, lockDelayUnits: string) {
    switch (lockDelayUnits) {
        case "minutes":
            return subMinutes(new Date(), lockDelay);
        case "hours":
            return subHours(new Date(), lockDelay);
        case "days":
            return subDays(new Date(), lockDelay);
        case "weeks":
            return subWeeks(new Date(), lockDelay);
        case "months":
            return subMonths(new Date(), lockDelay);
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

export async function checkForPostsToLock (_event: ScheduledJobEvent, context: TriggerContext) {
    const settings = await context.settings.getAll();
    const lockDelay = settings[AppSetting.LockDelay] as number ?? 1;
    const lockDelayUnits = (settings[AppSetting.LockDelayUnits] as string[] ?? [TimeUnit.Months])[0];

    const cutOffDate = getCutoff(lockDelay, lockDelayUnits);

    // Get posts that need checking.
    const postsDueChecking = await context.redis.zRange(POST_LIST, 0, cutOffDate.getTime(), {by: "score"});
    if (postsDueChecking.length === 0) {
        console.log("No posts are due a check.");
        return;
    }

    let posts: Post[] = [];
    for (const item of postsDueChecking) {
        posts.push(await context.reddit.getPostById(item.member));
    }

    console.log(`${posts.length} posts need checking.`);

    // Filter out posts that are already locked.
    posts = posts.filter(post => !post.locked);
    console.log(`${posts.length} posts remain after excluding posts that are already locked.`);

    const subreddit = await context.reddit.getCurrentSubreddit();

    if (settings[AppSetting.IgnoreMods] as boolean) {
        const modList = await context.reddit.getModerators({subredditName: subreddit.name}).all();
        posts = posts.filter(post => post.authorName !== "AutoModerator" && !modList.some(mod => post.authorName === mod.username));
        console.log(`${posts.length} posts remain after excluding moderators.`);
    }

    const usersToIgnore = settings[AppSetting.IgnoreUsers] as string | undefined;
    if (posts.length && usersToIgnore) {
        const userList = usersToIgnore.split(",").map(userName => userName.toLowerCase().trim());
        posts = posts.filter(post => !userList.includes(post.authorName.toLowerCase()));
        console.log(`${posts.length} posts remain after excluding named users.`);
    }

    const postFlairToIgnore = settings[AppSetting.IgnorePostFlairText] as string | undefined;
    if (posts.length && postFlairToIgnore) {
        const flairs = postFlairToIgnore.split(",").map(flair => flair.toLowerCase().trim());
        posts = posts.filter(post => !post.flair || !post.flair.text || !flairs.includes(post.flair.text.toLowerCase()));
        console.log(`${posts.length} posts remain after excluding post flair text.`);
    }

    const postFlairCSSClassToIgnore = settings[AppSetting.IgnorePostFlairCSSClass] as string | undefined;
    if (posts.length && postFlairCSSClassToIgnore) {
        const flairs = postFlairCSSClassToIgnore.split(",").map(flair => flair.toLowerCase().trim());
        posts = posts.filter(post => !post.flair || !post.flair.cssClass || !flairs.includes(post.flair.cssClass.toLowerCase()));
        console.log(`${posts.length} posts remain after excluding post flair CSS class.`);
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
                console.log(`${posts.length} posts remain after excluding user flair text.`);
            }
        }

        if (posts.length && userFlairCSSClassToIgnore) {
            const flairList = userFlairCSSClassToIgnore.split(",").map(flair => flair.toLowerCase().trim());
            const usersWithMatchingFlair = userFlairs.filter(item => item.flair && item.flair.flairCssClass && flairList.includes(item.flair.flairCssClass.toLowerCase()));
            if (usersWithMatchingFlair.length) {
                posts = posts.filter(post => !usersWithMatchingFlair.some(user => user.username === post.authorName));
                console.log(`${posts.length} posts remain after excluding user flair CSS class.`);
            }
        }
    }

    if (posts.length) {
        for (const post of posts) {
            await post.lock();
        }
        console.log(`${posts.length} posts have been locked.`);
    }

    await context.redis.zRem(POST_LIST, postsDueChecking.map(item => item.member));
}
