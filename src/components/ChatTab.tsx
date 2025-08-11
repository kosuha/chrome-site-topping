import React, { useState, useRef, useEffect } from 'react';
import { useAppContext, ChatMessage } from '../contexts/AppContext';
import ThreadManager from './ThreadManager';
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
        // 빈 스레드가 없으면 새로 생성
        actions.createNewThread();
        currentThreadId = state.chatThreads[0]?.id || Date.now().toString();
      }
    }
    
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue.trim(),
      timestamp: new Date()
    };
    
    actions.addMessageToThread(currentThreadId, userMessage);
    setInputValue('');
    setAttachedImages([]);
    actions.setAiLoading(true);
    
    // Clear the contentEditable div
    if (textareaRef.current) {
      textareaRef.current.textContent = '';
    }
    
    try {
      // TODO: 실제 AI API 호출로 대체
      setTimeout(() => {
        const aiMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          content: '안녕하세요! AI 채팅 기능이 준비 중입니다. 곧 코드 생성 및 수정 기능을 제공할 예정입니다.\n\n```javascript\nconsole.log("Hello from AI!");\n```',
          timestamp: new Date()
        };
        actions.addMessageToThread(currentThreadId, aiMessage);
        actions.setAiLoading(false);
      }, 2000);
    } catch (error) {
      console.error('AI 응답 오류:', error);
      actions.setError('AI 응답을 가져오는 중 오류가 발생했습니다.');
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
            onClick={() => actions.createNewThread()}
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