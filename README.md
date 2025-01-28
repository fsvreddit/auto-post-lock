An app that allows you to lock a post automatically after a specified period of time.

You can specify the lock time period in minutes, hours, days, weeks or months. Once a post has been up for longer than that period of time, it will be locked unless one of the exclusion options exempts the post.

This app will only act on posts created after the app is installed. Older posts will not be checked, nor will posts that at one point were within the time cutoff to lock, but were excluded from locking by other factors such as post or user flair.

You can exclude posts from auto-locking by name, user flair or post flair. These checks are not case sensitive but they will only match the entire username, flair text or flair CSS class.

Finally, you can optionally choose to set a flair using its flair template ID at the point of locking a post.

This app is open source. You can find the code on Github [here](https://github.com/fsvreddit/auto-post-lock).

## Update History

v1.2.3: No user facing changes, updates to dependencies to fix security vulnerabilities and use latest Dev Platform libraries only.

v1.2.2: Add function to lock old posts when comments are made on them

v1.1: Posts are now locked as soon as possible after the lock time period has elapsed. v1 could have up to five minutes delay before locking.
