import { useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { css } from '@codemirror/lang-css';
import { oneDark } from '@codemirror/theme-one-dark';
import styles from '../styles/CodeEditTab.module.css';

type Language = 'javascript' | 'css';

const DEFAULT_CODE = {
  javascript: `// Welcome to Monaco Editor
function hello() {
  console.log("Hello World!");
}

hello();`,
  css: `/* CSS Styles */
.container {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 8px;
  padding: 20px;
}

.title {
  color: white;
  font-size: 24px;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}`
};

export default function CodeEditTab() {
  const [language, setLanguage] = useState<Language>('javascript');
  const [code, setCode] = useState(DEFAULT_CODE.javascript);

  const handleLanguageChange = (newLanguage: Language) => {
    setLanguage(newLanguage);
    setCode(DEFAULT_CODE[newLanguage]);
  };

  const handleEditorChange = (value: string | undefined) => {
    setCode(value || '');
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <h3 className={styles.title}>코드 에디터</h3>
          <div className={styles.languageSelector}>
            <button
              className={`${styles.languageButton} ${language === 'javascript' ? styles.active : ''}`}
              onClick={() => handleLanguageChange('javascript')}
            >
              JavaScript
            </button>
            <button
              className={`${styles.languageButton} ${language === 'css' ? styles.active : ''}`}
              onClick={() => handleLanguageChange('css')}
            >
              CSS
            </button>
          </div>
        </div>
      </div>
      <div className={styles.editorContainer}>
        <CodeMirror
          value={code}
          onChange={handleEditorChange}
          theme={oneDark}
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
        />
      </div>
    </div>
  );
}