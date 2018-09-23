import * as p from 'puppeteer';

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
