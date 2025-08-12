import { useRef, useState } from 'react';

export default function useImageAttachments() {
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [loadingImages, setLoadingImages] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const remainingSlots = 3 - attachedImages.length;
    const filesToProcess = files.slice(0, remainingSlots);

    const loadingIds = filesToProcess.map((_, index) => `loading-${Date.now()}-${index}`);
    setLoadingImages((prev) => [...prev, ...loadingIds]);

    for (let i = 0; i < filesToProcess.length; i++) {
      const file = filesToProcess[i];
      try {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const result = ev.target?.result as string;
          setAttachedImages((prev) => [...prev, result]);
          setLoadingImages((prev) => prev.filter((id) => id !== loadingIds[i]));
        };
        reader.readAsDataURL(file);
      } catch (error) {
        console.error('이미지 로딩 실패:', error);
        setLoadingImages((prev) => prev.filter((id) => id !== loadingIds[i]));
      }
    }

    if (e.target) e.target.value = '';
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files).filter((file) => file.type.startsWith('image/'));
    if (files.length === 0) return;

    const remainingSlots = 3 - attachedImages.length;
    const filesToProcess = files.slice(0, remainingSlots);

    const loadingIds = filesToProcess.map((_, index) => `loading-${Date.now()}-${index}`);
    setLoadingImages((prev) => [...prev, ...loadingIds]);

    for (let i = 0; i < filesToProcess.length; i++) {
      const file = filesToProcess[i];
      try {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const result = ev.target?.result as string;
          setAttachedImages((prev) => [...prev, result]);
          setLoadingImages((prev) => prev.filter((id) => id !== loadingIds[i]));
        };
        reader.readAsDataURL(file);
      } catch (error) {
        console.error('이미지 로딩 실패:', error);
        setLoadingImages((prev) => prev.filter((id) => id !== loadingIds[i]));
      }
    }
  };

  return {
    attachedImages,
    loadingImages,
    isDragOver,
    fileInputRef,
    setAttachedImages,
    setLoadingImages,
    setIsDragOver,
    handleImageSelect,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
  } as const;
}
