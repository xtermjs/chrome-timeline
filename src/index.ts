/**
 * Copyright (c) 2018 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import * as p from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import { createLogger, format, transports, Logger } from 'winston';
const postProcess: (buffer: Buffer) => any = require('../process_data').postProcess;
import * as appRoot from 'app-root-path';
import * as git from 'simple-git/promise';
import { ITimelineRunnerOptions, IRevisionInfo, IBrowserFetcherStub, IRepoInfo, ISummary } from './interfaces';

/** create a unique id for every process invocation */
const EPOCH: number = (new Date).getTime();

/** create runner id within this process */
let runnerId: number = 0;

/** default options for TimelineRunner, can be changed as first argument of timeline */
export const DEFAULT_OPTIONS: ITimelineRunnerOptions = {
  // launchOptions: {headless: false},
  connect: false,
  tracingStartOptions: {
    path: null,
    screenshots: true,
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
};

/**
 * TimelineRunner
 *
 * Class to encapsulate most of the puppeteer interactions and
 * provide default logging and trace data paths.
 *
 * By default, it aggregates the data under './timeline' in a
 * unique folder for a single process run. Therefore multiple
 * `TimelineRunner` invocations will end up in the same folder
 * if called in the same process.
 * The activity.log contains data about the different call invocations,
 * which might come handy for debugging the perf tests.
 * Trace data is saved as 'runnerId__traceId.trace' along with a
 * summary in 'runnerId__traceId.summary' as json data.
 *
 * For most test cases it is not needed to use this class directly,
 * instead consider using the `timeline` function below.
 */
export class TimelineRunner {
  public options: ITimelineRunnerOptions;
  public appPath: string = path.join(appRoot.path, 'timeline');
  public dataPath: string = path.join(this.appPath, EPOCH.toString());
  public id: number;
  public logger: Logger | null;
  public browser: p.Browser | null;
  public page: p.Page | null;
  private _resolvers: {[key: string]: any} = {};
  private _runningTrace: string = '';
  private _runningTraceId: number = 0;
  public traceSummaries: {[key: string]: ISummary} = {};

  static async installedRevisions(): Promise<{[key: string]: IRevisionInfo}> {
    const result = {};
    const fetcher: IBrowserFetcherStub = (p as any).createBrowserFetcher();
    const revisions = await fetcher.localRevisions();
    for (let i = 0; i < revisions.length; ++i) {
      result[revisions[i]] = await fetcher.revisionInfo(revisions[i]);
    }
    return result;
  }

  constructor(options: ITimelineRunnerOptions = DEFAULT_OPTIONS) {
    this.options = Object.assign({}, options);
    /* istanbul ignore if */
    if (!fs.existsSync(this.appPath)) {
      fs.mkdirSync(this.appPath);
    }
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath);
    }
    this.id = ++runnerId;
    this.logger = createLogger({
      level: 'info',
      format: format.combine(format.label({label: this.id}), format.timestamp(), format.json()),
      transports: [
        new transports.File({filename: path.join(this.dataPath, 'activity.log')}),
        // new transports.Console
      ]
    });
    this.logger.info('runner instance created');
    this.logger.debug('TimelineRunnerOptions: ' + JSON.stringify(options));
  }

  /**
   * Exposes a function to the client to resolve `.remote` calls.
   * This is automatically done for the default page.
   */
  exposePromiseResolver(page: p.Page): Promise<void> {
    return page.exposeFunction('__resolveRemote__', (id: string) => {
      this._resolvers[id]();
      delete this._resolvers[id];
    });
  }

  /**
   * Start a puppeteer client connection.
   * Depending on the options, this either launches
   * a new browser or connects to an already running
   * instance.
   */
  async start(): Promise<void> {
    if (this.options.connect) {
      this.browser = await p.connect(this.options.connectOptions);
      this.page = await this.browser.newPage();
    } else {
      this.browser = await p.launch(this.options.launchOptions);
      this.page = (await this.browser.pages())[0];
    }
    await this.exposePromiseResolver(this.page);
    this.logger.info('runner started');
    this.traceSummaries = {};
  }

  /**
   * End a puppeteer client connection.
   * Either closes or disconnects from remote.
   */
  async end(): Promise<void> {
    if (!this.browser) {
      return;
    }
    this.logger.info('runner about to end');
    this._resolvers = {};
    this.page = null;
    try {
      await this.browser[this.options.connect ? 'disconnect' : 'close']();
    } finally {
      this.browser = null;
      this.logger.info('runner ended');
    }
  }

  async run_(callback: (runner: TimelineRunner) => Promise<void> | void): Promise<any> {
    try {
      await callback(this);
      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e);
    }
  }

  /**
   * Run `callback`. The callback gets the runner instance as first argument.
   * It supports an optional timeout setting. If omitted it will wait until
   * all promises are resolved or rejected.
   */
  run(callback: (runner: TimelineRunner) => Promise<void> | void, timeout?: number): Promise<any> {
    if (timeout || this.options.timeout) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('callback timeout')), timeout || this.options.timeout);
        return this.run_(callback).then(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    } else {
      return this.run_(callback);
    }
  }

  /**
   * Evaluates and runs `callback` in the remote client.
   * It gets as arguments `done` and `window`. Call `done` to resolve
   * the returned promise.
   * If you spawn pages yourself, dont forget to call `.exposePromiseResolver(page)`
   * before using this method, otherwise `done` will not work.
   */
  remote(callback: (done: () => void, window: Window) => void): Promise<void> {
    const unique = (new Date()).getTime();
    this.logger.info(`remote task ${unique}: ${callback}`);
    return new Promise(async (resolve, reject) => {
      this._resolvers[unique] = resolve;
      try {
        await this.page.evaluate(`(${callback})(() => __resolveRemote__('${unique}'), window)`);
        this.logger.info(`remote task ${unique} loaded`);
      } catch (e) {
        delete this._resolvers[unique];
        console.log(`error in remote task ${unique}\n${callback}`);
        console.log(e.stack);
        this.logger.info(`remote task ${unique} eval error: ${e.stack}`);
        reject(e);
      }
    }).then(() => { this.logger.info(`remote task ${unique} ended`); });
  }

  /**
   * Start tracing in `.page`. The tracing settings default to those
   * in the constructor options and can be overwritten with `options`.
   * To use this on self spawned pages, set `.page` to the self spawned page.
   * It is not possible to start multiple tracings at once.
   */
  tracingStart(name: string, options: p.TracingStartOptions = this.options.tracingStartOptions): Promise<void> {
    if (this._runningTrace) {
      return Promise.reject(new Error('tracing already active'));
    }
    this._runningTrace = name;
    this._runningTraceId = (new Date()).getTime();
    return this.page.tracing.start(options || this.options.tracingStartOptions).then(
      () => { this.logger.info(`trace "${this._runningTrace}" started`); });
  }

  /**
   * Stop the active tracing.
   * Saves the tracing data as 'runnerId__traceId.trace' along
   * with a summary in 'runnerId__traceId.summary' as json files.
   * Returns a promise that resolves to the trace data as `Buffer`.
   */
  tracingStop(): Promise<Buffer> {
    return this.page.tracing.stop().then(async (data) => {
      this.logger.info(`trace "${this._runningTrace}" stopped`);
      const traceName = this._runningTrace;
      const tracePath = path.join(this.dataPath, `${this.id}__${this._runningTraceId}.trace`);
      const summaryPath = path.join(this.dataPath, `${this.id}__${this._runningTraceId}.summary`);
      try {
        await new Promise((resolve, reject) => fs.writeFile(tracePath, data, (e) => { (e) ? reject(e) : resolve(); }));
        this.logger.info(`trace "${this._runningTrace}" written to ${tracePath}`);
        try {
          const summary = postProcess(data);
          summary['traceFile'] = tracePath;
          summary['traceName'] = traceName;
          summary['repo'] = await this.repoInfo(true);
          this.traceSummaries[traceName] = summary;
          await new Promise((resolve, reject) => fs.writeFile(summaryPath,
            JSON.stringify(summary, null, 2), (e) => { (e) ? reject(e) : resolve(); }));
          this.logger.info(`trace "${this._runningTrace}" summary written to ${summaryPath}`);
        } catch (e) {
          this.logger.info(`trace "${this._runningTrace}" error writing summary to ${summaryPath} - ${e}`);
        }
      } catch (e) {
        this.logger.info(`trace "${this._runningTrace}" error writing to ${tracePath} - ${e}`);
      } finally {
        this._runningTrace = '';
        this._runningTraceId = 0;
      }
      return data;
    });
  }

  /** sleep helper */
  sleep(msec: number): Promise<any> {
    return new Promise(resolve => setTimeout(resolve, msec));
  }

  /**
   * Get repo status reported for summary report (used in `.tracingStop`).
   * Set `showDetails` to true to get uncommitted changes as well.
   */
  async repoInfo(showDetails: boolean = false): Promise<IRepoInfo> {
    const data: IRepoInfo = {isRepo: false};
    const repo = git(this.appPath);
    const isRepo = await repo.checkIsRepo().then((res) => (res) ? true : false).catch(e => false);
    if (isRepo) {
      data.isRepo = true;
      data['info'] = await repo.branchLocal();
      if (showDetails) {
        const status = await repo.status();
        if (status.files.length) {
          data['status'] = status.files;
          data['diff'] = await repo.diff();
        }
      }
    }
    return data;
  }
}

