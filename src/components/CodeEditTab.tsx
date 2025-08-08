import { useState, useEffect } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { css } from '@codemirror/lang-css';
import styles from '../styles/CodeEditTab.module.css';
import { xcodeLight } from '@uiw/codemirror-theme-xcode';
import { useAppContext } from '../contexts/AppContext';
import { ChevronDown } from 'lucide-react';

type Language = 'javascript' | 'css';

export default function CodeEditTab() {
  const { state, actions } = useAppContext();
  const [language, setLanguage] = useState<Language>('javascript');
  
  const selectedFile = state.selectedFileId 
    ? state.files.find(f => f.id === state.selectedFileId) 
    : null;
    
  const selectedVersion = selectedFile && state.selectedVersionId
    ? selectedFile.versions.find(v => v.id === state.selectedVersionId)
    : selectedFile?.versions[selectedFile.versions.length - 1];

  const [fileMetadata, setFileMetadata] = useState({
    fileName: selectedFile?.name || '',
    createdAt: selectedFile?.createdDate || new Date(),
    lastModified: selectedFile?.lastModified || new Date(),
    version: selectedVersion?.version || '1'
  });
  
  
  const [showVersionDropdown, setShowVersionDropdown] = useState(false);

  useEffect(() => {
    if (selectedFile) {
      setFileMetadata({
        fileName: selectedFile.name,
        createdAt: selectedFile.createdDate,
        lastModified: selectedFile.lastModified,
        version: selectedVersion?.version || '1'
      });
    }
  }, [selectedFile, selectedVersion]);

  const handleLanguageChange = (newLanguage: Language) => {
    setLanguage(newLanguage);
    setFileMetadata(prev => ({
      ...prev,
      lastModified: new Date()
    }));
  };

  const handleEditorChange = (value: string | undefined) => {
    actions.setEditorCode(language, value || '');
    setFileMetadata(prev => ({
      ...prev,
      lastModified: new Date()
    }));
  };

  const handleFileNameChange = (newFileName: string) => {
    setFileMetadata(prev => ({
      ...prev,
      fileName: newFileName,
      lastModified: new Date()
    }));
  };

  const handleVersionSelect = (version: { id: string; version: string; modifiedDate: Date }) => {
    setFileMetadata(prev => ({
      ...prev,
      version: version.version
    }));
    setShowVersionDropdown(false);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerContent}>

          {/* File Info Section */}
          <div className={styles.fileInfo}>
            <div className={styles.fileNameSection}>
              <input
                type="text"
                placeholder="new file"
                value={fileMetadata.fileName}
                onChange={(e) => handleFileNameChange(e.target.value)}
                className={styles.fileNameInput}
              />
            </div>
            
            {/* Version Selector */}
            <div className={styles.versionSection}>
              <div className={styles.versionSelector}>
                <button 
                  className={styles.versionButton}
                  onClick={() => setShowVersionDropdown(!showVersionDropdown)}
                >
                  <span className={styles.versionName}>
                    v{fileMetadata.version}
                  </span>
                  <span className={styles.versionIcon}>
                    <ChevronDown size={12} />
                  </span>
                </button>
                {showVersionDropdown && (
                  <div className={styles.versionDropdown}>
                    {selectedFile?.versions.map((version) => (
                      <button
                        key={version.id}
                        className={`${styles.versionOption} ${fileMetadata.version === version.version ? styles.selected : ''}`}
                        onClick={() => handleVersionSelect(version)}
                      >
                        <span className={styles.versionName}>v{version.version}</span>
                      </button>
                    )) || []}
                  </div>
                )}
              </div>
            </div>
          </div>

          
          <div className={styles.fileDetailsWrapper}>
            {/* Language Selector */}
            <div className={styles.languageSelector}>
              <button
                className={`${styles.languageButton} ${language === 'javascript' ? styles.active : ''}`}
                onClick={() => handleLanguageChange('javascript')}
              >
                <svg width="14px" height="14px" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMinYMin meet">
                  <path d="M0 0h256v256H0V0z" fill="#F7DF1E"/>
                  <path d="M67.312 213.932l19.59-11.856c3.78 6.701 7.218 12.371 15.465 12.371 7.905 0 12.89-3.092 12.89-15.12v-81.798h24.057v82.138c0 24.917-14.606 36.259-35.916 36.259-19.245 0-30.416-9.967-36.087-21.996M152.381 211.354l19.588-11.341c5.157 8.421 11.859 14.607 23.715 14.607 9.969 0 16.325-4.984 16.325-11.858 0-8.248-6.53-11.17-17.528-15.98l-6.013-2.58c-17.357-7.387-28.87-16.667-28.87-36.257 0-18.044 13.747-31.792 35.228-31.792 15.294 0 26.292 5.328 34.196 19.247L210.29 147.43c-4.125-7.389-8.591-10.31-15.465-10.31-7.046 0-11.514 4.468-11.514 10.31 0 7.217 4.468 10.14 14.778 14.608l6.014 2.577c20.45 8.765 31.963 17.7 31.963 37.804 0 21.654-17.012 33.51-39.867 33.51-22.339 0-36.774-10.654-43.819-24.574"/>
                </svg>
                JavaScript
              </button>
              <button
                className={`${styles.languageButton} ${language === 'css' ? styles.active : ''}`}
                onClick={() => handleLanguageChange('css')}
              >
                <svg width="14px" height="14px" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6 28L4 3H28L26 28L16 31L6 28Z" fill="#1172B8"/>
                  <path d="M26 5H16V29.5L24 27L26 5Z" fill="#33AADD"/>
                  <path d="M19.5 17.5H9.5L9 14L17 11.5H9L8.5 8.5H24L23.5 12L17 14.5H23L22 24L16 26L10 24L9.5 19H12.5L13 21.5L16 22.5L19 21.5L19.5 17.5Z" fill="white"/>
                </svg>
                CSS
              </button>
            </div>
          </div>

        </div>
      </div>
      <div className={styles.editorContainer}>
        <CodeMirror
          value={state.editorCode[language]}
          onChange={handleEditorChange}
          theme={xcodeLight}
          height="100%"
          extensions={[language === 'javascript' ? javascript() : css()]}
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            dropCursor: false,
            allowMultipleSelections: false,
            indentOnInput: true,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: true,
            highlightSelectionMatches: false,
            searchKeymap: true
          }}
          style={{
            height: '100%',
            fontSize: '14px'
          }}
        />
      </div>
    </div>
  );
}