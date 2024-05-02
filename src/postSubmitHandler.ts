import {PostSubmit} from "@devvit/protos";
import {TriggerContext} from "@devvit/public-api";
import {POST_LIST} from "./constants.js";
import {scheduleNextAdhocRun} from "./lockPosts.js";

export async function handlePostSubmitEvent (event: PostSubmit, context: TriggerContext) {
    if (!event.post) {
        return;
    }

    await context.redis.zAdd(POST_LIST, {member: event.post.id, score: event.post.createdAt});
    console.log(`PostSubmit: Added post ${event.post.id} to list for future checking. CreatedAt: ${event.post.createdAt}`);

    await scheduleNextAdhocRun(context);
}
