import { useState, useEffect, useRef, useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { css } from '@codemirror/lang-css';
import { EditorView } from '@codemirror/view';
import { Save, Loader2, Check, X, Plus, Trash2, Circle, CheckCircle, MoreVertical, ChevronLeft, ChevronRight } from 'lucide-react';
import styles from '../styles/CodeEditTab.module.css';
import { useAppContext } from '../contexts/AppContext';
import { useTranslations } from '../hooks/useTranslations';
import { SiteIntegrationService } from '../services/siteIntegration';
import { filesToLanguageString, saveFileDraft } from '../utils/codeFiles';

const transparentTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent' },
  '.cm-scroller': { backgroundColor: 'transparent' },
  '.cm-gutters': { backgroundColor: 'transparent' }
}, { dark: false });

type Language = 'javascript' | 'css';

export default function CodeEditTab() {
  const { state, actions, computed } = useAppContext();
  const t = useTranslations();
  const files = useMemo(() => [...state.codeFiles].sort((a, b) => a.order - b.order), [state.codeFiles]);
  const selectedFile = computed.selectedFile;
  const siteService = useMemo(() => SiteIntegrationService.getInstance(), []);
  const [language, setLanguage] = useState<Language>('javascript');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [isFilePanelOpen, setIsFilePanelOpen] = useState(true);
  const lastPickRef = useRef<{ selector: string; ts: number }>({ selector: '', ts: 0 });
  const activeFileCount = useMemo(() => files.filter(file => file.isActive).length, [files]);
  const inactiveFileCount = files.length - activeFileCount;
  const fileStatsLabel = t.codeEditor.fileStats(activeFileCount, inactiveFileCount, files.length);
  const languageDescription = t.codeEditor.languageDescription[language];

  useEffect(() => {
    if (!selectedFile) {
      setLanguage('javascript');
    }
  }, [selectedFile?.id]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window || !e.data || !selectedFile) return;
      const data = e.data as any;
      if (data.type !== 'SITE_TOPPING_ELEMENT_PICKED') return;
      const selector = String(data.selector || '').trim();
      if (!selector || state.activeTab !== 'code') return;
      const now = Date.now();
      if (selector === lastPickRef.current.selector && now - lastPickRef.current.ts < 250) {
        return;
      }
      lastPickRef.current = { selector, ts: now };
      if (language === 'css') {
        const snippet = `/* picked */\n${selector} {\n  /* TODO: style here */\n}\n`;
        const current = selectedFile.draftCss || '';
        const combined = current ? `${current}\n\n${snippet}` : snippet;
        actions.updateFileDraft(selectedFile.id, 'css', combined);
      } else {
        const snippet = `// picked\nconst el = document.querySelector(${JSON.stringify(selector)});\nif (el) {\n  // TODO: manipulate element\n}\n`;
        const current = selectedFile.draftJavascript || '';
        const combined = current ? `${current}\n\n${snippet}` : snippet;
        actions.updateFileDraft(selectedFile.id, 'javascript', combined);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [state.activeTab, language, selectedFile, actions]);

  useEffect(() => {
    if (saveSuccess) {
      const timer = setTimeout(() => setSaveSuccess(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [saveSuccess]);

  useEffect(() => {
    if (saveFailed) {
      const timer = setTimeout(() => setSaveFailed(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [saveFailed]);

  const handleLanguageChange = (newLanguage: Language) => {
    setLanguage(newLanguage);
  };

  const handleEditorChange = (value: string | undefined) => {
    if (!selectedFile) return;
    actions.updateFileDraft(selectedFile.id, language, value || '');
  };

  const handleSave = async () => {
    if (!selectedFile || isSaving || !selectedFile.hasUnsavedChanges) return;
    const siteCode = state.selectedSiteCode;
    const deployedScript = state.serverCode.deployedScript;
    const deployedCss = state.serverCode.deployedCss;

    const nextFiles = state.codeFiles.map(file => {
      if (file.id === selectedFile.id) {
        return saveFileDraft({ ...file });
      }
      return { ...file };
    });

    const draftScript = filesToLanguageString(nextFiles, 'javascript', true, true);
    const draftCss = filesToLanguageString(nextFiles, 'css', true, true);

    try {
      setIsSaving(true);
      setSaveSuccess(false);
      setSaveFailed(false);
      await new Promise(resolve => setTimeout(resolve, 300));

      if (siteCode) {
        const response = await siteService.saveDraftScript(siteCode, {
          draftScriptContent: draftScript,
          draftCssContent: draftCss,
        });
        actions.setServerCode(
          response.draft_script_content ?? draftScript,
          response.draft_css_content ?? draftCss,
          response.script_content ?? deployedScript ?? null,
          response.css_content ?? deployedCss ?? null,
        );
      }

      actions.saveFile(selectedFile.id);
      setSaveSuccess(true);
    } catch (error) {
      console.error('저장 실패:', error);
      if (error instanceof Error) {
        alert(error.message);
      }
      setSaveFailed(true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAll = async () => {
    if (!computed.hasUnsavedFiles || isSaving) return;
    const siteCode = state.selectedSiteCode;
    const deployedScript = state.serverCode.deployedScript;
    const deployedCss = state.serverCode.deployedCss;
    const nextFiles = state.codeFiles.map(file => saveFileDraft({ ...file }));
    const draftScript = filesToLanguageString(nextFiles, 'javascript', true, true);
    const draftCss = filesToLanguageString(nextFiles, 'css', true, true);
    try {
      setIsSaving(true);
      setSaveSuccess(false);
      setSaveFailed(false);
      await new Promise(resolve => setTimeout(resolve, 300));
      if (siteCode) {
        const response = await siteService.saveDraftScript(siteCode, {
          draftScriptContent: draftScript,
          draftCssContent: draftCss,
        });
        actions.setServerCode(
          response.draft_script_content ?? draftScript,
          response.draft_css_content ?? draftCss,
          response.script_content ?? deployedScript ?? null,
          response.css_content ?? deployedCss ?? null,
        );
      }

      actions.saveAllFiles();
      setSaveSuccess(true);
    } catch (error) {
      console.error('전체 저장 실패:', error);
      if (error instanceof Error) {
        alert(error.message);
      }
      setSaveFailed(true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddFile = () => {
    actions.createFile();
  };

  const handleDeleteFile = (fileId: string) => {
    if (files.length <= 1) return;
    const target = files.find(file => file.id === fileId);
    if (!target) return;
    const confirmed = window.confirm(t.codeEditor.confirmDeleteFile(target.name));
    if (confirmed) {
      actions.deleteFile(fileId);
    }
  };

  const handleRenameFile = (fileId: string, name: string) => {
    const nextName = window.prompt(t.codeEditor.renamePrompt, name);
    if (!nextName) return;
    actions.renameFile(fileId, nextName.trim());
  };

  const handleToggleActive = (fileId: string, current: boolean) => {
    actions.setFileActive(fileId, !current);
  };

  const currentCode = selectedFile
    ? (language === 'javascript' ? selectedFile.draftJavascript : selectedFile.draftCss)
    : '';

  const toggleFilePanel = () => setIsFilePanelOpen(prev => !prev);

  return (
    <div className={styles.container}>
      <aside className={`${styles.filePanel} ${!isFilePanelOpen ? styles.filePanelCollapsed : ''}`}>
        <button
          type="button"
          className={`${styles.collapseHandle}`}
          onClick={toggleFilePanel}
          title={isFilePanelOpen ? t.codeEditor.hideFileList : t.codeEditor.showFileList}
          aria-pressed={isFilePanelOpen}
        >
          {isFilePanelOpen ? <ChevronLeft size={24} /> : <ChevronRight size={24} />}
        </button>
        {isFilePanelOpen && (
          <>
            <div className={styles.filePanelHeader}>
              <div className={styles.listInfo}>
                <div className={styles.listTitleRow}>
                  <span className={styles.listTitle}>{t.codeEditor.fileListTitle}</span>
                  <span className={styles.listMeta}>{t.codeEditor.fileCount(files.length)}</span>
                </div>
                <div className={styles.fileStats} aria-live="polite">
                  {fileStatsLabel}
                </div>
              </div>
              <div className={styles.panelActions}>
                <button
                  type="button"
                  className={styles.plainButton}
                  onClick={handleAddFile}
                  title={t.codeEditor.addFileButton}
                >
                  <Plus size={14} />
                  <span>{t.codeEditor.addFileButton}</span>
                </button>
                <button
                  type="button"
                  className={styles.plainButton}
                  onClick={handleSaveAll}
                  disabled={!computed.hasUnsavedFiles || isSaving}
                >
                  <Save size={14} />
                  {t.codeEditor.saveAllButton}
                </button>
              </div>
            </div>
            <ul className={styles.fileList}>
              {files.map(file => {
                const isSelected = file.id === selectedFile?.id;
                const fileStateLabel = file.isActive ? t.codeEditor.fileStatus.active : t.codeEditor.fileStatus.inactive;
                return (
                  <li key={file.id} className={`${styles.fileItem} ${isSelected ? styles.selectedFile : ''}`}>
                    <button
                      type="button"
                      className={styles.fileMainButton}
                      onClick={() => actions.setSelectedFile(file.id)}
                    >
                      <span className={styles.fileStatusIcon}>
                        {file.isActive ? <CheckCircle size={14} /> : <Circle size={14} />}
                      </span>
                      <span className={styles.fileInfo}>
                        <span className={styles.fileNameRow}>
                          <span className={styles.fileName}>{file.name}</span>
                          {file.hasUnsavedChanges && (
                            <span
                              className={styles.unsavedDot}
                              title={t.codeEditor.badges.unsaved}
                              aria-hidden="true"
                            />
                          )}
                        </span>
                        <span
                          className={`${styles.fileStateLabel} ${file.isActive ? styles.fileStateActive : styles.fileStateInactive}`}
                        >
                          {fileStateLabel}
                        </span>
                      </span>
                    </button>
                    <div className={styles.fileActions}>
                      <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() => handleToggleActive(file.id, file.isActive)}
                        title={file.isActive ? t.codeEditor.deactivate : t.codeEditor.activate}
                      >
                        {file.isActive ? <Check size={12} /> : <Circle size={12} />}
                      </button>
                      <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() => handleRenameFile(file.id, file.name)}
                        title={t.codeEditor.rename}
                      >
                        <MoreVertical size={12} />
                      </button>
                      <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() => handleDeleteFile(file.id)}
                        title={t.codeEditor.delete}
                        disabled={files.length <= 1}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </aside>
      <div className={styles.mainColumn}>
        <div className={styles.mainHeader}>
          <div className={styles.fileSummary}>
            {selectedFile ? (
              <>
                <div className={styles.fileTitleRow}>
                  <span className={styles.fileTitle}>{selectedFile.name}</span>
                  <span
                    className={`${styles.badge} ${selectedFile.isActive ? styles.badgeActive : styles.badgeInactive}`}
                  >
                    {selectedFile.isActive ? t.codeEditor.fileStatus.active : t.codeEditor.fileStatus.inactive}
                  </span>
                  {selectedFile.hasUnsavedChanges && (
                    <span className={`${styles.badge} ${styles.badgeUnsaved}`}>
                      {t.codeEditor.badges.unsaved}
                    </span>
                  )}
                </div>
                <div className={styles.fileMetaRow}>
                  <span>{languageDescription}</span>
                  <span className={styles.metaDivider}>|</span>
                  <span>{selectedFile.hasUnsavedChanges ? t.codeEditor.meta.unsaved : t.codeEditor.meta.upToDate}</span>
                </div>
              </>
            ) : (
              <div className={styles.fileTitleRow}>{t.codeEditor.noFileSelected}</div>
            )}
          </div>
          <div className={styles.mainActions}>
            <div className={styles.languageSelector} role="group" aria-label={t.codeEditor.languageToggleLabel}>
              <button
                type="button"
                className={`${styles.languageButton} ${language === 'javascript' ? styles.languageButtonActive : ''}`}
                onClick={() => handleLanguageChange('javascript')}
                disabled={!selectedFile}
              >
                JavaScript
              </button>
              <button
                type="button"
                className={`${styles.languageButton} ${language === 'css' ? styles.languageButtonActive : ''}`}
                onClick={() => handleLanguageChange('css')}
                disabled={!selectedFile}
              >
                CSS
              </button>
            </div>
            <button
              type="button"
              className={`${styles.saveButton} ${isSaving ? styles.loading : ''}`}
              onClick={handleSave}
              disabled={!selectedFile || !selectedFile.hasUnsavedChanges || isSaving}
              title={selectedFile?.hasUnsavedChanges ? t.codeEditor.saveTooltip : t.codeEditor.noChangesTooltip}
            >
              {isSaving ? (
                <Loader2 size={14} className={styles.spinner} />
              ) : saveSuccess ? (
                <Check size={14} className={styles.successIcon} />
              ) : saveFailed ? (
                <X size={14} className={styles.failedIcon} />
              ) : (
                <Save size={14} />
              )}
              {t.codeEditor.saveButton}
            </button>
          </div>
        </div>
        <div className={styles.editorContainer}>
          {selectedFile ? (
            <CodeMirror
              value={currentCode}
              onChange={handleEditorChange}
              theme={'light'}
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
          ) : (
            <div className={styles.emptyState}>{t.codeEditor.noFileSelected}</div>
          )}
        </div>
      </div>
    </div>
  );
}