/**
 * This function provides a convenvient way to set up
 * performance tests with puppeteer.
 * By default it does a clean startup of the remote chromium client,
 * runs the provided callback and exists the client afterwards.
 * This behavior can be changed by providing custom options.
 * `callback` should be an async function or return a promise
 * and gets the underlying `TimelineRunner` instance as single argument.
 *
 * To work with mocha, place the `done` callback into `.then`:
 *  it('some tests', (done) => {
 *    timeline(async (runner) => {
 *      // do some stuff here...
 *    }).then(done, done);
 *  });
 * Mot likely you will have to adjust the timeout setting since
 * spawning and running the remote client takes some time.
 */
export async function timeline(
  cb: (runner: TimelineRunner) => Promise<void> | void): Promise<{[key: string]: ISummary}>;
export async function timeline(
  options: ITimelineRunnerOptions,
  cb: (runner: TimelineRunner) => Promise<void> | void): Promise<{[key: string]: ISummary}>;
export async function timeline(
  optionsOrCb: ITimelineRunnerOptions | ((runner: TimelineRunner) => Promise<void> | void),
  cb?: (runner: TimelineRunner) => Promise<void> | void): Promise<{[key: string]: ISummary}>
{
  let opts = null;
  if (typeof optionsOrCb === 'function') {
    cb = optionsOrCb;
  } else {
    opts = optionsOrCb;
  }
  const runner = (opts) ? new TimelineRunner(opts) : new TimelineRunner();
  await runner.start();
  try {
    await runner.run(cb);
  } finally {
    await runner.end();
  }
  return runner.traceSummaries;
}
