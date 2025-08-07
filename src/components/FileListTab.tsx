import { useEffect } from 'react';
import styles from '../styles/FileListTab.module.css';
import { useAppContext } from '../contexts/AppContext';
import { FileItem } from '../types/file';
import { mockFiles } from '../data/mockFiles';

export default function FileListTab() {
  const { state, actions } = useAppContext();
  const { files, expandedFiles } = state;

  useEffect(() => {
    if (files.length === 0) {
      actions.setFiles(mockFiles);
    }
  }, [files.length, actions]);

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
                onClick={() => actions.toggleFileExpansion(file.id)}
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
                    actions.toggleFileApplied(file.id);
                  }}
                >
                  <div className={styles.toggleSlider}></div>
                </div>
                {/* <div 
                  className={styles.expandIcon}
                  onClick={() => actions.toggleFileExpansion(file.id)}
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
                          onClick={() => {
                            actions.selectFile(file.id, version.id);
                            actions.setActiveTab('code');
                          }}
                        >
                          보기
                        </button>
                        <button 
                          className={styles.actionButton}
                          onClick={() => actions.setPrimaryVersion(file.id, version.id)}
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