import {Devvit} from "@devvit/public-api";
import {appSettings} from "./settings.js";
import {handlePostSubmitEvent} from "./postSubmitHandler.js";
import {handleAppInstallOrUpgrade} from "./installEvents.js";
import {checkForPostsToLock, rescheduleAdhocTasks} from "./lockPosts.js";

Devvit.addSettings(appSettings);

Devvit.addTrigger({
    events: ["AppInstall", "AppUpgrade"],
    onEvent: handleAppInstallOrUpgrade,
});

Devvit.addTrigger({
    event: "PostSubmit",
    onEvent: handlePostSubmitEvent,
});

Devvit.addSchedulerJob({
    name: "checkForPostsToLock",
    onRun: checkForPostsToLock,
});

Devvit.addSchedulerJob({
    name: "rescheduleAdhocTasks",
    onRun: rescheduleAdhocTasks,
});

Devvit.configure({
    redditAPI: true,
    redis: true,
});

export default Devvit;
