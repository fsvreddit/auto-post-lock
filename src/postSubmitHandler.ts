import { PostSubmit } from "@devvit/protos";
import { TriggerContext } from "@devvit/public-api";
import { POST_LIST } from "./constants.js";
import { scheduleNextAdhocRun } from "./lockPosts.js";
import { hasTriggerBeenHandled } from "@fsvreddit/fsv-devvit-helpers";

export async function handlePostSubmitEvent (event: PostSubmit, context: TriggerContext) {
    if (!event.post) {
        return;
    }

    if (await hasTriggerBeenHandled(context.redis, event.post.id)) {
        console.warn(`PostSubmit: Post submit event for ${event.post.id} has already been handled, so skipping.`);
        return;
    }

    await context.redis.zAdd(POST_LIST, { member: event.post.id, score: event.post.createdAt });
    console.log(`PostSubmit: Added post ${event.post.id} to list for future checking. CreatedAt: ${event.post.createdAt}`);

    await scheduleNextAdhocRun(context);
}
