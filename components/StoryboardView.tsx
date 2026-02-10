import React, { useState } from 'react';
import { StoryboardData, AIPromptItem, Shot } from '../types';
import { Button } from './Button';
import { 
  CheckCircle2, 
  Film, 
  Users, 
  Layers, 
  Copy, 
  MapPin, 
  User as UserIcon, 
  Upload, 
  Wand2,
  Edit2,
  RefreshCw,
  Save,
  X,
  MessageSquare,
  Send,
  Mic,
  Move,
  Plus,
  Trash2,
  Palette
} from 'lucide-react';
import { generatePromptFromImage, refineStoryboardScript } from '../services/geminiService';

interface StoryboardViewProps {
  data: StoryboardData;
  onConfirm: () => void;
  onUpdateSetting: (type: 'character' | 'scene', index: number, field: keyof AIPromptItem, value: string) => void;
  onUpdateGlobalSetting: (field: 'overview' | 'style', value: string) => void;
  onAddSetting: (type: 'character' | 'scene') => void;
  onDeleteSetting: (type: 'character' | 'scene', index: number) => void;
  onUpdateScript: (newScript: Shot[]) => void;
  selectedModel?: string;
}

const STYLE_PRESETS = [
  "赛博朋克 (Cyberpunk)",
  "吉卜力手绘 (Ghibli)",
  "好莱坞电影感 (Hollywood Cinematic)",
  "80年代复古 (80s Retro)",
  "黑白黑色电影 (Film Noir)",
  "皮克斯3D (Pixar 3D)",
  "虚幻引擎5 (Unreal Engine 5)",
  "水墨中国风 (Chinese Ink)",
  "日系动漫 (Japanese Anime)",
  "极简主义 (Minimalist)"
];

