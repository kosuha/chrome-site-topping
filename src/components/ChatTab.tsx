import React, { useState, useRef, useEffect } from 'react';
import { useAppContext, ChatMessage } from '../contexts/AppContext';
import ThreadManager from './ThreadManager';
import aiService from '../services/aiService';
import styles from '../styles/ChatTab.module.css';
import { ArrowUp, Loader, Paperclip, X, List, CirclePlus } from 'lucide-react';

interface CodeBlock {
  language: string;
  code: string;
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
  const { actions } = useAppContext();
  const [copiedStates, setCopiedStates] = useState<Record<number, boolean>>({});
  
  const { text, codeBlocks } = parseCodeBlocks(message.content);
  
  const handleCopyCode = async (code: string, index: number) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedStates(prev => ({ ...prev, [index]: true }));
      setTimeout(() => {
        setCopiedStates(prev => ({ ...prev, [index]: false }));
      }, 2000);
    } catch (err) {
      console.error('클립보드 복사 실패:', err);
    }
  };
  
  const handleApplyCode = (language: string, code: string) => {
    if (language === 'javascript' || language === 'js') {
      actions.setEditorCode('javascript', code);
    } else if (language === 'css') {
      actions.setEditorCode('css', code);
    }
    actions.setActiveTab('code');
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
        {codeBlocks.length > 0 && (
          <div>
            {codeBlocks.map((block, index) => (
              <div key={index} className={styles.codeBlock}>
                <div className={styles.codeHeader}>
                  <span className={styles.codeLanguage}>{block.language}</span>
                  <div>
                    <button 
                      className={`${styles.copyButton} ${copiedStates[index] ? styles.copied : ''}`}
                      onClick={() => handleCopyCode(block.code, index)}
                    >
                      {copiedStates[index] ? '✓ 복사됨' : '복사'}
                    </button>
                    {(block.language === 'javascript' || block.language === 'js' || block.language === 'css') && (
                      <button 
                        className={styles.applyButton}
                        onClick={() => handleApplyCode(block.language, block.code)}
                      >
                        에디터에 적용
                      </button>
                    )}
                  </div>
                </div>
                <pre>{block.code}</pre>
              </div>
            ))}
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
    
    // 현재 스레드가 없거나 비어있지 않으면 빈 스레드 찾기 또는 새로 생성
    let currentThreadId = state.currentThreadId;
    if (!currentThreadId) {
      // 빈 스레드(메시지가 없는 스레드) 찾기
      const emptyThread = state.chatThreads.find(thread => thread.messages.length === 0);
      if (emptyThread) {
        actions.setCurrentThread(emptyThread.id);
        currentThreadId = emptyThread.id;
      } else {
        // 빈 스레드가 없으면 서버를 통해 새로 생성
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
      // 디버깅을 위한 로그
      console.log('💬 메시지 전송 시도:', {
        threadId: currentThreadId,
        message: userMessage.content,
        attachedImages: attachedImages.length
      });
      
      // AI API 호출
      const response = await aiService.sendChatMessage(
        userMessage.content,
        currentThreadId,
        undefined, // metadata
        undefined, // siteCode - 나중에 현재 도메인 기반으로 설정
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
        
        const aiMessage: ChatMessage = {
          id: assistantMsg.id || (Date.now() + 1).toString(),
          type: 'assistant',
          content: assistantMsg.message || '응답을 받지 못했습니다',
          timestamp: new Date(assistantMsg.created_at || Date.now())
        };
        
        console.log('📝 생성된 ChatMessage:');
        console.log('- aiMessage.content:', aiMessage.content);
        console.log('- aiMessage.content 길이:', aiMessage.content.length);
        
        actions.addMessageToThread(currentThreadId!, aiMessage);
        
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
          <button
            className={styles.threadButton}
            onClick={() => setShowThreads(true)}
            title="대화 목록"
          >
            <List size={16} />
          </button>
          <button
            className={styles.newChatButton}
            onClick={async () => {
              try {
                const response = await aiService.createThread();
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
                  
                  actions.addServerThread(newThread);
                  actions.setCurrentThread(newThread.id);
                } else {
                  // 에러 시 로컬에서만 생성
                  actions.createNewThread();
                }
              } catch (error) {
                console.error('새 스레드 생성 실패:', error);
                // 에러 시 로컬에서만 생성
                actions.createNewThread();
              }
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