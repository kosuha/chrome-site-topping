import React, { useState, useRef, useEffect } from 'react';
import { useAppContext, ChatMessage } from '../contexts/AppContext';
import ThreadManager from './ThreadManager';
import aiService from '../services/aiService';
import domExtractor from '../services/domExtractor';
import codeAnalyzer from '../services/codeAnalyzer';
import styles from '../styles/ChatTab.module.css';
import { ArrowUp, Loader, Paperclip, X, List, CirclePlus, Check, ChevronDown, ChevronUp, ArrowBigLeft, ArrowBigRight } from 'lucide-react';
import { calculateChangeSummary } from '../utils/changeSummary';

interface CodeBlock {
  language: string;
  code: string;
}

// 간단한 코드 변경사항 블럭 컴포넌트
function CodeChangeBlock({ 
  language, 
  code, 
  changeSummary, 
  isSuccessful = true
}: { 
  language: string;
  code: string;
  changeSummary?: string;
  isSuccessful?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  // diff 파싱 함수
  const parseDiffLines = (diffText: string) => {
    const lines = diffText.split('\n');
    return lines.map((line, index) => {
      if (line.startsWith('@@')) {
        return { type: 'header', content: line, key: `header-${index}` };
      } else if (line.startsWith('+')) {
        return { type: 'addition', content: line, key: `add-${index}` };
      } else if (line.startsWith('-')) {
        return { type: 'deletion', content: line, key: `del-${index}` };
      } else if (line.startsWith(' ') || line === '') {
        return { type: 'context', content: line, key: `ctx-${index}` };
      } else {
        return { type: 'normal', content: line, key: `norm-${index}` };
      }
    }).filter(line => line.content !== ''); // 빈 라인 제거
  };

  const diffLines = parseDiffLines(code);

  return (
    <div className={styles.codeChangeBlock}>
      <div 
        className={styles.codeChangeHeader}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className={styles.codeChangeIcon}>
          {isSuccessful ? (
            <Check size={12} strokeWidth={4} className={styles.successIcon} />
          ) : (
            <X size={12} strokeWidth={4} className={styles.errorIcon} />
          )}
        </div>
        <div className={styles.codeChangeContent}>
          <span className={styles.codeChangeTitle}>
            {language}
          </span>
          <span className={styles.codeChangeSummary}>
            <span className={styles.addition}>+{changeSummary?.split('−')[0]?.replace('+', '') || '0'}</span>
            {' '}
            <span className={styles.deletion}>−{changeSummary?.split('−')[1] || '0'}</span>
          </span>
        </div>
        <div className={styles.codeChangeExpand}>
          {isExpanded ? (
            <ChevronUp size={12} />
          ) : (
            <ChevronDown size={12} />
          )}
        </div>
      </div>
      
      {isExpanded && (
        <div className={styles.codeChangeDetails}>
          <div className={styles.codeChangeDetailsContent}>
            <div className={styles.diffContent}>
              {diffLines.map((line) => (
                <div key={line.key} className={`${styles.diffLine} ${styles[`diffLine${line.type.charAt(0).toUpperCase() + line.type.slice(1)}`]}`}>
                  {line.content}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// diff에서 변경사항 요약 계산
function calculateDiffSummary(diff: string): { added: number; removed: number } {
  const lines = diff.split('\n');
  let added = 0;
  let removed = 0;
  
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      added++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      removed++;
    }
  }
  
  return { added, removed };
}

function parseCodeBlocks(content: string): { text: string; codeBlocks: CodeBlock[] } {
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)\n```/g;
  const codeBlocks: CodeBlock[] = [];
  let text = content;
  let match;
  
  while ((match = codeBlockRegex.exec(content)) !== null) {
    const [fullMatch, language = 'text', code] = match;
    codeBlocks.push({ language, code: code.trim() });
    text = text.replace(fullMatch, `[코드 블록: ${language}]`);
  }
  
  return { text, codeBlocks };
}

function MessageComponent({ message }: { message: ChatMessage }) {
  const { state } = useAppContext();
  
  const { text } = parseCodeBlocks(message.content);
  
  // 현재 히스토리에서 이 메시지가 적용된 상태인지 확인
  const isMessageApplied = () => {
    if (!message.id) return false;
    
    // 히스토리 스택에서 이 메시지의 인덱스를 찾기
    const messageHistoryIndex = state.codeHistoryStack.findIndex(item => item.messageId === message.id);
    
    // 메시지가 히스토리에 없거나, 현재 히스토리 인덱스보다 뒤에 있으면 적용되지 않음
    if (messageHistoryIndex === -1 || messageHistoryIndex > state.currentHistoryIndex) {
      return false;
    }
    
    // 현재 히스토리 인덱스보다 앞이거나 같으면 적용됨
    return true;
  };
  
  // 메시지 변경사항이 성공적으로 적용되었는지 확인
  const isChangeSuccessful = () => {
    if (!message.id) return true; // 기본값은 성공
    const historyItem = state.codeHistoryStack.find(item => item.messageId === message.id);
    return historyItem?.isSuccessful ?? true;
  };
  
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('ko-KR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };
  
  return (
    <div className={`${styles.message} ${styles[message.type]}`}>
      <div className={`${styles.messageContent} ${styles[message.type]}`}>
        <div className={`${styles.messageBubble} ${styles[message.type]}`}>
          {text}
        </div>
        
        {/* 새로운 통합 diff 형식 처리 */}
        {message.changes && (
          <div className={styles.aiCodeSection}>
            {message.changes.javascript && (
              <CodeChangeBlock
                language="JavaScript"
                code={message.changes.javascript.diff}
                changeSummary={(() => {
                  const summary = calculateDiffSummary(message.changes.javascript!.diff);
                  return `+${summary.added} −${summary.removed}`;
                })()}
                isSuccessful={isMessageApplied() && isChangeSuccessful()}
              />
            )}
            
            {message.changes.css && (
              <CodeChangeBlock
                language="CSS"
                code={message.changes.css.diff}
                changeSummary={(() => {
                  const summary = calculateDiffSummary(message.changes.css!.diff);
                  return `+${summary.added} −${summary.removed}`;
                })()}
                isSuccessful={isMessageApplied() && isChangeSuccessful()}
              />
            )}
          </div>
        )}
        
        <div className={`${styles.messageTime} ${styles[message.type]}`}>
          {formatTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
}

function LoadingMessage() {
  return (
    <div className={styles.message}>
      <div className={styles.messageContent}>
        <div className={styles.loadingMessage}>
          AI가 응답을 생성하고 있습니다
          <div className={styles.loadingDots}>
            <div className={styles.loadingDot}></div>
            <div className={styles.loadingDot}></div>
            <div className={styles.loadingDot}></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ChatTab() {
  const { state, actions, computed } = useAppContext();
  const [showThreads, setShowThreads] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [loadingImages, setLoadingImages] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  useEffect(() => {
    scrollToBottom();
  }, [computed.currentMessages, state.isAiLoading]);
  
  // Handle image file selection
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    // Limit to 3 images total
    const remainingSlots = 3 - attachedImages.length;
    const filesToProcess = files.slice(0, remainingSlots);
    
    // Add loading states
    const loadingIds = filesToProcess.map((_, index) => `loading-${Date.now()}-${index}`);
    setLoadingImages(prev => [...prev, ...loadingIds]);
    
    // Process each file
    for (let i = 0; i < filesToProcess.length; i++) {
      const file = filesToProcess[i];
      try {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result as string;
          setAttachedImages(prev => [...prev, result]);
          setLoadingImages(prev => prev.filter(id => id !== loadingIds[i]));
        };
        reader.readAsDataURL(file);
      } catch (error) {
        console.error('이미지 로딩 실패:', error);
        setLoadingImages(prev => prev.filter(id => id !== loadingIds[i]));
      }
    }
    
    // Clear file input
    if (e.target) e.target.value = '';
  };
  
  // Handle drag and drop
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };
  
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
    if (files.length === 0) return;
    
    // Process dropped files directly
    const remainingSlots = 3 - attachedImages.length;
    const filesToProcess = files.slice(0, remainingSlots);
    
    // Add loading states
    const loadingIds = filesToProcess.map((_, index) => `loading-${Date.now()}-${index}`);
    setLoadingImages(prev => [...prev, ...loadingIds]);
    
    // Process each file
    for (let i = 0; i < filesToProcess.length; i++) {
      const file = filesToProcess[i];
      try {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result as string;
          setAttachedImages(prev => [...prev, result]);
          setLoadingImages(prev => prev.filter(id => id !== loadingIds[i]));
        };
        reader.readAsDataURL(file);
      } catch (error) {
        console.error('이미지 로딩 실패:', error);
        setLoadingImages(prev => prev.filter(id => id !== loadingIds[i]));
      }
    }
  };
  
  const handleSendMessage = async () => {
    if ((!inputValue.trim() && attachedImages.length === 0) || state.isAiLoading || loadingImages.length > 0) return;
    
    // 현재 스레드 ID 확보
    let currentThreadId = state.currentThreadId;
    
    // 현재 스레드가 없거나 빈 문자열이면 새로 생성
    if (!currentThreadId || currentThreadId.trim() === '') {
      try {
        console.log('🆕 새 스레드 생성 시도');
        const response = await aiService.createThread();
        console.log('🆕 스레드 생성 응답:', response);
        
        if (response.status === 'success') {
          const threadId = response.data.threadId || response.data.id;
          if (!threadId) {
            throw new Error('서버에서 스레드 ID를 반환하지 않았습니다');
          }
          
          const newThread = {
            id: threadId,
            title: response.data.title || '새 대화',
            messages: [],
            createdAt: new Date(response.data.created_at || Date.now()),
            updatedAt: new Date(response.data.updated_at || Date.now()),
          };
          
          console.log('🆕 새 스레드 생성 완료:', newThread.id);
          actions.addServerThread(newThread);
          actions.setCurrentThread(newThread.id);
          currentThreadId = newThread.id;
        } else {
          throw new Error('스레드 생성 실패');
        }
      } catch (error) {
        console.error('새 스레드 생성 실패:', error);
        return; // 스레드 생성 실패 시 메시지 전송 중단
      }
    }
    
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue.trim(),
      timestamp: new Date()
    };
    
    if (!currentThreadId) {
      console.error('❌ 스레드 ID가 없습니다');
      actions.setAiLoading(false);
      return;
    }
    
    actions.addMessageToThread(currentThreadId, userMessage);
    setInputValue('');
    setAttachedImages([]);
    actions.setAiLoading(true);
    
    // Clear the contentEditable div
    if (textareaRef.current) {
      textareaRef.current.textContent = '';
    }
    
    try {
      // 현재 페이지 컨텍스트 생성 (DOM 구조 + 사용자 코드)
      const pageContext = domExtractor.createFullContext(
        state.editorCode.javascript,
        state.editorCode.css
      );
      
      // 디버깅을 위한 로그
      console.log('💬 메시지 전송 시도:', {
        threadId: currentThreadId,
        message: userMessage.content,
        hasJavaScript: !!state.editorCode.javascript.trim(),
        hasCss: !!state.editorCode.css.trim(),
        attachedImages: attachedImages.length,
        contextLength: pageContext.length
      });
      
      // 현재 사이트 코드 가져오기
      const siteCode = await aiService.getCurrentSiteCode();
      
      // AI API 호출
      const response = await aiService.sendChatMessage(
        userMessage.content,
        currentThreadId,
        {
          pageContext: pageContext,
          userCode: {
            javascript: state.editorCode.javascript,
            css: state.editorCode.css
          },
          pageUrl: window.location.href,
          domInfo: domExtractor.extractPageDOM()
        }, // metadata
        siteCode || undefined, // siteCode
        false, // autoDeploy
        attachedImages.length > 0 ? attachedImages : undefined
      );

      console.log('🤖 AI 응답 수신:', response);
      console.log('📋 응답 상세 정보:');
      console.log('- response.status:', response.status);
      console.log('- response.data:', response.data);
      console.log('- response.data?.ai_message:', response.data?.ai_message);
      
      // 서버 응답 구조 처리: { status, data: { ai_message, user_message }, message }
      if (response.status === 'success' && response.data?.ai_message) {
        const assistantMsg = response.data.ai_message;
        console.log('🔍 AI 메시지 상세:');
        console.log('- assistantMsg:', assistantMsg);
        console.log('- assistantMsg.message:', assistantMsg.message);
        console.log('- assistantMsg.message 타입:', typeof assistantMsg.message);
        console.log('- assistantMsg.message 길이:', assistantMsg.message?.length);
        console.log('- assistantMsg.code:', assistantMsg.code);
        console.log('- assistantMsg.codeAction:', assistantMsg.codeAction);
        console.log('- assistantMsg.metadata:', assistantMsg.metadata);
        
        // 새로운 통합 changes 형식 처리
        let extractedChanges = null;
        let extractedMessage = assistantMsg.message;
        
        console.log('🔍 AI 메시지 원본:', extractedMessage);
        
        // 1. 메시지에서 JSON 형식 파싱 (우선순위)
        if (extractedMessage) {
          try {
            // 마크다운 코드 블록에서 JSON 추출
            const codeBlockMatch = extractedMessage.match(/```json\s*\n([\s\S]*?)\n```/);
            if (codeBlockMatch) {
              const jsonContent = codeBlockMatch[1];
              const parsedResponse = JSON.parse(jsonContent);
              if (parsedResponse.changes) {
                extractedChanges = parsedResponse.changes;
                extractedMessage = parsedResponse.message || extractedMessage;
                console.log('📦 마크다운 코드블록에서 changes 추출:', extractedChanges);
              }
            }
            // 전체 메시지가 JSON인지 확인
            else if (extractedMessage.trim().startsWith('{') && extractedMessage.trim().endsWith('}')) {
              const parsedResponse = JSON.parse(extractedMessage);
              if (parsedResponse.changes) {
                extractedChanges = parsedResponse.changes;
                extractedMessage = parsedResponse.message || extractedMessage;
                console.log('📦 전체 JSON에서 changes 추출:', extractedChanges);
              }
            } else {
              // JSON 블록 찾기
              const jsonMatch = extractedMessage.match(/\{[\s\S]*"changes"[\s\S]*\}/);
              if (jsonMatch) {
                const parsedResponse = JSON.parse(jsonMatch[0]);
                if (parsedResponse.changes) {
                  extractedChanges = parsedResponse.changes;
                  extractedMessage = parsedResponse.message || extractedMessage;
                  console.log('📦 메시지에서 changes 추출:', extractedChanges);
                }
              }
            }
          } catch (error) {
            console.warn('JSON 파싱 실패:', error);
            console.log('파싱 실패한 메시지:', extractedMessage);
          }
        }
        
        // 2. 직접 changes 필드 확인 (백업)
        if (!extractedChanges && assistantMsg.changes) {
          extractedChanges = assistantMsg.changes;
          console.log('📦 직접 changes 필드 발견:', extractedChanges);
        }
        
        // 3. 메타데이터에서 changes 추출 (백업)
        if (!extractedChanges && assistantMsg.metadata) {
          try {
            const metadata = typeof assistantMsg.metadata === 'string' 
              ? JSON.parse(assistantMsg.metadata) 
              : assistantMsg.metadata;
            
            if (metadata.changes) {
              extractedChanges = metadata.changes;
              console.log('📦 메타데이터에서 changes 추출:', extractedChanges);
            }
          } catch (error) {
            console.warn('메타데이터 파싱 실패:', error);
          }
        }
        
        const aiMessage: ChatMessage = {
          id: assistantMsg.id || (Date.now() + 1).toString(),
          type: 'assistant',
          content: extractedMessage || '응답을 받지 못했습니다',
          timestamp: new Date(assistantMsg.created_at || Date.now()),
          changes: extractedChanges // 새로운 changes 필드
        };
        
        console.log('📝 생성된 ChatMessage:');
        console.log('- aiMessage.content:', aiMessage.content);
        console.log('- aiMessage.content 길이:', aiMessage.content.length);
        console.log('- aiMessage.changes:', aiMessage.changes);
        
        // 디버깅: changes가 있는지 확인
        if (aiMessage.changes) {
          console.log('🎯 changes가 포함된 메시지입니다!');
          console.log('- JavaScript diff 있음:', !!aiMessage.changes.javascript?.diff);
          console.log('- CSS diff 있음:', !!aiMessage.changes.css?.diff);
          if (aiMessage.changes.javascript?.diff) {
            console.log('- JavaScript diff:', aiMessage.changes.javascript.diff);
          }
          if (aiMessage.changes.css?.diff) {
            console.log('- CSS diff:', aiMessage.changes.css.diff);
          }
        } else {
          console.log('⚠️ 코드가 없는 메시지입니다');
        }
        
        actions.addMessageToThread(currentThreadId!, aiMessage);
        
        // AI가 코드 변경사항을 제안한 경우 자동으로 적용
        if (aiMessage.changes) {
          console.log('🚀 AI 코드 변경사항 자동 적용 시작');
          
          // 현재 에디터 코드 백업
          const currentCodeObj = {
            javascript: state.editorCode.javascript,
            css: state.editorCode.css
          };
          
          // setTimeout으로 잠시 후에 적용 (메시지가 UI에 표시된 후)
          setTimeout(() => {
            try {
              const mergedCode = codeAnalyzer.intelligentMerge(currentCodeObj, { changes: aiMessage.changes });
              
              // 변경사항 요약 계산
              let changeSummary: any = {};
              if (aiMessage.changes?.javascript) {
                changeSummary.javascript = calculateChangeSummary(
                  currentCodeObj.javascript,
                  mergedCode.javascript || ''
                );
              }
              if (aiMessage.changes?.css) {
                changeSummary.css = calculateChangeSummary(
                  currentCodeObj.css,
                  mergedCode.css || ''
                );
              }
              
              // 변경 후 코드를 히스토리에 저장 (앞으로가기 용)
              actions.pushCodeHistory({
                javascript: mergedCode.javascript || '',
                css: mergedCode.css || '',
                messageId: aiMessage.id,
                description: 'AI 자동 적용 완료',
                changeSummary,
                isSuccessful: true
              });
              
              // 에디터에 적용
              actions.setEditorCode('javascript', mergedCode.javascript || '');
              actions.setEditorCode('css', mergedCode.css || '');
              
              // 변경사항을 마지막 적용 변경으로 저장
              actions.setLastAppliedChange(aiMessage.id, new Date());
              
              console.log('✅ AI 코드 변경사항 자동 적용 완료');
            } catch (error) {
              console.error('❌ 자동 적용 실패:', error);
            }
          }, 100);
        }
        
        // 스크립트 업데이트가 있는 경우 메타데이터 처리
        if (assistantMsg.metadata?.script_updates) {
          // 필요시 코드 에디터에 자동 적용하는 로직 추가
          console.log('스크립트 업데이트:', assistantMsg.metadata.script_updates);
        }
      } else {
        console.error('❌ AI 응답 데이터 구조 오류:', response);
        throw new Error('AI 응답 데이터가 올바르지 않습니다');
      }
      
      actions.setAiLoading(false);
    } catch (error) {
      console.error('AI 응답 오류:', error);
      
      // 에러 메시지를 사용자에게 표시
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: `죄송합니다. AI 응답을 생성하는 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
        timestamp: new Date()
      };
      
      if (currentThreadId) {
        actions.addMessageToThread(currentThreadId, errorMessage);
      }
      actions.setAiLoading(false);
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !(e.nativeEvent as any).isComposing) {
      e.preventDefault();
      handleSendMessage();
    }
  };
  
  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    const text = e.currentTarget.textContent || '';
    setInputValue(text.slice(0, 2000));
  };
  
  const handleThreadSelect = () => {
    setShowThreads(false);
  };

  const handleNewThread = () => {
    setShowThreads(false);
  };

  if (showThreads) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <button 
            className={styles.backButton}
            onClick={() => setShowThreads(false)}
          >
            ← 뒤로
          </button>
          <h3 className={styles.title}>대화 목록</h3>
        </div>
        <ThreadManager 
          onThreadSelect={handleThreadSelect}
          onNewThread={handleNewThread}
        />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>
          AI 채팅
        </h3>
        <div className={styles.headerActions}>
          {/* 코드 히스토리 네비게이션 */}
          <div className={styles.historyControls}>
            <button
              className={`${styles.historyButton} ${state.currentHistoryIndex <= 0 ? styles.disabled : ''}`}
              onClick={() => actions.goBackHistory()}
              disabled={state.currentHistoryIndex <= 0}
              title="코드 변경 이전으로"
            >
              <ArrowBigLeft size={14} />
            </button>
            <button
              className={`${styles.historyButton} ${state.currentHistoryIndex >= state.codeHistoryStack.length - 1 ? styles.disabled : ''}`}
              onClick={() => actions.goForwardHistory()}
              disabled={state.currentHistoryIndex >= state.codeHistoryStack.length - 1}
              title="코드 변경 이후로"
            >
              <ArrowBigRight size={14} />
            </button>
          </div>
          
          <button
            className={styles.threadButton}
            onClick={() => setShowThreads(true)}
            title="대화 목록"
          >
            <List size={16} />
          </button>
          <button
            className={styles.newChatButton}
            onClick={() => {
              // 현재 스레드 해제 - 다음 메시지 전송 시 새 스레드 생성됨
              actions.setCurrentThread('');
            }}
            title="새 채팅"
          >
            <CirclePlus size={16} />
          </button>
        </div>
      </div>
      
      <div className={styles.chatContainer}>
        <div className={styles.messagesArea}>
          {computed.currentMessages.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyStateIcon}>💬</div>
              <div className={styles.emptyStateText}>AI와 채팅을 시작하세요</div>
              <div className={styles.emptyStateSubtext}>
                코드 생성, 수정, 설명 등 다양한 도움을 받을 수 있습니다
              </div>
            </div>
          ) : (
            <>
              {computed.currentMessages.map((message) => (
                <MessageComponent key={message.id} message={message} />
              ))}
              {state.isAiLoading && <LoadingMessage />}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>
        
        <div className={styles.inputArea}>
          {/* Main Input Container */}
          <div 
            className={`${styles.inputMainContainer} ${
              isDragOver ? styles.dragOver : ''
            }`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <div className={styles.inputContent}>
              {/* Drag Overlay */}
              {isDragOver && (
                <div className={styles.dragOverlay}>
                  <div className={styles.dragOverlayContent}>
                    <div className={styles.dragOverlayText}>이미지를 여기에 드롭하세요</div>
                    <div className={styles.dragOverlaySubtext}>최대 3개까지 첨부 가능합니다</div>
                  </div>
                </div>
              )}
              
              {/* Attached Images Preview */}
              {(attachedImages.length > 0 || loadingImages.length > 0) && (
                <div className={styles.imagesPreview}>
                  <div className={styles.imagesGrid}>
                    {/* Actual Images */}
                    {attachedImages.map((imageData, index) => (
                      <div key={`image-${index}`} className={styles.imagePreviewItem}>
                        <img 
                          src={imageData} 
                          alt={`첨부된 이미지 ${index + 1}`} 
                          className={styles.imagePreview}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setAttachedImages(prev => prev.filter((_, i) => i !== index));
                          }}
                          className={styles.imageRemoveButton}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    
                    {/* Loading Skeletons */}
                    {loadingImages.map((_, index) => (
                      <div key={`loading-${index}`} className={styles.imagePreviewItem}>
                        <div className={styles.imageLoadingSkeleton}>
                          <Loader size={12} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Text Input Area */}
              <div className={styles.textInputContainer}>
                <div className={styles.textInputWrapper}>
                  <div
                    ref={textareaRef}
                    contentEditable
                    suppressContentEditableWarning
                    onInput={handleInput}
                    onKeyDown={handleKeyDown}
                    className={styles.textInputEditable}
                    data-placeholder="AI에게 질문하거나 코드 작성을 요청해보세요..."
                  />
                </div>
              </div>

              {/* Bottom Controls */}
              <div className={styles.bottomControls}>
                <div className={styles.controlsLeft}>
                  {/* Image Attachment Button */}
                  <div className={styles.attachButtonContainer}>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImageSelect}
                      className={styles.hiddenFileInput}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className={`${styles.attachButton} ${
                        attachedImages.length > 0 ? styles.attachButtonActive : ''
                      }`}
                    >
                      <Paperclip size={16} />
                    </button>
                  </div>
                </div>

                {/* Send Button */}
                <div className={styles.controlsRight}>
                  <button
                    type="button"
                    onClick={handleSendMessage}
                    disabled={(!inputValue.trim() && attachedImages.length === 0) || state.isAiLoading || loadingImages.length > 0}
                    className={styles.sendButton}
                  >
                    <ArrowUp size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}