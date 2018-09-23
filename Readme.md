## chrome-timeline

Write performance tests and get the timeline profiling data from puppeteer (chromium).
The profiling data gets written to a folder `timeline` in the app path.

### Example:
```js
const timeline = require('chrome-timeline').timeline;

timeline(async (runner) => {
  // load something in chromium
  await runner.page.goto('https://example.com');
  // start a timeline profiling
  await runner.tracingStart('LS_TRACE');
  // do something in the remote page
  await runner.remote((done, window) => {
    // this is within remote browser context
    some_heavy_stuff_to_be_measured();
    // call done when finished
    done();
  });
  // stop the profiling
  await runner.tracingStop();
});
```

### TODO:

- write viewer part for easier inspection (based on devtools app)
