import { useState, useEffect } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { css } from '@codemirror/lang-css';
import styles from '../styles/CodeEditTab.module.css';
import { xcodeLight } from '@uiw/codemirror-theme-xcode';
import { useAppContext } from '../contexts/AppContext';
import { Save } from 'lucide-react';
import { EditorView } from '@codemirror/view';

// CodeMirror 배경 투명 테마 (글래스 효과를 컨테이너에서 보이도록)
const transparentTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent' },
  '.cm-scroller': { backgroundColor: 'transparent' },
  '.cm-gutters': { backgroundColor: 'transparent' }
}, { dark: false });

type Language = 'javascript' | 'css';

export default function CodeEditTab() {
  const { state, actions } = useAppContext();
  const [language, setLanguage] = useState<Language>('javascript');

  // 요소 선택 결과를 활성 탭이 Code일 때 코드 에디터에 삽입
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window || !e.data) return;
      const data = e.data as any;
      if (data.type === 'SITE_TOPPING_ELEMENT_PICKED' && state.activeTab === 'code') {
        const selector = String(data.selector || '').trim();
        if (!selector) return;
        if (language === 'css') {
          const snippet = `\n/* picked */\n${selector} {\n  /* TODO: style here */\n}\n`;
          actions.setEditorCode('css', (state.editorCode.css || '') + snippet);
        } else {
          const snippet = `\n// picked\nconst el = document.querySelector(${JSON.stringify(selector)});\nif (el) {\n  // TODO: manipulate element\n}\n`;
          actions.setEditorCode('javascript', (state.editorCode.javascript || '') + snippet);
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [state.activeTab, language, state.editorCode.css, state.editorCode.javascript, actions]);

  const handleLanguageChange = (newLanguage: Language) => {
    setLanguage(newLanguage);
  };

  const handleEditorChange = (value: string | undefined) => {
    actions.setEditorCode(language, value || '');
  };

  const handleSave = () => {
    // 현재 코드 상태를 히스토리에 푸시
    actions.pushCodeHistory({
      javascript: state.editorCode.javascript,
      css: state.editorCode.css,
      description: '사용자 저장',
      isSuccessful: true,
    });
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          {/* 액션/언어 선택 영역 */}
          <div className={styles.actionsRow}>
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

            <div className={styles.actionButtons}>
              <button className={styles.saveButton} onClick={handleSave} title="저장 및 히스토리 추가">
                <Save size={14} /> 저장
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
          extensions={[
            language === 'javascript' ? javascript() : css(),
            transparentTheme,
          ]}
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