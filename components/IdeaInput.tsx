import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, 
  Sparkles, 
  Film, 
  Image as ImageIcon, 
  Video, 
  FileText, 
  UploadCloud, 
  FileType,
  X,
  ChevronLeft,
  ChevronRight,
  Play,
  Trash2,
  ListVideo
} from 'lucide-react';
import { Button } from './Button';
import { generateIdeaFromMedia, parseDocumentToScript } from '../services/geminiService';
import { StoryboardData } from '../types';

interface IdeaInputProps {
  onSubmit: (idea: string, shotCount: number) => void;
  onScriptUpload: (data: any) => void;
  isLoading: boolean;
  modelName?: string;
}

interface MediaItem {
  id: string;
  file: File;
  previewUrl: string;
  type: 'image' | 'video';
}

export const IdeaInput: React.FC<IdeaInputProps> = ({ onSubmit, onScriptUpload, isLoading, modelName = 'AI' }) => {
  const [input, setInput] = useState('');
  const [shotCount, setShotCount] = useState(12); // Default to 12 shots
  const [progress, setProgress] = useState(0);
  const [isAnalyzingMedia, setIsAnalyzingMedia] = useState(false);
  const [isParsingScript, setIsParsingScript] = useState(false);
  const [mediaQueue, setMediaQueue] = useState<MediaItem[]>([]);
  
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const scriptInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let interval: number;
    if (isLoading) {
      setProgress(0);
      // Gemini 3.0 Flash is fast. Target ~10-15s max.
      interval = window.setInterval(() => {
        setProgress((prev) => {
          // Very fast start
          if (prev < 40) return prev + 3; 
          // Steady
          if (prev < 80) return prev + 1;
          // Finish line
          if (prev < 98) return prev + 0.2;
          return prev;
        });
      }, 200);
    } else {
      setProgress(0);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  // Clean up object URLs to avoid memory leaks
  useEffect(() => {
    return () => {
      mediaQueue.forEach(item => URL.revokeObjectURL(item.previewUrl));
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSubmit(input, shotCount);
    }
  };

  const shotOptions = [4, 8, 12, 16, 20, 24, 28, 32, 36, 40];

  // Handle Media Select (Batch)
  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newItems: MediaItem[] = Array.from(files).map((item, idx) => {
      const file = item as File;
      return {
        id: `${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 9)}`,
        file: file,
        previewUrl: URL.createObjectURL(file),
        type: file.type.startsWith('video/') ? 'video' : 'image'
      };
    });

    setMediaQueue(prev => [...prev, ...newItems]);
    // Reset value to allow selecting same file again if needed (though usually not needed for batch)
    e.target.value = '';
  };

  const handleRemoveMedia = (id: string) => {
    setMediaQueue(prev => {
      const itemToRemove = prev.find(item => item.id === id);
      if (itemToRemove) {
        URL.revokeObjectURL(itemToRemove.previewUrl);
      }
      return prev.filter(item => item.id !== id);
    });
  };

  const handleMoveMedia = (index: number, direction: 'left' | 'right') => {
    if (direction === 'left' && index > 0) {
      setMediaQueue(prev => {
        const newQueue = [...prev];
        [newQueue[index - 1], newQueue[index]] = [newQueue[index], newQueue[index - 1]];
        return newQueue;
      });
    } else if (direction === 'right' && index < mediaQueue.length - 1) {
      setMediaQueue(prev => {
        const newQueue = [...prev];
        [newQueue[index], newQueue[index + 1]] = [newQueue[index + 1], newQueue[index]];
        return newQueue;
      });
    }
  };

  const handleAnalyzeBatch = async () => {
    if (mediaQueue.length === 0) return;
    setIsAnalyzingMedia(true);

    try {
      // Convert all files to base64
      const promises = mediaQueue.map(item => {
        return new Promise<{data: string, mimeType: string}>((resolve, reject) => {
           const reader = new FileReader();
           reader.onloadend = () => {
             const base64String = (reader.result as string).split(',')[1];
             resolve({ data: base64String, mimeType: item.file.type });
           };
           reader.onerror = reject;
           reader.readAsDataURL(item.file);
        });
      });

      const mediaItems = await Promise.all(promises);
      const description = await generateIdeaFromMedia(mediaItems);

      setInput(prev => {
        const prefix = prev ? prev + "\n\n[参考灵感分析]: " : "[参考灵感分析]: ";
        return prefix + description;
      });

    } catch (error) {
      console.error("Failed to analyze media batch", error);
      alert("媒体分析失败，请检查文件大小或网络连接。");
    } finally {
      setIsAnalyzingMedia(false);
    }
  };

  // Handle Script Upload (JSON / PDF / TXT)
  const handleScriptFileLoad = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const fileType = file.type;
    const isJson = fileType === 'application/json' || file.name.endsWith('.json');
    const isPdf = fileType === 'application/pdf';
    const isText = fileType === 'text/plain' || file.name.endsWith('.txt') || file.name.endsWith('.md');

    if (isJson) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const json = JSON.parse(event.target?.result as string);
          if ((json.script && json.groups && json.settings) || (json.storyboard && json.storyboard.script)) {
            onScriptUpload(json);
          } else {
            alert("JSON 格式不正确：缺少必要的分镜数据字段。");
          }
        } catch (err) {
          console.error("Invalid JSON", err);
          alert("无法解析 JSON 文件，请确保文件内容正确。");
        }
      };
      reader.readAsText(file);
    } else if (isPdf || isText) {
      setIsParsingScript(true);
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = (reader.result as string).split(',')[1];
        try {
          const mimeToSend = isPdf ? 'application/pdf' : 'text/plain';
          const data = await parseDocumentToScript(base64String, mimeToSend, shotCount);
          onScriptUpload(data);
        } catch (error) {
          console.error("Failed to parse document", error);
          alert("文档解析失败。请确保上传的是可读的 PDF 或文本文件。");
        } finally {
          setIsParsingScript(false);
        }
      };
      reader.readAsDataURL(file);
    } else {
      alert("不支持的文件格式。请上传 JSON, PDF, TXT 或 MD 文件。");
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6 flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="mb-8 p-4 bg-brand-500/10 rounded-full">
        <Sparkles className="w-12 h-12 text-brand-500" />
      </div>
      <h1 className="text-4xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
        AI 视频导演
      </h1>
      <p className="text-gray-400 mb-8 max-w-lg">
        输入您的创意想法，或上传媒体文件反推灵感。
        <br />
        <span className="text-xs text-gray-500">支持直接上传 PDF/文本脚本进行结构化解析，或导入项目文件</span>
      </p>
      
      <form onSubmit={handleSubmit} className="w-full relative flex flex-col gap-4">
        {/* Controls Bar: Shot Count & Uploads */}
        <div className="flex flex-wrap justify-center gap-4">
          <div className="flex items-center gap-3 bg-gray-900 border border-gray-700 rounded-full px-4 py-2 shadow-lg">
            <Film className="w-4 h-4 text-brand-500" />
            <span className="text-sm text-gray-300 font-medium">生成镜头数:</span>
            <select
              value={shotCount}
              onChange={(e) => setShotCount(Number(e.target.value))}
              disabled={isLoading || isAnalyzingMedia || isParsingScript}
              className="bg-gray-800 text-white text-sm rounded border-none focus:ring-2 focus:ring-brand-500 py-1 pl-2 pr-8 cursor-pointer hover:bg-gray-750 transition-colors"
            >
              {shotOptions.map(num => (
                <option key={num} value={num}>{num} 个镜头</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
             {/* Hidden File Inputs */}
             <input 
               type="file" 
               ref={mediaInputRef}
               className="hidden"
               accept="image/*,video/*"
               multiple // Allow multiple files
               onChange={handleMediaSelect}
             />
             <input 
               type="file" 
               ref={scriptInputRef}
               className="hidden"
               accept=".json,application/json,application/pdf,text/plain,.txt,.md"
               onChange={handleScriptFileLoad}
             />

             {/* Upload Trigger */}
             <button
                type="button"
                onClick={() => mediaInputRef.current?.click()}
                disabled={isLoading || isAnalyzingMedia || isParsingScript}
                className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-full px-4 py-2 text-sm text-gray-300 transition-colors disabled:opacity-50"
                title="上传图片或视频反推灵感（支持多选）"
             >
                <div className="flex gap-1">
                  <ImageIcon className="w-4 h-4 text-blue-400" />
                  <Video className="w-4 h-4 text-green-400" />
                </div>
                <span>上传参考素材</span>
             </button>

             <button
                type="button"
                onClick={() => scriptInputRef.current?.click()}
                disabled={isLoading || isAnalyzingMedia || isParsingScript}
                className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-full px-4 py-2 text-sm text-gray-300 transition-colors disabled:opacity-50"
                title="上传 PDF、文本脚本或 JSON 文件"
             >
                {isParsingScript ? (
                  <FileType className="w-4 h-4 animate-bounce text-yellow-400" />
                ) : (
                  <div className="flex gap-1">
                     <FileText className="w-4 h-4 text-gray-300" />
                     <UploadCloud className="w-4 h-4 text-yellow-400" />
                  </div>
                )}
                <span>{isParsingScript ? "AI 解析中..." : "导入脚本/项目"}</span>
             </button>
          </div>
        </div>

        {/* Media Queue Preview Area */}
        {mediaQueue.length > 0 && (
          <div className="w-full bg-gray-900/50 border border-gray-800 rounded-xl p-4 animate-in fade-in slide-in-from-top-2">
            <div className="flex justify-between items-center mb-3">
               <h3 className="text-sm font-bold text-gray-400 flex items-center gap-2">
                 <ListVideo className="w-4 h-4" />
                 已选参考素材 ({mediaQueue.length}) - <span className="text-xs font-normal">请调整顺序以符合叙事逻辑</span>
               </h3>
               <button
                 type="button"
                 onClick={handleAnalyzeBatch}
                 disabled={isAnalyzingMedia}
                 className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-xs px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
               >
                 {isAnalyzingMedia ? (
                   <>
                     <Sparkles className="w-3.5 h-3.5 animate-spin" /> 分析中...
                   </>
                 ) : (
                   <>
                     <Sparkles className="w-3.5 h-3.5" /> 开始分析素材
                   </>
                 )}
               </button>
            </div>
            
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
              {mediaQueue.map((item, index) => (
                <div key={item.id} className="relative flex-shrink-0 w-32 h-24 group rounded-lg overflow-hidden border border-gray-700 bg-gray-800">
                  {item.type === 'video' ? (
                     <div className="w-full h-full flex items-center justify-center bg-gray-900">
                       <video src={item.previewUrl} className="w-full h-full object-cover opacity-60" />
                       <Play className="absolute w-8 h-8 text-white/80" />
                     </div>
                  ) : (
                     <img src={item.previewUrl} alt="preview" className="w-full h-full object-cover" />
                  )}
                  
                  {/* Overlay Controls */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 backdrop-blur-sm">
                    <button 
                      type="button"
                      onClick={() => handleMoveMedia(index, 'left')} 
                      disabled={index === 0}
                      className="p-1 hover:text-white text-gray-400 disabled:opacity-20"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button 
                      type="button"
                      onClick={() => handleRemoveMedia(item.id)}
                      className="p-1 hover:text-red-400 text-gray-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button 
                      type="button"
                      onClick={() => handleMoveMedia(index, 'right')} 
                      disabled={index === mediaQueue.length - 1}
                      className="p-1 hover:text-white text-gray-400 disabled:opacity-20"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                  
                  <div className="absolute bottom-1 right-1 bg-black/70 px-1.5 rounded text-[10px] text-white">
                    {index + 1}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="relative w-full">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="在这里描述您的视频创意（例如：一个赛博朋克侦探在雨夜的霓虹城市追捕叛逃的仿生人）..."
            className="w-full h-32 bg-gray-900 border border-gray-700 rounded-xl p-4 text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none resize-none transition-all shadow-xl"
            disabled={isLoading || isAnalyzingMedia || isParsingScript}
          />
          <div className="absolute bottom-4 right-4">
            <Button type="submit" isLoading={isLoading} disabled={!input.trim() || isAnalyzingMedia || isParsingScript}>
              开始创作 <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </form>
      
      {isLoading && (
        <div className="w-full max-w-lg mt-8 animate-in fade-in duration-700">
           <div className="flex justify-between text-xs text-gray-400 mb-2 font-mono">
             <span>正在构建 {shotCount} 个镜头的分镜脚本...</span>
             <span>{Math.floor(progress)}%</span>
           </div>
           <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
             <div 
               className="bg-brand-500 h-full rounded-full transition-all duration-200 ease-linear shadow-[0_0_12px_rgba(99,102,241,0.6)]" 
               style={{ width: `${progress}%` }}
             />
           </div>
           <p className="mt-3 text-xs text-gray-600">
             {modelName} 正在运行 (约需 10-20 秒)
           </p>
        </div>
      )}
    </div>
  );
};