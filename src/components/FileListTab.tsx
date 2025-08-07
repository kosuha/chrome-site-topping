
import { useState, useEffect } from 'react';
import styles from '../styles/FileListTab.module.css';
import { useAppContext } from '../contexts/AppContext';

interface FileVersion {
  id: string;
  version: string;
  modifiedDate: Date;
}

interface FileItem {
  id: string;
  name: string;
  createdDate: Date;
  lastModified: Date;
  versions: FileVersion[];
  primaryVersionId?: string;
  isApplied: boolean;
}

const mockFiles: FileItem[] = [
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

export default function FileListTab() {
  const { actions } = useAppContext();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  useEffect(() => {
    setFiles(mockFiles);
  }, []);

  const toggleFileExpansion = (fileId: string) => {
    const newExpanded = new Set(expandedFiles);
    if (newExpanded.has(fileId)) {
      newExpanded.delete(fileId);
    } else {
      newExpanded.add(fileId);
    }
    setExpandedFiles(newExpanded);
  };

  const toggleFileApplied = (fileId: string) => {
    setFiles(files.map(file => 
      file.id === fileId ? { ...file, isApplied: !file.isApplied } : file
    ));
  };


  const setPrimaryVersion = (fileId: string, versionId: string) => {
    setFiles(files.map(file => 
      file.id === fileId ? { ...file, primaryVersionId: versionId } : file
    ));
  };

  const getPrimaryVersion = (file: FileItem) => {
    if (file.primaryVersionId) {
      return file.versions.find(v => v.id === file.primaryVersionId);
    }
    return file.versions[file.versions.length - 1];
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>파일 목록</h3>
        <div className={styles.fileCount}>총 {files.length}개 파일</div>
      </div>
      
      <div className={styles.fileList}>
        {files.map((file) => (
          <div key={file.id} className={styles.fileItem}>
            <div className={styles.fileHeader}>
              <div 
                className={styles.fileInfo}
                onClick={() => toggleFileExpansion(file.id)}
              >
                <div className={styles.fileDetails}>
                  <div className={styles.fileName}>{file.name}</div>
                  <div className={styles.fileMeta}>
                    생성: {formatDate(file.createdDate)} | 수정: {formatDate(file.lastModified)} | 사용중: v{getPrimaryVersion(file)?.version}
                  </div>
                </div>
              </div>
              <div className={styles.fileControls}>
                <div 
                  className={`${styles.toggle} ${file.isApplied ? styles.toggleActive : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFileApplied(file.id);
                  }}
                >
                  <div className={styles.toggleSlider}></div>
                </div>
                {/* <div 
                  className={styles.expandIcon}
                  onClick={() => toggleFileExpansion(file.id)}
                >
                  {expandedFiles.has(file.id) ? '▼' : '▶'}
                </div> */}
              </div>
            </div>
            
            {expandedFiles.has(file.id) && (
              <div className={styles.versionsContainer}>
                <div className={styles.versionsList}>
                  {file.versions.map((version) => (
                    <div key={version.id} className={`${styles.versionItem} ${file.primaryVersionId === version.id || (!file.primaryVersionId && version === file.versions[file.versions.length - 1]) ? styles.primaryVersion : ''}`}>
                      <div className={styles.versionInfo}>
                        <span className={styles.versionNumber}>v{version.version}</span>
                        <span className={styles.versionDate}>
                          {formatDate(version.modifiedDate)}
                        </span>
                        {(file.primaryVersionId === version.id || (!file.primaryVersionId && version === file.versions[file.versions.length - 1])) && (
                          <span className={styles.primaryBadge}>사용중</span>
                        )}
                      </div>
                      <div className={styles.versionActions}>
                        <button 
                          className={styles.actionButton}
                          onClick={() => actions.setActiveTab('code')}
                        >
                          보기
                        </button>
                        <button 
                          className={styles.actionButton}
                          onClick={() => setPrimaryVersion(file.id, version.id)}
                        >
                          이 버전 사용
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}