import {PostSubmit} from "@devvit/protos";
import {TriggerContext} from "@devvit/public-api";
import {POST_LIST} from "./constants.js";

export async function handlePostSubmitEvent (event: PostSubmit, context: TriggerContext) {
    if (event.post) {
        console.log(`Added post ${event.post.id} to list for future checking. CreatedAt: ${event.post.createdAt}`);
        await context.redis.zAdd(POST_LIST, {member: event.post.id, score: event.post.createdAt});
    }
}
