---
name: push-to-website
description: >-
  Use this skill to deploy the habit_tracker application to the user's personal website repo. Trigger this when the user asks to push, deploy, or copy the app to the website.
---

# Push to Website

When the user asks to push, deploy, or update the website with the latest `habit_tracker` code, follow these exact steps:

1. **Copy the code:** Run this exact command to mirror the current workspace into the website's docs folder:
   ```bash
   cp -r /Users/dome/apps/habit_tracker/* /Users/dome/apps/dombraccia.github.io/docs/habit_tracker/
   ```

2. **Commit the code on the website repo (Optional):** You can also run the following to automatically stage and commit the changes for the user:
   ```bash
   cd /Users/dome/apps/dombraccia.github.io
   git add docs/habit_tracker
   git commit -m "Deploy latest habit tracker updates"
   ```

3. **Prompt for GitHub Push:** Use the `ask_question` tool or ask the user directly if they would like you to push the updated website to GitHub. If they say yes, run `git push` in `~/apps/dombraccia.github.io`.

4. **Notify the User:** Let the user know the deployment copy (and push, if requested) was successful.