export const StoryboardView: React.FC<StoryboardViewProps> = ({ 
  data, 
  onConfirm, 
  onUpdateSetting,
  onUpdateGlobalSetting,
  onAddSetting,
  onDeleteSetting,
  onUpdateScript,
  selectedModel = 'gemini-3-flash-preview'
}) => {
  const [activeTab, setActiveTab] = useState<'script' | 'groups' | 'settings'>('groups');
  const [processingIndex, setProcessingIndex] = useState<{type: string, index: number} | null>(null);
  
  // Script Editing State
  const [editingShotId, setEditingShotId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<string>(""); 
  const [isScriptRefining, setIsScriptRefining] = useState<boolean>(false);
  const [scriptChatInput, setScriptChatInput] = useState<string>("");
  const [loadingShotId, setLoadingShotId] = useState<number | null>(null); 

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // --- Setting Image Upload Handlers ---
  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>, 
    type: 'character' | 'scene', 
    index: number
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProcessingIndex({ type, index });

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = (reader.result as string).split(',')[1];
      try {
        const newPrompt = await generatePromptFromImage(base64String, type);
        onUpdateSetting(type, index, 'prompt', newPrompt);
      } catch (error) {
        console.error("Failed to analyze image", error);
        alert("图片解析失败，请重试");
      } finally {
        setProcessingIndex(null);
      }
    };
    reader.readAsDataURL(file);
  };

  // --- Script Edit Handlers ---
  const startEditShot = (shot: Shot) => {
    setEditingShotId(shot.id);
    setEditValue(shot.description);
  };

  const cancelEditShot = () => {
    setEditingShotId(null);
    setEditValue("");
  };

  const saveEditShot = () => {
    if (editingShotId === null) return;
    const newScript = data.script.map(s => 
      s.id === editingShotId ? { ...s, description: editValue } : s
    );
    onUpdateScript(newScript);
    setEditingShotId(null);
  };

  // --- Script AI Handlers ---
  const handleScriptRefine = async (instruction: string, shotId?: number) => {
    const finalInstruction = shotId 
      ? `仅针对 ID 为 ${shotId} 的镜头进行优化：${instruction || '请重写这个镜头，使其画面感更强，更专业。'}`
      : instruction;

    if (shotId) setLoadingShotId(shotId);
    else setIsScriptRefining(true);

    try {
      const newScript = await refineStoryboardScript(
        data.script,
        finalInstruction,
        selectedModel
      );
      onUpdateScript(newScript);
      if (!shotId) setScriptChatInput("");
    } catch (error) {
      console.error("Script refinement failed", error);
      alert("AI 修改失败，请重试");
    } finally {
      if (shotId) setLoadingShotId(null);
      else setIsScriptRefining(false);
    }
  };

  const handleScriptChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scriptChatInput.trim()) return;
    handleScriptRefine(scriptChatInput);
  };

  const PromptCard: React.FC<{ 
    item: AIPromptItem; 
    index: number;
    type: 'character' | 'scene';
    icon: React.ReactNode; 
    label: string 
  }> = ({ item, index, type, icon, label }) => {
    const isProcessing = processingIndex?.type === type && processingIndex?.index === index;

    return (
      <div className="bg-gray-850 p-4 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors group relative">
        {/* Header with Name Input and Image Upload */}
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-2 text-gray-200 flex-1 mr-2">
            {icon}
            <input 
              type="text"
              value={item.name}
              onChange={(e) => onUpdateSetting(type, index, 'name', e.target.value)}
              className="bg-transparent border-b border-transparent hover:border-gray-600 focus:border-brand-500 focus:outline-none font-bold w-full transition-colors px-1"
              placeholder="名称"
            />
            <span className="text-xs font-normal text-gray-500 border border-gray-700 px-1.5 py-0.5 rounded whitespace-nowrap hidden sm:block">{label}</span>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                type="file"
                accept="image/*"
                id={`upload-${type}-${index}`}
                className="hidden"
                onChange={(e) => handleImageUpload(e, type, index)}
                disabled={isProcessing}
              />
              <label
                htmlFor={`upload-${type}-${index}`}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded cursor-pointer transition-colors ${
                  isProcessing 
                    ? 'bg-gray-700 text-gray-500 cursor-wait' 
                    : 'bg-brand-900/50 text-brand-400 hover:bg-brand-900 border border-brand-500/30'
                }`}
              >
                {isProcessing ? (
                  <>
                    <Wand2 className="w-3 h-3 animate-spin" />
                  </>
                ) : (
                  <>
                    <Upload className="w-3 h-3" /> <span className="hidden sm:inline">反推</span>
                  </>
                )}
              </label>
            </div>
            
            <button
               onClick={() => onDeleteSetting(type, index)}
               className="p-1 text-gray-600 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors"
               title="删除"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Editable Description */}
        <textarea 
           value={item.description}
           onChange={(e) => onUpdateSetting(type, index, 'description', e.target.value)}
           className="w-full bg-gray-900/30 border border-transparent hover:border-gray-700 focus:border-brand-500 rounded p-2 text-sm text-gray-300 mb-3 focus:outline-none resize-none h-16 transition-all"
           placeholder="视觉描述..."
        />
        
        {/* Prompt Display Area */}
        <div className="bg-gray-900 rounded p-3 border border-gray-800 relative group/prompt">
          <div className="absolute -top-3 left-2 bg-gray-800 text-[10px] text-gray-400 px-1 rounded flex items-center gap-2">
             <span>AI 提示词</span>
          </div>
          <textarea
            value={item.prompt}
            onChange={(e) => onUpdateSetting(type, index, 'prompt', e.target.value)}
            className="w-full bg-transparent border-none p-0 text-xs text-gray-300 font-mono leading-relaxed focus:outline-none h-20 resize-none"
            placeholder="生成的 Prompt 将显示在这里..."
          />
          <button 
            onClick={() => handleCopy(item.prompt)}
            className="absolute top-2 right-2 p-1.5 bg-gray-800 text-gray-400 hover:text-white rounded opacity-0 group-hover/prompt:opacity-100 transition-opacity z-10"
            title="复制提示词"
          >
            <Copy className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-5xl mx-auto p-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Film className="text-brand-500" /> 分镜脚本预览
        </h2>
        <Button onClick={onConfirm} className="bg-green-600 hover:bg-green-500">
          确认并生成提示词 <CheckCircle2 className="w-4 h-4" />
        </Button>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-2xl flex flex-col h-[70vh]">
        <div className="flex border-b border-gray-800 flex-shrink-0">
          <button
            onClick={() => setActiveTab('groups')}
            className={`px-6 py-3 text-sm font-medium flex items-center gap-2 transition-colors ${
              activeTab === 'groups' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800/50'
            }`}
          >
            <Layers className="w-4 h-4" /> 分组结构
          </button>
          <button
            onClick={() => setActiveTab('script')}
            className={`px-6 py-3 text-sm font-medium flex items-center gap-2 transition-colors ${
              activeTab === 'script' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800/50'
            }`}
          >
            <Film className="w-4 h-4" /> 完整脚本
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-6 py-3 text-sm font-medium flex items-center gap-2 transition-colors ${
              activeTab === 'settings' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800/50'
            }`}
          >
            <Users className="w-4 h-4" /> 设定与角色
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 relative">
          {activeTab === 'groups' && (
            <div className="grid gap-4 md:grid-cols-2">
              {data.groups.map((group) => (
                <div key={group.id} className="bg-gray-850 p-4 rounded-lg border border-gray-700 hover:border-brand-500/50 transition-colors">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-bold text-brand-400">第 {group.id} 组</h3>
                    <span className="text-xs bg-gray-800 px-2 py-1 rounded text-gray-400">镜头 {group.range}</span>
                  </div>
                  <p className="text-sm text-gray-300">{group.narrative}</p>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'script' && (
            <div className="space-y-4 pb-20">
              {data.script.map((shot) => {
                 const isEditing = editingShotId === shot.id;
                 const isLoading = loadingShotId === shot.id;
                 return (
                  <div key={shot.id} className="group flex gap-4 p-4 bg-gray-850/50 hover:bg-gray-850 rounded-lg transition-colors border border-gray-800 hover:border-gray-700">
                    <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-gray-800 rounded-full text-sm font-bold text-gray-400">
                      {shot.id}
                    </span>
                    
                    <div className="flex-1 space-y-3">
                      {isEditing ? (
                         <textarea
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-full h-24 bg-gray-900 border border-brand-500 rounded p-2 text-sm text-white focus:outline-none resize-none"
                            autoFocus
                         />
                      ) : (
                         <>
                           <p className={`text-gray-300 text-sm leading-relaxed whitespace-pre-line font-medium ${isLoading ? 'opacity-50 animate-pulse' : ''}`}>
                             {isLoading ? '正在重写...' : shot.description}
                           </p>
                           
                           {/* Display extra fields: Voiceover and Movement */}
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                             <div className="bg-gray-900/50 p-2 rounded border border-gray-800/50 flex items-start gap-2">
                               <Mic className="w-3 h-3 text-purple-400 mt-0.5 flex-shrink-0" />
                               <span className="text-gray-400">{shot.voiceover || "无对白"}</span>
                             </div>
                             <div className="bg-gray-900/50 p-2 rounded border border-gray-800/50 flex items-start gap-2">
                               <Move className="w-3 h-3 text-blue-400 mt-0.5 flex-shrink-0" />
                               <span className="text-gray-400">{shot.movement || "无特殊运镜"}</span>
                             </div>
                           </div>
                         </>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 items-end justify-start opacity-30 group-hover:opacity-100 transition-opacity w-24">
                       {isEditing ? (
                          <div className="flex gap-2">
                             <button onClick={saveEditShot} className="p-1.5 bg-green-600 hover:bg-green-500 text-white rounded shadow" title="保存">
                               <Save className="w-4 h-4" />
                             </button>
                             <button onClick={cancelEditShot} className="p-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded shadow" title="取消">
                               <X className="w-4 h-4" />
                             </button>
                          </div>
                       ) : (
                          <div className="flex gap-2">
                             <button 
                               onClick={() => startEditShot(shot)} 
                               disabled={isScriptRefining || isLoading}
                               className="p-1.5 bg-gray-800 hover:bg-brand-600 text-gray-400 hover:text-white rounded transition-colors"
                               title="手动编辑视觉描述"
                             >
                               <Edit2 className="w-4 h-4" />
                             </button>
                             <button 
                               onClick={() => handleScriptRefine("", shot.id)}
                               disabled={isScriptRefining || isLoading}
                               className="p-1.5 bg-gray-800 hover:bg-purple-600 text-gray-400 hover:text-white rounded transition-colors"
                               title="AI 重写此镜头"
                             >
                               <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                             </button>
                          </div>
                       )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-8">
              {/* Global Settings Section (Overview & Style) */}
              <div className="grid gap-6 md:grid-cols-2">
                 {/* Overview */}
                 <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                   <h3 className="text-sm font-bold text-gray-400 mb-2 uppercase tracking-wider">世界观概要 (Overview)</h3>
                   <textarea
                     value={data.settings.overview}
                     onChange={(e) => onUpdateGlobalSetting('overview', e.target.value)}
                     className="w-full bg-gray-900/50 border border-gray-700 rounded p-3 text-sm text-gray-300 focus:border-brand-500 focus:outline-none resize-y min-h-[120px]"
                   />
                 </div>

                 {/* Visual Style - NEW SELECTABLE SECTION */}
                 <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                   <div className="flex justify-between items-center mb-2">
                     <h3 className="text-sm font-bold text-brand-400 uppercase tracking-wider flex items-center gap-2">
                       <Palette className="w-4 h-4" /> 视觉风格 (Visual Style)
                     </h3>
                     <span className="text-[10px] text-gray-500">将应用于所有镜头生成</span>
                   </div>
                   
                   <textarea
                     value={data.settings.style}
                     onChange={(e) => onUpdateGlobalSetting('style', e.target.value)}
                     className="w-full bg-gray-900/50 border border-gray-700 rounded p-3 text-sm text-gray-300 focus:border-brand-500 focus:outline-none resize-y min-h-[80px] mb-3"
                     placeholder="例如：赛博朋克风格，高对比度霓虹灯光..."
                   />
                   
                   <div className="flex flex-wrap gap-2">
                      {STYLE_PRESETS.map((style) => (
                        <button
                          key={style}
                          onClick={() => onUpdateGlobalSetting('style', style)}
                          className="text-xs px-2 py-1 bg-gray-700 hover:bg-brand-600 text-gray-300 hover:text-white rounded transition-colors border border-gray-600"
                        >
                          {style.split(' ')[0]}
                        </button>
                      ))}
                   </div>
                 </div>
              </div>

              {/* Characters */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <UserIcon className="text-blue-400 w-5 h-5" /> 所有出场角色设定
                  </h3>
                  <button 
                    onClick={() => onAddSetting('character')}
                    className="flex items-center gap-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-full border border-gray-700 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> 添加角色
                  </button>
                </div>
                
                <div className="grid gap-4 md:grid-cols-2">
                  {data.settings.characters.map((char, idx) => (
                    <PromptCard 
                      key={idx} 
                      index={idx}
                      type="character"
                      item={char} 
                      icon={<UserIcon className="w-4 h-4 text-blue-400" />} 
                      label="Character" 
                    />
                  ))}
                  {data.settings.characters.length === 0 && (
                    <div className="col-span-2 text-center py-8 border-2 border-dashed border-gray-800 rounded-lg text-gray-600">
                      暂无角色，请点击上方按钮添加
                    </div>
                  )}
                </div>
              </div>

              {/* Scenes */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <MapPin className="text-green-400 w-5 h-5" /> 所有场景设定
                  </h3>
                  <button 
                    onClick={() => onAddSetting('scene')}
                    className="flex items-center gap-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-full border border-gray-700 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> 添加场景
                  </button>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {data.settings.scenes.map((scene, idx) => (
                    <PromptCard 
                      key={idx} 
                      index={idx}
                      type="scene"
                      item={scene} 
                      icon={<MapPin className="w-4 h-4 text-green-400" />} 
                      label="Scene" 
                    />
                  ))}
                   {data.settings.scenes.length === 0 && (
                    <div className="col-span-2 text-center py-8 border-2 border-dashed border-gray-800 rounded-lg text-gray-600">
                      暂无场景，请点击上方按钮添加
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Script Chat Box (Only visible on script tab) */}
        {activeTab === 'script' && (
           <div className="flex-shrink-0 border-t border-gray-800 p-4 bg-gray-850/90 backdrop-blur z-10">
              <form onSubmit={handleScriptChatSubmit} className="relative max-w-3xl mx-auto">
                 <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="w-4 h-4 text-brand-400" />
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">AI 脚本修改助手</span>
                 </div>
                 <div className="relative">
                   <input
                     type="text"
                     value={scriptChatInput}
                     onChange={(e) => setScriptChatInput(e.target.value)}
                     placeholder="例如：把所有白天的镜头改成雨夜，或者让 Shot 5 的动作更激烈一点..."
                     className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-4 pr-12 py-3 text-sm text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none shadow-inner"
                     disabled={isScriptRefining}
                   />
                   <button 
                     type="submit" 
                     disabled={!scriptChatInput.trim() || isScriptRefining}
                     className="absolute right-2 top-1.5 p-1.5 bg-brand-600 hover:bg-brand-500 disabled:bg-gray-700 text-white rounded-md transition-all"
                   >
                     {isScriptRefining ? (
                       <RefreshCw className="w-4 h-4 animate-spin" />
                     ) : (
                       <Send className="w-4 h-4" />
                     )}
                   </button>
                 </div>
                 {isScriptRefining && (
                   <div className="absolute -top-8 left-0 text-xs text-brand-400 animate-pulse bg-brand-900/20 px-2 py-1 rounded">
                     AI 正在重新编写脚本...
                   </div>
                 )}
              </form>
           </div>
        )}
      </div>
      
      <div className="mt-4 text-center text-sm text-gray-500">
        请预览上方的分镜脚本。确认无误后，点击确认按钮进入分镜提示词生成阶段。
      </div>
    </div>
  );
};
