import { timeline, TimelineRunner } from '.';
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { createServer } from 'http';


async function oneShotServer(ip: string = '127.0.0.1', port: number = 8888): Promise<any> {
  return new Promise(resolve => {
    const s = createServer((req, res) => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain');
      res.end('Hello World!\n');
      setTimeout(() => s.close(() => null), 0);
    }).listen(port, ip, () => resolve());
  });
}

describe('TimelineRunner', function(): void {
  it('get revisions', function(done: Mocha.Done): void {
    TimelineRunner.installedRevisions().then((revisions) => {
      const numbers = Object.getOwnPropertyNames(revisions);
      assert(numbers.length > 0, 'no chromium revisions installed');
      done();
    });
  });
});

describe('timeline', function(): void {
  it('open a page', function(done: Mocha.Done): void {
    this.timeout(10000);
    timeline(async (runner) => {
      await oneShotServer();
      await runner.page.goto('http://127.0.0.1:8888/test/abc');
      assert(runner.page.url() === 'http://127.0.0.1:8888/test/abc', 'url mismatch');
    }).then(done, done);
  });

  it('place & resolve remote task', function(done: Mocha.Done): void {
    this.timeout(10000);
    timeline(async (runner) => {
      await runner.remote((resolve) => {
        resolve();
      });
    }).then(done, done);
  });

  it('timeline should not hang on error', function(done: Mocha.Done): void {
    this.timeout(10000);
    timeline(async (runner) => {
      // this is an error, control flow jumps to reject
      await (runner.page as any).klaus();
      // should not been called
      throw Error('this is unexpected');
    }).then(
      () => Promise.reject(new Error('Expected method to reject.')),
      err => {
        assert(err instanceof Error && err.message !== 'this is unexpected');
        done();
      });
  });

  it('custom option {headless: false}', function(done: Mocha.Done): void {
    this.timeout(20000);
    timeline({launchOptions: {headless: false}}, async (runner) => {
      await oneShotServer();
      await runner.page.goto('http://127.0.0.1:8888/test/abc');
      await runner.page.on('dialog', async dialog => {
        await runner.sleep(2000);
        await dialog.dismiss();
        done();
      });
      await runner.sleep(1000);
      await runner.remote((resolve) => {
        alert('Hello?');
        resolve();
      });
    });
  });

  describe('tracing', function(): void {
    it('should record something', function(done: Mocha.Done): void {
      this.timeout(10000);
      timeline(async (runner) => {
        await runner.tracingStart('test-trace1');
        await runner.remote((resolve) => setTimeout(() => resolve(), 1000));
        const trace = await runner.tracingStop();
        assert(trace.length > 1000, 'error retrieving trace');
      }).then(done, done);
    });

    it('should write a trace file', function(done: Mocha.Done): void {
      this.timeout(10000);
      timeline(async (runner) => {
        await runner.tracingStart('test-trace2');
        const filename = path.join(runner.dataPath, `${runner.id}__${(runner as any)._runningTraceId}.trace`);
        await runner.remote((resolve) => setTimeout(() => resolve(), 1000));
        const trace = await runner.tracingStop();
        assert(trace.length > 1000, 'error retrieving trace');
        assert(fs.existsSync(filename), 'trace file not written');
      }).then(done, done);
    });

    it('starting trace twice should not be allowed', function(done: Mocha.Done): void {
      this.timeout(10000);
      timeline(async (runner) => {
        await runner.tracingStart('trace1');
        runner.tracingStart('trace2').then(
          () => Promise.reject(new Error('Expected method to reject.')),
          err => { assert(err instanceof Error); done(); }
        );
      });
    });
  });
});
