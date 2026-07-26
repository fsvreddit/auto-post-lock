import { Devvit } from "@devvit/public-api";
import { appSettings } from "./settings.js";
import { handlePostSubmitEvent } from "./postSubmitHandler.js";
import { handleAppInstallOrUpgrade } from "./installEvents.js";
import { checkForPostsToLock, rescheduleAdhocTasks } from "./lockPosts.js";
import { SchedulerJob } from "./constants.js";
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
    name: SchedulerJob.CheckForPostsToLock,
    onRun: checkForPostsToLock,
});

Devvit.addSchedulerJob({
    name: SchedulerJob.RescheduleAdhocTasks,
    onRun: rescheduleAdhocTasks,
});

Devvit.configure({
    redditAPI: true,
    redis: true,
});

export default Devvit;
