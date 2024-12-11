# Data Visualization react/d3 PoC

This repo is created with Cursor.com. My goals was to experiment with Cursor and build a simple react/d3 app with some features for viewing and analyzing data with multiple visualizations on different pages.
I've tried to use cursor as much as possible to generate the code and NOT manually adjust the code. This would not be the way I would build a production app, but it was a fun experiment.

Some things I learned and noticed:
- Make regular commits to the repo so that cursor can continue to generate code and you can keep track of the changes. This is not different then normal coding.
- When a bug happens in the browser, copy&paste the console error to cursor and ask it to fix the code.
- Use github copilot to review the code and suggest improvements and input that back to cursor.
- I ran into problems when I wanted to add a webworker to the project. Cursor did this, but the worker was not working. I had to manually adjust the code to make it work... which was simply removing worker.terminate() from an unmount.
- In one scenario Cursor wanted to change the package.json file with wrong version of react.



## How to run

```bash
npm install
npm run dev
```

