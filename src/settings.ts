import {SettingsFormField, SettingsFormFieldValidatorEvent} from "@devvit/public-api";
import {addSeconds} from "date-fns";
import {RESCHEDULE_ADHOC_TASKS_JOB} from "./constants.js";

export enum AppSetting {
    LockDelay = "lockDelay",
    LockDelayUnits = "lockDelayUnits",
    IgnoreMods = "ignoreMods",
    IgnoreUsers = "ignoreUsers",
    IgnoreUserFlairText = "ignoreUserFlairText",
    IgnoreUserFlairCSSClass = "ignoreUserFlairCSSClass",
    IgnorePostFlairText = "ignorePostFlairText",
    IgnorePostFlairCSSClass = "ignorePostFlairCSSClass",
    IgnorePostFlairTemplate = "ignorePostFlairTemplate",
    LockedFlairTemplateId = "lockedFlairTemplateId",
    HandleHistoricalPosts = "handleHistoricalPosts",
    LockPostsWhenCommentMade = "lockPostsWhenCommentMade",
}

export enum TimeUnit {
    Minutes = "minutes",
    Hours = "hours",
    Days = "days",
    Weeks = "weeks",
    Months = "months",
}

function selectFieldHasOptionChosen (event: SettingsFormFieldValidatorEvent<string[]>): void | string {
    if (!event.value || event.value.length !== 1) {
        return "You must choose an option";
    }
}

const flairTemplateRegex = /^[0-9a-z]{8}(?:-[0-9a-z]{4}){4}[0-9a-z]{8}$/;

export const appSettings: SettingsFormField[] = [
    {
        name: AppSetting.LockDelay,
        type: "number",
        label: "Lock delay",
        defaultValue: 1,
        onValidate: async ({value}, context) => {
            if (value && value < 1) {
                return "Value must be at least 1";
            }

            // Schedule may have changed, so reschedule next ad-hoc run.
            await context.scheduler.runJob({
                runAt: addSeconds(new Date(), 5),
                name: RESCHEDULE_ADHOC_TASKS_JOB,
            });
        },
    },
    {
        name: AppSetting.LockDelayUnits,
        type: "select",
        label: "Lock delay units",
        options: Object.entries(TimeUnit).map(([label, value]) => ({label, value})),
        defaultValue: [TimeUnit.Months],
        onValidate: selectFieldHasOptionChosen,
    },
    {
        name: AppSetting.IgnoreMods,
        type: "boolean",
        label: "Ignore posts from moderators",
        defaultValue: true,
    },
    {
        name: AppSetting.IgnoreUsers,
        type: "string",
        label: "Ignore these users",
        helpText: "Optional. A comma-separated list of users who won't have posts auto-locked",
    },
    {
        name: AppSetting.IgnoreUserFlairText,
        type: "string",
        label: "Ignore users with one of these flairs",
        helpText: "Optional. A comma-separated list of user flair text that won't have posts auto-locked",
    },
    {
        name: AppSetting.IgnoreUserFlairCSSClass,
        type: "string",
        label: "Ignore users with one of these flair CSS classes",
        helpText: "Optional. A comma-separated list of user flair CSS classes that won't have posts auto-locked",
    },
    {
        name: AppSetting.IgnorePostFlairText,
        type: "string",
        label: "Ignore posts with one of these flairs",
        helpText: "Optional. A comma-separated list of post flair text that won't have posts auto-locked",
    },
    {
        name: AppSetting.IgnorePostFlairCSSClass,
        type: "string",
        label: "Ignore posts with one of these flair CSS classes",
        helpText: "Optional. A comma-separated list of post flair CSS classes that won't have posts auto-locked",
    },
    {
        name: AppSetting.IgnorePostFlairTemplate,
        type: "string",
        label: "Ignore posts with one of these flair template IDs",
        helpText: "Optional. A comma-separated list of post flair template IDs that won't have posts auto-locked",
        onValidate: ({value}) => {
            if (!value) {
                return;
            }
            const templates = value.split(",").map(template => template.toLowerCase().trim());
            const invalidTemplate = templates.find(template => !template.match(flairTemplateRegex));
            if (invalidTemplate) {
                return `Flair template ${invalidTemplate} is not a valid flair template ID`;
            }
        },
    },
    {
        name: AppSetting.LockedFlairTemplateId,
        type: "string",
        label: "Set flair on posts when locking posts",
        helpText: "Optional. A flair template ID to set when locking posts.",
        onValidate: ({value}) => {
            if (value && !value.match(flairTemplateRegex)) {
                return `Flair template ${value} is not a valid flair template ID`;
            }
        },
    },
    {
        name: AppSetting.HandleHistoricalPosts,
        type: "boolean",
        label: "Lock posts made before app install",
        helpText: "If enabled, the app will do a one-time look back on the most recent 1000 posts in the subreddit and lock those.",
        defaultValue: false,
    },
    {
        name: AppSetting.LockPostsWhenCommentMade,
        type: "boolean",
        label: "Lock posts when a comment is made on an unlocked old post",
        helpText: "If enabled, the app will lock posts when a comment is made on them, for posts that are older than the most recent 1000",
        defaultValue: false,
    },
];
