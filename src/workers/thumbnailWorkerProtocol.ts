export interface ThumbnailGenerateCommand {
  type: 'thumbnail-generate';
  requestId: number;
  dataUri: string;
  maxSize: number;
}

export type ThumbnailWorkerCommand = ThumbnailGenerateCommand;

export interface ThumbnailSuccessEvent {
  type: 'thumbnail-success';
  requestId: number;
  thumbnailUri: string;
}

export interface ThumbnailErrorEvent {
  type: 'thumbnail-error';
  requestId: number;
  error: string;
}

export type ThumbnailWorkerEvent = ThumbnailSuccessEvent | ThumbnailErrorEvent;
