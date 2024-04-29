An app that allows you to lock a post automatically after a specified period of time.

You can specify the lock time period in minutes, hours, days, weeks or months. Once a post has been up for longer than that period of time, it will be locked unless one of the exclusion options exempts the post.

The app checks for and locks posts every 5 minutes, so the lock time may be up to 5 minutes after the period configured in the app.

This app will only act on posts created after the app is installed. Older posts will not be checked, nor will posts that at one point were within the time cutoff to lock, but were excluded from locking by other factors.

You can exclude posts from auto-locking by name, user flair or post flair. These checks are not case sensitive but they will only match the entire username, flair text or flair CSS class.

Finally, you can optionally choose to set a flair using its flair template ID at the point of locking a post.

This app is open source. You can find the code on Github [here](https://github.com/fsvreddit/auto-post-lock).
