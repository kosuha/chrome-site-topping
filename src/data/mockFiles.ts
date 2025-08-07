import { FileItem } from '../types/file';

export const mockFiles: FileItem[] = [
  {
    id: '1',
    name: 'main',
    createdDate: new Date('2024-01-15'),
    lastModified: new Date('2024-08-07'),
    versions: [
      { id: 'v1', version: '1', modifiedDate: new Date('2024-01-15') },
      { id: 'v2', version: '2', modifiedDate: new Date('2024-03-20') },
      { id: 'v3', version: '3', modifiedDate: new Date('2024-08-07') }
    ],
    isApplied: true
  },
  {
    id: '2',
    name: 'style',
    createdDate: new Date('2024-01-20'),
    lastModified: new Date('2024-07-15'),
    versions: [
      { id: 'v1', version: '1', modifiedDate: new Date('2024-01-20') },
      { id: 'v2', version: '2', modifiedDate: new Date('2024-07-15') }
    ],
    isApplied: false
  },
  {
    id: '3',
    name: 'product list',
    createdDate: new Date('2024-02-01'),
    lastModified: new Date('2024-06-30'),
    versions: [
      { id: 'v1', version: '1', modifiedDate: new Date('2024-02-01') }
    ],
    isApplied: true
  }
];