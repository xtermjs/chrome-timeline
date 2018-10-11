import * as p from 'puppeteer';
import * as git from 'simple-git/promise';

export interface IRevisionInfo {
  revision: string;
  folderPath: string;
  executablePath: string;
  url: string;
  local: boolean;
}

export interface IBrowserFetcherStub {
  canDownload(revision: string): Promise<boolean>;
  download(revision: string, progressCallback?: (downloadedBytes: number, totalBytes: number) => void): Promise<IRevisionInfo>;
  localRevisions(): Promise<string[]>;
  platform(): string;
  remove(revision: string): Promise<null>;
  revisionInfo(revision: string): IRevisionInfo;
}

export interface ITimelineRunnerOptions {
  launchOptions?: p.LaunchOptions;
  connectOptions?: p.ConnectOptions;
  connect?: boolean;
  tracingStartOptions?: p.TracingStartOptions;
  tracingEndOptions?: ITracingEndOptions;  
  timeout?: number;
}

export interface IRepoInfo {
  isRepo: boolean;
  info?: git.BranchSummary;
  status?: {['path']: string, ['index']: string, ['working_dir']: string}[];
  diff?: string;
}

export interface IEvent {
  id: number;
  parentId: number;
  name: string;
  selfTime: number;
  totalTime: number;
}

export interface IPostProcess {
  /** useful metadata created by puppeteer (contains hardware setup and such) */
  metadata: {[key: string]: any};
  /** profiling summary as shown in the pie chart in devtools */
  summary: {[key: string]: number};
  /** top down tree events */
  topDown: IEvent[];
  /** bottom up tree events */
  bottomUp: IEvent[];
}

export interface ISummary extends IPostProcess {
  /** path to trace the summary belongs to */
  traceFile: string;
  /** name of the trace as given to .tracingStart(name) */
  traceName: string;
  /** additional git repo stats */
  repo: IRepoInfo;
}

export interface ITracingEndOptions {
  /** save trace under timeline/<epoch>/runnerId_<epoch>.trace */
  saveTrace?: boolean;
  /** create a summary of the trace data, also saved if saveTrace=true */
  createSummary?: boolean;
  /** report uncommitted changes for current git branch in summary */
  reportUncommittedChanges?: boolean;
}
