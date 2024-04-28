import {getCutoff} from "./lockPosts.js";
import {TimeUnit} from "./settings.js";

test("All time units handled", () => {
    const unhandledTimeUnits: string[] = [];

    for (const unit of Object.values(TimeUnit)) {
        try {
            getCutoff(1, unit);
        } catch {
            unhandledTimeUnits.push(unit);
        }
    }

    expect(unhandledTimeUnits).toEqual([]);
});
