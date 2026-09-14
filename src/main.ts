import { Devvit } from "@devvit/public-api";
import { appSettings } from "./settings.js";
import { handlePostSubmitEvent } from "./postSubmitHandler.js";
import { handleAppInstallOrUpgrade } from "./installEvents.js";
import { checkForPostsToLock, rescheduleAdhocTasks } from "./lockPosts.js";
import { SchedulerJob } from "./constants.js";
import { handleCommentSubmitEvent } from "./commentSubmitHandler.js";
import { processCommentQueue } from "./commentQueue.js";
import { handleModAction } from "./modCache.js";

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

Devvit.addTrigger({
    event: "ModAction",
    onEvent: handleModAction,
});

Devvit.addSchedulerJob({
    name: SchedulerJob.CheckForPostsToLock,
    onRun: checkForPostsToLock,
});

Devvit.addSchedulerJob({
    name: SchedulerJob.RescheduleAdhocTasks,
    onRun: rescheduleAdhocTasks,
});

Devvit.addSchedulerJob({
    name: SchedulerJob.ProcessCommentQueue,
    onRun: processCommentQueue,
});

Devvit.configure({
    redditAPI: true,
    redis: true,
});

export default Devvit;
