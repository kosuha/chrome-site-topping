import { useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';
import aiService from '../services/aiService';
import codeAnalyzer from '../services/codeAnalyzer';
import { calculateChangeSummary } from '../utils/changeSummary';
import { ChatMessage, useAppContext } from '../contexts/AppContext';
import { applyLanguageStringToFiles, normaliseOrder, cloneFiles, filesToLanguageString } from '../utils/codeFiles';
import { SiteIntegrationService } from '../services/siteIntegration';

export default function useThreadSSE() {
  const { state, actions } = useAppContext();
  const eventSourceRef = useRef<EventSource | null>(null);
  const stateRef = useRef(state);
  const siteService = SiteIntegrationService.getInstance();

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!state.currentThreadId) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    const setupSSEConnection = async () => {
      const applyAssistantChanges = async (changes: any, messageId: string) => {
        if (!changes) return;

        const currentEditor = stateRef.current.editorCode;
        let nextEditor = {
          javascript: currentEditor.javascript,
          css: currentEditor.css,
        };

        let updatedFiles = cloneFiles(stateRef.current.codeFiles);
        const changeSummary: Record<string, { added: number; removed: number }> = {};

        const applyLanguageChange = (language: 'javascript' | 'css') => {
          const change = changes?.[language];
          if (!change?.diff) return;

          const fileId = typeof change.file_id === 'string' && change.file_id.trim() ? change.file_id.trim() : undefined;

          if (fileId) {
            const targetIndex = updatedFiles.findIndex(file => file.id === fileId);
            if (targetIndex === -1) {
              console.warn(`[AI Merge] 대상 파일(${fileId})을 찾을 수 없습니다.`);
              return;
            }

            const targetFile = updatedFiles[targetIndex];
            const currentCode = (language === 'javascript' ? targetFile.draftJavascript : targetFile.draftCss) || '';
            const patched = codeAnalyzer.applyDiffToCode(currentCode, change.diff);

            const nextFile = {
              ...targetFile,
              draftJavascript: language === 'javascript' ? patched : targetFile.draftJavascript,
              savedJavascript: language === 'javascript' ? patched : targetFile.savedJavascript,
              draftCss: language === 'css' ? patched : targetFile.draftCss,
              savedCss: language === 'css' ? patched : targetFile.savedCss,
              hasUnsavedChanges: false,
            };

            updatedFiles[targetIndex] = nextFile;

            const aggregated = filesToLanguageString(updatedFiles, language, true, true);
            changeSummary[language] = calculateChangeSummary(nextEditor[language], aggregated);
            nextEditor[language] = aggregated;
            updatedFiles = applyLanguageStringToFiles(updatedFiles, aggregated, language);
          } else {
            const merged = codeAnalyzer.intelligentMerge(
              {
                javascript: nextEditor.javascript,
                css: nextEditor.css,
              },
              { changes: { [language]: { diff: change.diff } } }
            );

            const mergedCode = merged[language];
            if (mergedCode !== undefined) {
              const newCode = mergedCode || '';
              changeSummary[language] = calculateChangeSummary(nextEditor[language], newCode);
              nextEditor[language] = newCode;
              updatedFiles = applyLanguageStringToFiles(updatedFiles, newCode, language);
            }
          }
        };

        applyLanguageChange('javascript');
        applyLanguageChange('css');

        const normalisedFiles = normaliseOrder(updatedFiles);

        const summaryPayload: any = {};
        if (changeSummary.javascript) summaryPayload.javascript = changeSummary.javascript;
        if (changeSummary.css) summaryPayload.css = changeSummary.css;

        if (Object.keys(summaryPayload).length === 0) {
          // 변경 사항이 감지되지 않은 경우에도 에디터 코드는 최신 상태로 유지
          if (nextEditor.javascript !== currentEditor.javascript) {
            actions.setEditorCode('javascript', nextEditor.javascript);
          }
          if (nextEditor.css !== currentEditor.css) {
            actions.setEditorCode('css', nextEditor.css);
          }
          actions.setLastAppliedChange(messageId, new Date());
          return;
        }

        actions.pushCodeHistory({
          files: cloneFiles(normalisedFiles),
          messageId,
          description: 'AI 자동 적용 완료 (SSE)',
          changeSummary: summaryPayload,
          isSuccessful: true,
        });

        if (nextEditor.javascript !== currentEditor.javascript) {
          actions.setEditorCode('javascript', nextEditor.javascript);
        }
        if (nextEditor.css !== currentEditor.css) {
          actions.setEditorCode('css', nextEditor.css);
        }

        actions.setLastAppliedChange(messageId, new Date());

        const siteCode = stateRef.current.selectedSiteCode;
        if (siteCode) {
          const serverSnapshot = stateRef.current.serverCode;
          try {
            const response = await siteService.saveDraftScript(siteCode, {
              draftScriptContent: nextEditor.javascript,
              draftCssContent: nextEditor.css,
            });
            actions.setServerCode(
              response.draft_script_content ?? nextEditor.javascript,
              response.draft_css_content ?? nextEditor.css,
              response.script_content ?? serverSnapshot.deployedScript ?? null,
              response.css_content ?? serverSnapshot.deployedCss ?? null,
            );
          } catch (error) {
            console.error('[SSE] AI 자동 저장 실패:', error);
          }
        }
      };

      try {
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        const sseUrl = `${aiService.getBaseUrl()}/api/v1/threads/${state.currentThreadId}/messages/status-stream?token=${session.access_token}`;
        const eventSource = new EventSource(sseUrl);
        eventSourceRef.current = eventSource;

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'heartbeat') return;

            const currentThreadId = stateRef.current.currentThreadId;
            if (!currentThreadId) return;

            if (data.type === 'status_update' && data.message_id) {
              const { message_id, status, message, metadata } = data;

              const currentThread = stateRef.current.chatThreads.find(t => t.id === currentThreadId);
              if (!currentThread) return;

              let messageIndex = currentThread.messages.findIndex(m => m.id === message_id);
              if (messageIndex === -1) {
                for (let i = currentThread.messages.length - 1; i >= 0; i--) {
                  const msg = currentThread.messages[i];
                  if (msg.type === 'assistant' && (msg.status === 'pending' || msg.status === 'in_progress' || (msg.content || '').trim() === '')) {
                    messageIndex = i;
                    break;
                  }
                }
              }

              const extractedChanges = metadata?.changes ?? null;

              if (messageIndex !== -1) {
                const base = currentThread.messages[messageIndex];
                const updatedMessage: ChatMessage = {
                  ...base,
                  id: message_id,
                  content: message || base.content,
                  status: (status === 'error' ? 'failed' : (status as 'pending' | 'in_progress' | 'completed' | 'failed')),
                  changes: extractedChanges || base.changes,
                  metadata: metadata ?? base.metadata,
                  cost_usd: (metadata && typeof metadata.token_usage?.total_cost_usd === 'number') ? metadata.token_usage.total_cost_usd : base.cost_usd,
                  ai_model: (metadata && metadata.token_usage?.model_name) ? metadata.token_usage.model_name : base.ai_model
                };
                actions.updateMessageInThread(currentThreadId, base.id, updatedMessage);

                if (status === 'completed' || status === 'error') {
                  actions.setAiLoading(false);
                  // 비용 차감이 있었으면 지갑 잔액 새로고침 요청 이벤트 발생
                  if (updatedMessage.cost_usd && updatedMessage.cost_usd > 0) {
                    window.dispatchEvent(new Event('SITE_TOPPING_REFRESH_WALLET'));
                  }
                }

                if (status === 'completed' && extractedChanges) {
                  setTimeout(() => {
                    applyAssistantChanges(extractedChanges, message_id).catch((e) => {
                      console.error('❌ SSE 자동 적용 실패:', e);
                    });
                  }, 100);
                }
              } else {
                if (status === 'completed' && message) {
                  const newAiMessage: ChatMessage = {
                    id: message_id,
                    type: 'assistant',
                    content: message,
                    timestamp: new Date(data.timestamp || Date.now()),
                    status: (status === 'error' ? 'failed' : (status as 'pending' | 'in_progress' | 'completed' | 'failed')),
                    changes: extractedChanges || undefined,
                    metadata: metadata,
                    cost_usd: (metadata && typeof metadata.token_usage?.total_cost_usd === 'number') ? metadata.token_usage.total_cost_usd : undefined,
                    ai_model: (metadata && metadata.token_usage?.model_name) ? metadata.token_usage.model_name : undefined
                  };
                  actions.addMessageToThread(currentThreadId, newAiMessage);
                  actions.setAiLoading(false);
                  if (newAiMessage.cost_usd && newAiMessage.cost_usd > 0) {
                    window.dispatchEvent(new Event('SITE_TOPPING_REFRESH_WALLET'));
                  }

                  if (extractedChanges) {
                    setTimeout(() => {
                      applyAssistantChanges(extractedChanges, message_id).catch((e) => {
                        console.error('❌ SSE 신규 메시지 적용 실패:', e);
                      });
                    }, 100);
                  }
                }
              }
            }
          } catch (error) {
            console.error('❌ SSE 메시지 파싱 실패:', error);
          }
        };

        eventSource.onerror = (error) => {
          console.error('❌ SSE 연결 오류:', error);
          setTimeout(() => {
            if (stateRef.current.currentThreadId && eventSourceRef.current === eventSource) {
              setupSSEConnection();
            }
          }, 3000);
        };
      } catch (error) {
        console.error('❌ SSE 설정 실패:', error);
      }
    };

    setupSSEConnection();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [state.currentThreadId]);
}
