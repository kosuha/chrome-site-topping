export interface FileVersion {
  id: string;
  version: string;
  modifiedDate: Date;
}

export interface FileItem {
  id: string;
  name: string;
  createdDate: Date;
  lastModified: Date;
  versions: FileVersion[];
  primaryVersionId?: string;
  isApplied: boolean;
}