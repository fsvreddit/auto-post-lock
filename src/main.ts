import { Devvit } from "@devvit/public-api";
import { appSettings } from "./settings.js";
import { handlePostSubmitEvent } from "./postSubmitHandler.js";
import { handleAppInstallOrUpgrade } from "./installEvents.js";
import { checkForPostsToLock, rescheduleAdhocTasks } from "./lockPosts.js";
import { CHECK_FOR_POSTS_TO_LOCK_JOB, RESCHEDULE_ADHOC_TASKS_JOB } from "./constants.js";
import { handleCommentSubmitEvent } from "./commentSubmitHandler.js";

Devvit.addSettings(appSettings);

Devvit.addTrigger({
    events: ["AppInstall", "AppUpgrade"],
    onEvent: handleAppInstallOrUpgrade,
});

Devvit.addTrigger({
    event: "PostSubmit",
    onEvent: handlePostSubmitEvent,
});

Devvit.addTrigger({
    event: "CommentSubmit",
    onEvent: handleCommentSubmitEvent,
});

Devvit.addSchedulerJob({
    name: CHECK_FOR_POSTS_TO_LOCK_JOB,
    onRun: checkForPostsToLock,
});

Devvit.addSchedulerJob({
    name: RESCHEDULE_ADHOC_TASKS_JOB,
    onRun: rescheduleAdhocTasks,
});

Devvit.configure({
    redditAPI: true,
    redis: true,
});

export default Devvit;
