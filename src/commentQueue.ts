import { JobContext, ScheduledJobEvent } from "@devvit/public-api";
import { hasTriggerBeenHandled } from "@fsvreddit/fsv-devvit-helpers";
import { addMinutes, addSeconds } from "date-fns";
import { SchedulerJob } from "./constants.js";

const COMMENTS_TO_ADD_QUEUE_KEY = `CommentsToAddQueue`;

interface CommentToAdd {
    postId: string;
    commentText: string;
}

type CommentQueueJobData = {
    firstRun: boolean;
    jobGuid: string;
};

async function scheduleAdhocCommentQueueJob (firstRun: boolean, context: JobContext) {
    await context.scheduler.runJob<CommentQueueJobData>({
        name: SchedulerJob.ProcessCommentQueue,
        runAt: addSeconds(new Date(), 10),
        data: { firstRun, jobGuid: crypto.randomUUID() },
    });
}

export async function queueCommentToAdd (opts: CommentToAdd, context: JobContext) {
    await context.redis.hSet(COMMENTS_TO_ADD_QUEUE_KEY, { [opts.postId]: opts.commentText });

    if (await hasTriggerBeenHandled(context.redis, `queue:CommentsToAdd`, { expiration: addSeconds(new Date(), 10) })) {
        return;
    }

    await scheduleAdhocCommentQueueJob(true, context);
}

export async function processCommentQueue (event: ScheduledJobEvent<CommentQueueJobData>, context: JobContext) {
    if (await hasTriggerBeenHandled(context.redis, `job:${event.data.jobGuid}`, { expiration: addMinutes(new Date(), 10) })) {
        console.warn(`Comment Add: job ${event.data.jobGuid} has already been handled.`);
        return;
    }

    const inProgressKey = "commentQueueInProgress";
    if (event.data.firstRun && await context.redis.exists(inProgressKey)) {
        console.warn(`Comment Add: another instance is already in progress.`);
        return;
    }

    await context.redis.set(inProgressKey, Date.now().toString(), { expiration: addSeconds(new Date(), 30) });

    const commentQueue = await context.redis.hKeys(COMMENTS_TO_ADD_QUEUE_KEY);
    if (commentQueue.length === 0) {
        console.warn(`Comment Add: no comments in the queue.`);
        return;
    }

    const postId = commentQueue[0];

    const firstCommentEntry = await context.redis.hGet(COMMENTS_TO_ADD_QUEUE_KEY, postId);
    if (!firstCommentEntry) {
        // Impossible, but need to handle.
        await context.redis.hDel(COMMENTS_TO_ADD_QUEUE_KEY, [postId]);
        await scheduleAdhocCommentQueueJob(false, context);
        return;
    }

    const newComment = await context.reddit.submitComment({
        id: postId,
        text: firstCommentEntry.trim() + `\n\n*I am a bot, and this action was performed automatically. Please [contact the moderators of this subreddit](https://www.reddit.com/message/compose/?to=/r/${context.subredditName}) if you have any questions or concerns.*`,
    });

    await newComment.distinguish(true);

    await context.redis.hDel(COMMENTS_TO_ADD_QUEUE_KEY, [postId]);
    await scheduleAdhocCommentQueueJob(false, context);
}
