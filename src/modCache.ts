import { ModAction } from "@devvit/protos";
import { JobContext, TriggerContext } from "@devvit/public-api";

const MOD_CACHE_KEY = "ModCache";

async function cacheAndReturnModerators (context: JobContext | TriggerContext): Promise<Set<string>> {
    const modResult = await context.reddit.getModerators({
        subredditName: context.subredditName ?? await context.reddit.getCurrentSubredditName(),
        limit: 1000,
    }).all();

    const mods = new Set(modResult.map(mod => mod.username));
    if (!mods.has("AutoModerator")) {
        mods.add("AutoModerator");
    }

    await context.redis.set(MOD_CACHE_KEY, JSON.stringify(Array.from(mods)));
    return mods;
}

export async function isUserModerator (username: string, context: JobContext) {
    const cachedMods = await context.redis.get(MOD_CACHE_KEY);
    if (cachedMods) {
        const modList = new Set(JSON.parse(cachedMods) as string[]);
        return modList.has(username);
    }

    const knownMods = await cacheAndReturnModerators(context);
    return knownMods.has(username);
}

export async function handleModAction (event: ModAction, context: TriggerContext) {
    if (event.action?.includes("moderator")) {
        await context.redis.del(MOD_CACHE_KEY);
    }
}
