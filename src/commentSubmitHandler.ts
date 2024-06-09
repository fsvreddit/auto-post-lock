import {CommentSubmit} from "@devvit/protos";
import {TriggerContext} from "@devvit/public-api";
import {AppSetting} from "./settings.js";
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
    const lockDelayUnits = settings[AppSetting.LockDelayUnits] as string | undefined;

    if (!lockDelay || !lockDelayUnits) {
        return;
    }

    const lockTimeThreshold = lockTime(new Date(), -lockDelay, lockDelayUnits);

    if (new Date(event.post.createdAt) < lockTimeThreshold) {
        return;
    }

    console.log(`CommentSubmit: Post ${event.post.id} was created before the lock threshold. Locking post.`);
    const post = await context.reddit.getPostById(event.post.id);
    await post.lock();
}
