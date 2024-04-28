import {SettingsFormField, SettingsFormFieldValidatorEvent} from "@devvit/public-api";

export enum AppSetting {
    LockDelay = "lockDelay",
    LockDelayUnits = "lockDelayUnits",
    IgnoreMods = "ignoreMods",
    IgnoreUsers = "ignoreUsers",
    IgnoreUserFlairText = "ignoreUserFlairText",
    IgnoreUserFlairCSSClass = "ignoreUserFlairCSSClass",
    IgnorePostFlairText = "ignorePostFlairText",
    IgnorePostFlairCSSClass = "ignorePostFlairCSSClass",
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

export const appSettings: SettingsFormField[] = [
    {
        name: AppSetting.LockDelay,
        type: "number",
        label: "Lock delay",
        defaultValue: 1,
        onValidate: ({value}) => {
            if (value && value < 1) {
                return "Value must be at least 1";
            }
        },
    },
    {
        name: AppSetting.LockDelayUnits,
        type: "select",
        label: "Lock delay units",
        options: Object.entries(TimeUnit).map(entry => ({label: entry[0], value: entry[1]})),
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
        helpText: "Optional. A comma-separated list of user flair text that won't have posts auto-locked",
    },
    {
        name: AppSetting.IgnorePostFlairCSSClass,
        type: "string",
        label: "Ignore posts with one of these flair CSS classes",
        helpText: "Optional. A comma-separated list of user flair CSS classes that won't have posts auto-locked",
    },
];
