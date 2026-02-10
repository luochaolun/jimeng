import React, { useState, useRef, useEffect } from 'react';
import { PromptData, Group } from '../types';
import { 
  Copy, 
  Camera, 
  Image as ImageIcon, 
  Edit2, 
  Save, 
  X, 
  RefreshCw, 
  RefreshCcw,
  Send, 
  MessageSquare,
  Zap,
  Download,
  FileJson,
  FileText
} from 'lucide-react';
import { refinePrompt } from '../services/geminiService';

interface PromptDisplayProps {
  groups: Group[];
  prompts: Record<number, PromptData>;
  currentGroupId: number | null;
  onSelectGroup: (groupId: number) => void;
  onUpdatePrompt: (groupId: number, newImagePrompts: any) => void;
  isGenerating: boolean;
  selectedModel: string;
  onRegenerateAll: () => void;
  onRegenerateGroup: (groupId: number) => void;
  onExportJSON: () => void;
  onExportTXT: () => void;
  batchProgress: {current: number, total: number} | null;
}

export const PromptDisplay: React.FC<PromptDisplayProps> = ({ 
  groups, 
  prompts, 
  currentGroupId, 
  onSelectGroup,
  onUpdatePrompt,
  isGenerating,
  selectedModel,
  onRegenerateAll,
  onRegenerateGroup,
  onExportJSON,
  onExportTXT,
  batchProgress
}) => {
  const currentPrompt = currentGroupId ? prompts[currentGroupId] : null;
  const [showExportMenu, setShowExportMenu] = useState(false);
  
  // State for manual editing
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  
  // State for AI Refinement
  const [isRefining, setIsRefining] = useState<boolean>(false);
  const [refiningField, setRefiningField] = useState<string | null>(null); // If null, global refinement
  const [chatInput, setChatInput] = useState<string>("");

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const CopyButton = ({ text }: { text: string }) => (
    <button 
      onClick={() => handleCopy(text)}
      className="text-xs flex items-center gap-1 text-gray-400 hover:text-white transition-colors bg-gray-800 px-2 py-1 rounded border border-gray-700 hover:border-gray-500"
      title="Copy to clipboard"
    >
      <Copy className="w-3 h-3" />
    </button>
  );

  // Manual Edit Handlers
  const startEdit = (key: string, value: string) => {
    setEditingField(key);
    setEditValue(value);
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditValue("");
  };

  const saveEdit = (key: string) => {
    if (!currentGroupId || !currentPrompt) return;
    
    const updatedImagePrompts = {
      ...currentPrompt.imagePrompts,
      [key]: editValue
    };
    
    onUpdatePrompt(currentGroupId, updatedImagePrompts);
    setEditingField(null);
  };

  // AI Refine Handlers
  const handleAIRefine = async (instruction: string, field?: string) => {
    if (!currentGroupId || !currentPrompt) return;
    
    setIsRefining(true);
    setRefiningField(field || 'GLOBAL');
    
    try {
      const updatedImagePrompts = await refinePrompt(
        currentPrompt.imagePrompts, 
        instruction, 
        selectedModel,
        field
      );
      
      onUpdatePrompt(currentGroupId, updatedImagePrompts);
      setChatInput(""); // Clear chat only on success
    } catch (error) {
      console.error("Refinement failed", error);
      alert("AI 优化失败，请重试");
    } finally {
      setIsRefining(false);
      setRefiningField(null);
    }
  };

  const handleFieldRegenerate = (key: string) => {
    // Quick default prompt for regenerating a specific field
    const instruction = `请重写并优化 "${key}" 字段的内容。使其更加详细、专业，符合电影级画面标准。`;
    handleAIRefine(instruction, key);
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    handleAIRefine(chatInput);
  };

  const formatKey = (key: string) => {
    const map: Record<string, string> = {
      shot: "分镜结构",
      subject: "画面主体",
      environment: "环境",
      lighting: "光影",
      camera: "摄影机",
      colorGrade: "调色",
      style: "风格",
      quality: "质量"
    };
    return map[key] || key;
  };

  const orderedKeys = [
    'shot',
    'subject',
    'environment',
    'lighting',
    'camera',
    'colorGrade',
    'style',
    'quality'
  ];

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-100px)] gap-4 p-4 max-w-7xl mx-auto animate-in fade-in duration-500">
      {/* Sidebar: Group Selector & Actions */}
      <div className="w-full md:w-64 flex-shrink-0 flex flex-col gap-2">
        {/* Action Buttons */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex flex-col gap-2">
           <div className="flex gap-2">
             <button
               onClick={onRegenerateAll}
               disabled={isGenerating}
               className="flex-1 bg-red-900/50 hover:bg-red-800 border border-red-800/50 disabled:bg-gray-800 disabled:text-gray-500 disabled:border-gray-700 text-red-200 text-xs font-bold py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-colors"
               title="全部重新生成"
             >
               <RefreshCcw className="w-3.5 h-3.5" />
               全部重生成
             </button>
             
             <div className="relative">
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  className="bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 px-3 rounded-lg border border-gray-700 transition-colors"
                  title="导出"
                >
                   <Download className="w-4 h-4" />
                </button>
                
                {showExportMenu && (
                  <div className="absolute top-full right-0 mt-2 w-40 bg-gray-850 border border-gray-700 rounded-lg shadow-xl overflow-hidden z-20 flex flex-col">
                    <button onClick={() => {onExportJSON(); setShowExportMenu(false)}} className="text-left px-4 py-3 hover:bg-gray-700 text-sm text-gray-200 flex items-center gap-2">
                      <FileJson className="w-4 h-4 text-yellow-400" />
                      导出 JSON (完整)
                    </button>
                    <button onClick={() => {onExportTXT(); setShowExportMenu(false)}} className="text-left px-4 py-3 hover:bg-gray-700 text-sm text-gray-200 flex items-center gap-2 border-t border-gray-800">
                      <FileText className="w-4 h-4 text-blue-400" />
                      导出 TXT (文本)
                    </button>
                  </div>
                )}
             </div>
           </div>
           
           {batchProgress && (
             <div className="bg-gray-800 rounded p-2 text-xs">
                <div className="flex justify-between text-gray-400 mb-1">
                  <span>批量生成中...</span>
                  <span>{batchProgress.current} / {batchProgress.total}</span>
                </div>
                <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                   <div 
                     className="h-full bg-brand-500 transition-all duration-300"
                     style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                   />
                </div>
             </div>
           )}
        </div>

        {/* Group List */}
        <div className="flex-1 bg-gray-900 border border-gray-800 rounded-xl p-4 overflow-y-auto">
          <h3 className="text-sm font-bold text-gray-500 mb-4 uppercase tracking-wider">分组列表</h3>
          <div className="space-y-2">
            {groups.map((group) => {
              const hasData = !!prompts[group.id];
              const isSelected = currentGroupId === group.id;
              
              return (
                <div key={group.id} className="relative flex items-center gap-1">
                  <button
                    onClick={() => onSelectGroup(group.id)}
                    className={`flex-1 text-left p-3 rounded-lg text-sm transition-all flex justify-between items-center group ${
                      isSelected 
                        ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/20' 
                        : hasData 
                          ? 'bg-gray-800 text-gray-300 hover:bg-gray-750' 
                          : 'bg-transparent text-gray-500 hover:bg-gray-800'
                    }`}
                  >
                    <span>第 {group.id} 组</span>
                    {hasData && <div className="w-2 h-2 rounded-full bg-green-500"></div>}
                    {isGenerating && isSelected && !hasData && (
                       <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    )}
                  </button>
                  
                  {/* Single Group Regenerate Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRegenerateGroup(group.id);
                    }}
                    disabled={isGenerating}
                    className={`p-2 rounded-lg transition-colors ${
                      isSelected
                        ? 'bg-brand-700 text-white hover:bg-brand-800'
                        : 'bg-gray-800 text-gray-500 hover:text-white hover:bg-gray-700'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    title="重新生成此组"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isGenerating && isSelected ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col bg-gray-900 border border-gray-800 rounded-xl overflow-hidden relative">
        {!currentGroupId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-8 text-center">
            <LayersIcon className="w-16 h-16 mb-4 opacity-20" />
            <p>正在准备生成...</p>
          </div>
        ) : isGenerating && !currentPrompt ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-8">
            <div className="w-12 h-12 border-4 border-brand-500/30 border-t-brand-500 rounded-full animate-spin mb-4"></div>
            <p>正在生成第 {currentGroupId} 组的提示词...</p>
            <p className="text-xs mt-2 text-gray-600">正在分析场景并创建详细指令</p>
          </div>
        ) : currentPrompt ? (
          <div className="flex-1 flex flex-col h-full">
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Image Prompts Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                   <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <ImageIcon className="text-blue-400" /> 画面生成提示词
                  </h3>
                  <CopyButton text={JSON.stringify(currentPrompt.imagePrompts, null, 2)} />
                </div>
                
                <div className="bg-gray-850 rounded-lg border border-gray-700 font-mono text-sm overflow-hidden">
                   <table className="w-full text-left border-collapse">
                     <tbody>
                      {orderedKeys.map((key) => {
                        const value = currentPrompt.imagePrompts[key as keyof typeof currentPrompt.imagePrompts];
                        if (value === undefined) return null;
                        
                        const isEditingThis = editingField === key;
                        const isRefiningThis = isRefining && refiningField === key;

                        return (
                          <tr key={key} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50 group">
                            <td className="py-3 pl-4 pr-2 text-brand-400 font-semibold align-top whitespace-nowrap w-28 text-xs uppercase tracking-wider">
                              {formatKey(key)}
                            </td>
                            <td className="py-3 px-2 text-gray-300 align-top relative">
                              {isEditingThis ? (
                                <textarea
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  className="w-full h-32 bg-gray-900 text-white p-2 rounded border border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-y"
                                  autoFocus
                                />
                              ) : isRefiningThis ? (
                                <div className="flex items-center gap-2 text-brand-400 animate-pulse">
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                  AI 正在优化...
                                </div>
                              ) : (
                                <div className="pr-20 whitespace-pre-wrap">{value}</div>
                              )}
                            </td>
                            <td className="py-3 pr-4 align-top w-20 text-right">
                              {isEditingThis ? (
                                <div className="flex flex-col gap-2">
                                  <button onClick={() => saveEdit(key)} className="p-1.5 bg-green-600 hover:bg-green-500 rounded text-white" title="Save">
                                    <Save className="w-4 h-4" />
                                  </button>
                                  <button onClick={cancelEdit} className="p-1.5 bg-gray-700 hover:bg-gray-600 rounded text-white" title="Cancel">
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 opacity-10 group-hover:opacity-100 transition-opacity justify-end">
                                  <button 
                                    onClick={() => startEdit(key, value)} 
                                    className="p-1.5 hover:bg-brand-900/50 text-gray-400 hover:text-brand-300 rounded transition-colors"
                                    title="手动修改"
                                    disabled={isRefining}
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button 
                                    onClick={() => handleFieldRegenerate(key)}
                                    className="p-1.5 hover:bg-purple-900/50 text-gray-400 hover:text-purple-300 rounded transition-colors"
                                    title="AI 重绘此项"
                                    disabled={isRefining}
                                  >
                                    <RefreshCw className={`w-4 h-4 ${isRefiningThis ? 'animate-spin' : ''}`} />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                     </tbody>
                   </table>
                </div>
              </div>

              {/* Camera Prompts Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                   <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Camera className="text-purple-400" /> 运镜与参考控制
                  </h3>
                  <CopyButton text={currentPrompt.cameraPrompts} />
                </div>
                
                <div className="bg-gray-850 rounded-lg p-4 border border-gray-700 whitespace-pre-wrap text-sm text-gray-300 leading-relaxed font-mono">
                  {currentPrompt.cameraPrompts}
                </div>
              </div>
            </div>

            {/* AI Chat / Refine Section */}
            <div className="border-t border-gray-800 p-4 bg-gray-850/50">
               <form onSubmit={handleChatSubmit} className="relative">
                 <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="w-4 h-4 text-brand-400" />
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">AI 对话修改</span>
                 </div>
                 <div className="relative">
                   <input
                     type="text"
                     value={chatInput}
                     onChange={(e) => setChatInput(e.target.value)}
                     placeholder="例如：把光影改成赛博朋克风格，或者让画面主体穿上红色夹克..."
                     className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-4 pr-12 py-3 text-sm text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none shadow-inner"
                     disabled={isRefining}
                   />
                   <button 
                     type="submit" 
                     disabled={!chatInput.trim() || isRefining}
                     className="absolute right-2 top-1.5 p-1.5 bg-brand-600 hover:bg-brand-500 disabled:bg-gray-700 text-white rounded-md transition-all"
                   >
                     {isRefining && refiningField === 'GLOBAL' ? (
                       <RefreshCw className="w-4 h-4 animate-spin" />
                     ) : (
                       <Send className="w-4 h-4" />
                     )}
                   </button>
                 </div>
                 {isRefining && refiningField === 'GLOBAL' && (
                   <div className="absolute -top-8 left-0 text-xs text-brand-400 animate-pulse bg-brand-900/20 px-2 py-1 rounded">
                     正在根据指令重新生成提示词...
                   </div>
                 )}
               </form>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-red-400">
             <p>加载该组提示词失败。</p>
          </div>
        )}
      </div>
    </div>
  );
};

const LayersIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
    <polyline points="2 17 12 22 22 17"></polyline>
    <polyline points="2 12 12 17 22 12"></polyline>
  </svg>
);