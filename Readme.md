## chrome-timeline

Write performance tests and get the timeline profiling data from puppeteer (chromium).

### Example:
```js
const timeline = require('chrome-timeline').timeline;

timeline(async (runner) => {
  // load something in chromium
  await runner.page.goto('https://example.com');
  // start a timeline profiling
  await runner.tracingStart('TRACE_ABC');
  // do something in the remote page
  await runner.remote((done, window) => {
    // this is within remote browser context
    some_heavy_stuff_to_be_measured();
    // call done when finished (sync variant)
    done();
    // or async example with setTimeout
    setTimeout(done, 10000);
  });
  // stop the profiling
  await runner.tracingStop();
});
```

By default `timeline` does a clean startup of a remote puppeteer chromium client,
runs the provided callback and exists the client afterwards.
This behavior can be changed by providing custom options (e.g. connecting to a running remote instance).
`timeline` returns a promise containing summaries of tracings that were done denoted
by the name (`'TRACE_ABC'` in the example).

### Tracing start default options
```js
tracingStartOptions: {
  // path to trace file export (default: no file written)
  path: null,
  // whether the trace should contain screenshots
  screenshots: true,
  // profiling categories chrome understands
  categories: [
    '-*',
    'v8.execute',
    'blink.user_timing',
    'latencyInfo',
    'devtools.timeline',
    'disabled-by-default-devtools.timeline',
    'disabled-by-default-devtools.timeline.frame',
    'toplevel',
    'blink.console',
    'disabled-by-default-devtools.timeline.stack',
    'disabled-by-default-devtools.screenshot',
    'disabled-by-default-v8.cpu_profile',
    'disabled-by-default-v8.cpu_profiler',
    'disabled-by-default-v8.cpu_profiler.hires'
  ]
}
```

### Tracing end default options
```js
tracingEndOptions: {
  // save trace under timeline/<epoch>/runnerId_<epoch>.trace
  saveTrace: false,
  // create a summary of trace data, also saved if saveTrace=true
  createSummary: true,
  // report uncommitted changes for current git branch in summary
  reportUncommittedChanges: false,
}
```

### Summary

Summaries are returned by `timeline` for a single tracing, if `tracingEndOptions.createSummary=true`.
They contain various useful stats from a trace for further postprocessing:

```js
export interface ISummary extends IPostProcess {
  // path to trace flie the summary belongs to (empty if tracingEndOptions.saveTrace=false)
  traceFile: string;
  // name of the trace as given to .tracingStart(name)
  traceName: string;
  // additional git repo stats (contains {isRepo: false} for non git repo projects)
  repo: IRepoInfo;
  // puppeteer profiling metadata (e.g. hardware setup, env data, cmdline)
  metadata: {[key: string]: any};
  // profiling summary as shown in the pie chart in devtools
  summary: {[key: string]: number};
  // top down tree events
  topDown: IEvent[];
  // bottom up tree events
  bottomUp: IEvent[];
}
```
