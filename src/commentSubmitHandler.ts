import {CommentSubmit} from "@devvit/protos";
import {TriggerContext, User} from "@devvit/public-api";
import {AppSetting, TimeUnit} from "./settings.js";
import {lockTime} from "./lockPosts.js";

export async function handleCommentSubmitEvent (event: CommentSubmit, context: TriggerContext) {
    if (!event.post) {
        return;
    }

    const settings = await context.settings.getAll();
    if (!settings[AppSetting.LockPostsWhenCommentMade]) {
        return;
    }

    const lockDelay = settings[AppSetting.LockDelay] as number | undefined;
    const lockDelayUnits = (settings[AppSetting.LockDelayUnits] as TimeUnit[] ?? [TimeUnit.Months])[0];

    if (!lockDelay || !lockDelayUnits) {
        return;
    }

    const lockTimeThreshold = lockTime(new Date(), -lockDelay, lockDelayUnits);

    if (new Date(event.post.createdAt) > lockTimeThreshold) {
        return;
    }

    const post = await context.reddit.getPostById(event.post.id);

    if (settings[AppSetting.IgnoreMods]) {
        const modList = await context.reddit.getModerators({subredditName: post.subredditName}).all();
        if (post.authorName === "AutoModerator" || modList.some(mod => post.authorName === mod.username)) {
            console.log("CommentSubmit: Post was created by a moderator so will not be locked.");
            return;
        }
    }

    const usersToIgnore = settings[AppSetting.IgnoreUsers] as string | undefined;
    if (usersToIgnore) {
        const userList = usersToIgnore.split(",").map(userName => userName.toLowerCase().trim());
        if (userList.includes(post.authorName.toLowerCase())) {
            console.log("CommentSubmit: Post was created by a named ignored user, so will not be locked");
            return;
        }
    }

    const postFlairToIgnore = settings[AppSetting.IgnorePostFlairText] as string | undefined;
    if (postFlairToIgnore) {
        const flairs = postFlairToIgnore.split(",").map(flair => flair.toLowerCase().trim());
        if (post.flair?.text && flairs.includes(post.flair.text.toLowerCase())) {
            console.log("CommentSubmit: Post has a matching flair to ignore, so will not be locked.");
            return;
        }
    }

    const postFlairCSSClassToIgnore = settings[AppSetting.IgnorePostFlairCSSClass] as string | undefined;
    if (postFlairCSSClassToIgnore) {
        const flairs = postFlairCSSClassToIgnore.split(",").map(flair => flair.toLowerCase().trim());
        if (post.flair?.cssClass && flairs.includes(post.flair.cssClass.toLowerCase())) {
            console.log("CommentSubmit: Post has a matching flair CSS class to ignore, so will not be locked.");
            return;
        }
    }

    const postFlairTemplateToIgnore = settings[AppSetting.IgnorePostFlairTemplate] as string | undefined;
    if (postFlairTemplateToIgnore) {
        const postTemplates = postFlairTemplateToIgnore.split(",").map(template => template.toLowerCase().trim());
        if (post.flair?.templateId && postTemplates.includes(post.flair.templateId.toLowerCase())) {
            console.log("CommentSubmit: Post has a matching flair template to ignore, so will not be locked.");
            return;
        }
    }

    const userFlairToIgnore = settings[AppSetting.IgnoreUserFlairText] as string | undefined;
    const userFlairCSSClassToIgnore = settings[AppSetting.IgnoreUserFlairCSSClass] as string | undefined;
    if (userFlairToIgnore || userFlairCSSClassToIgnore) {
        let user: User | undefined;
        try {
            user = await context.reddit.getUserByUsername(post.authorName);
        } catch {
            //
        }

        if (user) {
            const userFlair = await user.getUserFlairBySubreddit(post.subredditName);

            if (userFlair && userFlairToIgnore) {
                const flairList = userFlairToIgnore.split(",").map(flair => flair.toLowerCase().trim());
                if (userFlair.flairText && flairList.includes(userFlair.flairText.toLowerCase())) {
                    console.log("CommentSubmit: User has an exempted flair, so post will not be locked.");
                    return;
                }
            }

            if (userFlair && userFlairCSSClassToIgnore) {
                const flairList = userFlairCSSClassToIgnore.split(",").map(flair => flair.toLowerCase().trim());
                if (userFlair.flairCssClass && flairList.includes(userFlair.flairCssClass.toLowerCase())) {
                    console.log("CommentSubmit: User has an exempted flair CSS class, so post will not be locked.");
                    return;
                }
            }
        }
    }

    if (!post.stickied && !post.locked) {
        console.log(`CommentSubmit: Post ${event.post.id} was created before the lock threshold. Locking post.`);
        await post.lock();
    }
}
