# Data Visualization react/d3 PoC

This repo is created with Cursor.com. My goals was to experiment with Cursor and build a simple react/d3 app with some features for viewing and analyzing data with multiple visualizations on different pages.
I've tried to use cursor as much as possible to generate the code and NOT manually adjust the code. This would not be the way I would build a production app, but it was a fun experiment.

Some things I learned and noticed:
- Make regular commits to the repo so that cursor can continue to generate code and you can keep track of the changes. This is not different then normal coding.
- When a bug happens in the browser, copy&paste the console error to cursor and ask it to fix the code.
- Use github copilot to review the code and suggest improvements and input that back to cursor.
- I ran into problems when I wanted to add a webworker to the project. Cursor did this, but the worker was not working. I had to manually adjust the code to make it work... which was simply removing worker.terminate() from an unmount.
- In one scenario Cursor wanted to change the package.json file with wrong version of react.
- It also happened that I needed to keep on prompting cursor to fix the code when the output of the synthtetic data generation was not correct. The same happened with the correlation calculation.
- Something that I also noticed (not only with Cursor) is that when you request complex algorithms (like CART for synthetic data generation), the first version is often a very basic version which is just a placeholder or a very basic implementation. You need to keep on prompting to improve the algorithm and get the results you want. I used a different LLM to review the CART code and suggest improvements.

## How to run

```bash
npm install
npm run dev
```

