import { useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';
import aiService from '../services/aiService';
import codeAnalyzer from '../services/codeAnalyzer';
import { calculateChangeSummary } from '../utils/changeSummary';
import { ChatMessage, useAppContext } from '../contexts/AppContext';

export default function useThreadSSE() {
  const { state, actions } = useAppContext();
  const eventSourceRef = useRef<EventSource | null>(null);
  const stateRef = useRef(state);

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
                  changes: extractedChanges || base.changes
                };
                actions.updateMessageInThread(currentThreadId, base.id, updatedMessage);

                if (status === 'completed' || status === 'error') {
                  actions.setAiLoading(false);
                }

                if (status === 'completed' && extractedChanges) {
                  const currentCodeObj = {
                    javascript: stateRef.current.editorCode.javascript,
                    css: stateRef.current.editorCode.css
                  };
                  setTimeout(() => {
                    try {
                      const mergedCode = codeAnalyzer.intelligentMerge(currentCodeObj, { changes: extractedChanges });
                      let changeSummary: any = {};
                      if (extractedChanges?.javascript) {
                        changeSummary.javascript = calculateChangeSummary(currentCodeObj.javascript, mergedCode.javascript || '');
                      }
                      if (extractedChanges?.css) {
                        changeSummary.css = calculateChangeSummary(currentCodeObj.css, mergedCode.css || '');
                      }
                      actions.pushCodeHistory({
                        javascript: mergedCode.javascript || '',
                        css: mergedCode.css || '',
                        messageId: message_id,
                        description: 'AI 자동 적용 완료 (SSE)',
                        changeSummary,
                        isSuccessful: true
                      });
                      actions.setEditorCode('javascript', mergedCode.javascript || '');
                      actions.setEditorCode('css', mergedCode.css || '');
                      actions.setLastAppliedChange(message_id, new Date());
                    } catch (e) {
                      console.error('❌ SSE 자동 적용 실패:', e);
                    }
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
                    changes: extractedChanges || undefined
                  };
                  actions.addMessageToThread(currentThreadId, newAiMessage);
                  actions.setAiLoading(false);

                  if (extractedChanges) {
                    const currentCodeObj = {
                      javascript: stateRef.current.editorCode.javascript,
                      css: stateRef.current.editorCode.css
                    };
                    setTimeout(() => {
                      try {
                        const mergedCode = codeAnalyzer.intelligentMerge(currentCodeObj, { changes: extractedChanges });
                        let changeSummary: any = {};
                        if (extractedChanges?.javascript) {
                          changeSummary.javascript = calculateChangeSummary(currentCodeObj.javascript, mergedCode.javascript || '');
                        }
                        if (extractedChanges?.css) {
                          changeSummary.css = calculateChangeSummary(currentCodeObj.css, mergedCode.css || '');
                        }
                        actions.pushCodeHistory({
                          javascript: mergedCode.javascript || '',
                          css: mergedCode.css || '',
                          messageId: message_id,
                          description: 'AI 자동 적용 완료 (SSE 신규)',
                          changeSummary,
                          isSuccessful: true
                        });
                        actions.setEditorCode('javascript', mergedCode.javascript || '');
                        actions.setEditorCode('css', mergedCode.css || '');
                        actions.setLastAppliedChange(message_id, new Date());
                      } catch (e) {
                        console.error('❌ SSE 신규 메시지 적용 실패:', e);
                      }
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
