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
  name: string;
  parentId: number;
  selfTime: number;
  totalTime: number;
}

export interface IPostProcess {
  metadata: {[key: string]: any};
  summary: {[key: string]: number};
  topDown: IEvent[];
  bottomUp: IEvent[];
}

export interface ISummary extends IPostProcess {
  traceFile: string;
  traceName: string;
  repo: IRepoInfo;
}
