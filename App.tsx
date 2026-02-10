import React, { useState, useEffect, useRef } from 'react';
import { Layout, Zap, Star } from 'lucide-react';
import { 
  StoryboardData, 
  PromptData, 
  AppState,
  Shot,
  AIPromptItem,
  Group
} from './types';
import { generateStoryboard, generatePromptsForGroup } from './services/geminiService';
import { IdeaInput } from './components/IdeaInput';
import { StoryboardView } from './components/StoryboardView';
import { PromptDisplay } from './components/PromptDisplay';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [storyboard, setStoryboard] = useState<StoryboardData | null>(null);
  const [prompts, setPrompts] = useState<Record<number, PromptData>>({});
  const [currentGroupId, setCurrentGroupId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3-flash-preview');
  
  // Progress state for batch generation
  const [batchProgress, setBatchProgress] = useState<{current: number, total: number} | null>(null);

  // Scroll to top on state change usually helps UX
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [appState]);

  const handleIdeaSubmit = async (idea: string, shotCount: number) => {
    setAppState(AppState.GENERATING_STORYBOARD);
    setError(null);
    try {
      // Step 1: Generate with selected model and specific shot count
      const data = await generateStoryboard(idea, shotCount, selectedModel);
      setStoryboard(data);
      setAppState(AppState.REVIEW_STORYBOARD);
    } catch (e) {
      console.error(e);
      setError("生成分镜脚本失败，请重试。");
      setAppState(AppState.IDLE);
    }
  };

  const handleScriptUpload = (data: any) => {
    if (data.storyboard && data.prompts) {
       setStoryboard(data.storyboard);
       setPrompts(data.prompts);
    } else {
       setStoryboard(data as StoryboardData);
       setPrompts({});
    }
    setAppState(AppState.REVIEW_STORYBOARD);
    setError(null);
  };

  const handleUpdateSetting = (type: 'character' | 'scene', index: number, field: keyof AIPromptItem, value: string) => {
    setStoryboard(prev => {
      if (!prev) return null;
      const newSettings = { ...prev.settings };
      const targetArray = type === 'character' ? newSettings.characters : newSettings.scenes;
      
      if (targetArray[index]) {
        targetArray[index] = {
          ...targetArray[index],
          [field]: value
        };
      }

      return {
        ...prev,
        settings: newSettings
      };
    });
  };

  const handleUpdateGlobalSetting = (field: 'overview' | 'style', value: string) => {
    setStoryboard(prev => {
      if (!prev) return null;
      return {
        ...prev,
        settings: {
          ...prev.settings,
          [field]: value
        }
      };
    });
  };

  const handleAddSetting = (type: 'character' | 'scene') => {
    setStoryboard(prev => {
      if (!prev) return null;
      const newSettings = { ...prev.settings };
      const newItem: AIPromptItem = {
        name: type === 'character' ? "新角色" : "新场景",
        description: "请输入详细的视觉描述...",
        prompt: "待生成的 AI 提示词..."
      };
      
      if (type === 'character') {
        newSettings.characters.push(newItem);
      } else {
        newSettings.scenes.push(newItem);
      }

      return {
        ...prev,
        settings: newSettings
      };
    });
  };

  const handleDeleteSetting = (type: 'character' | 'scene', index: number) => {
    setStoryboard(prev => {
      if (!prev) return null;
      const newSettings = { ...prev.settings };
      if (type === 'character') {
        newSettings.characters.splice(index, 1);
      } else {
        newSettings.scenes.splice(index, 1);
      }
      return {
        ...prev,
        settings: newSettings
      };
    });
  };

  const handleUpdateScript = (newScript: Shot[]) => {
    setStoryboard(prev => {
      if (!prev) return null;
      return {
        ...prev,
        script: newScript
      };
    });
  };

  const handleUpdatePromptData = (groupId: number, newImagePrompts: any) => {
    setPrompts(prev => ({
      ...prev,
      [groupId]: {
        ...prev[groupId],
        imagePrompts: newImagePrompts
      }
    }));
  };

  // --- Core Generation Logic ---

  // Helper to run generation for a list of groups sequentially
  const runGenerationQueue = async (groupsToProcess: Group[]) => {
    if (!storyboard) return;

    setAppState(AppState.GENERATING_PROMPTS);
    
    // We only reset progress total if we are doing a fresh batch. 
    // If we are continuing, we might want to handle it differently, 
    // but here we just show progress for the *current* operation.
    setBatchProgress({ current: 0, total: groupsToProcess.length });

    for (let i = 0; i < groupsToProcess.length; i++) {
      const group = groupsToProcess[i];
      
      // Auto-select the group being generated so the user sees it happens
      setCurrentGroupId(group.id);

      try {
        const startIdx = (group.id - 1) * 4;
        const groupShots = storyboard.script.slice(startIdx, startIdx + 4);
        
        const data = await generatePromptsForGroup(
          group.id,
          group.narrative,
          groupShots,
          storyboard.settings,
          selectedModel
        );

        setPrompts(prev => ({
          ...prev,
          [group.id]: data
        }));
      } catch (e) {
        console.error(`Error generating group ${group.id}`, e);
        // Continue to next even if error
      }
      
      // Update progress
      setBatchProgress({ current: i + 1, total: groupsToProcess.length });
      
      // Small delay to allow UI render and provide visual feedback
      await new Promise(r => setTimeout(r, 500));
    }

    setBatchProgress(null);
    setAppState(AppState.VIEW_PROMPTS);
  };

  const handleConfirmStoryboard = () => {
    if (!storyboard?.groups.length) return;
    
    // 1. Switch View
    setAppState(AppState.VIEW_PROMPTS);
    
    // 2. Identify missing groups
    const missingGroups = storyboard.groups.filter(g => !prompts[g.id]);
    
    // 3. Start auto-generation for missing groups immediately
    if (missingGroups.length > 0) {
      runGenerationQueue(missingGroups);
    } else {
      // If all exist, just select the first one
      if (!currentGroupId) setCurrentGroupId(storyboard.groups[0].id);
    }
  };

  // Handle "Regenerate All" button
  const handleRegenerateAll = () => {
    if (!storyboard) return;
    if (!confirm("确定要重新生成所有分组的提示词吗？这将覆盖现有内容。")) return;
    
    setPrompts({}); // Clear existing
    runGenerationQueue(storyboard.groups); // Run all
  };

  // Handle single group regeneration
  const handleRegenerateGroup = async (groupId: number) => {
    if (!storyboard) return;
    const group = storyboard.groups.find(g => g.id === groupId);
    if (!group) return;

    // Run queue with just one item
    await runGenerationQueue([group]);
  };

  const handleSelectGroup = (groupId: number) => {
    // Only allow manual selection if not currently running a batch queue (or if we want to allow jumping?)
    // Allowing jumping during generation is tricky. Let's allow view, but the auto-process will override selection.
    // For now, simple state set.
    setCurrentGroupId(groupId);
  };

  // --- Export Handlers ---
  const handleExportJSON = () => {
    if (!storyboard) return;
    const exportData = {
      meta: {
        project: "AI Video Director Project",
        date: new Date().toISOString(),
        model: selectedModel,
        version: "1.0"
      },
      storyboard,
      prompts
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `storyboard-project-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportTXT = () => {
    if (!storyboard) return;
    let txt = `项目: AI Video Director Script\nModel: ${selectedModel}\nDate: ${new Date().toLocaleString()}\n\n`;
    
    txt += `=== 世界观与设定 ===\n${storyboard.settings.overview}\n\n`;
    txt += `=== 视觉风格 ===\n${storyboard.settings.style}\n\n`;
    
    txt += `=== 角色列表 ===\n`;
    storyboard.settings.characters.forEach(c => {
      txt += `- ${c.name}: ${c.description}\n  Prompt: ${c.prompt}\n`;
    });
    txt += `\n=== 场景列表 ===\n`;
    storyboard.settings.scenes.forEach(s => {
      txt += `- ${s.name}: ${s.description}\n  Prompt: ${s.prompt}\n`;
    });
    txt += `\n================================================\n\n`;

    storyboard.groups.forEach(g => {
       txt += `Group ${g.id} (Shots ${g.range})\n剧情: ${g.narrative}\n`;
       txt += `------------------------------------------------\n`;
       
       const p = prompts[g.id];
       if (p) {
         txt += `[Image Prompts - Midjourney]\n`;
         // Order keys nicely
         const order = ['shot', 'subject', 'environment', 'lighting', 'camera', 'colorGrade', 'style', 'quality'];
         order.forEach(k => {
            const val = p.imagePrompts[k as keyof typeof p.imagePrompts];
            if(val) txt += `${k.toUpperCase()}: ${val}\n`;
         });
         txt += `\n[Camera/Runway Prompts]\n${p.cameraPrompts}\n`;
       } else {
         txt += `(提示词未生成)\n`;
       }
       txt += `\n\n`;
    });
    
    const blob = new Blob([txt], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `storyboard_prompts_${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleReset = () => {
    if (confirm("您确定吗？这将清除当前所有进度。")) {
      setAppState(AppState.IDLE);
      setStoryboard(null);
      setPrompts({});
      setCurrentGroupId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-lg text-white">
            <Layout className="text-brand-500" />
            <span className="hidden sm:inline">AI 导演</span>
          </div>

          <div className="flex items-center gap-4">
            {/* Model Selector */}
            <div className="flex items-center bg-gray-800 rounded-lg p-1 border border-gray-700">
              <button
                onClick={() => setSelectedModel('gemini-3-flash-preview')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-all ${
                  selectedModel === 'gemini-3-flash-preview' 
                    ? 'bg-gray-700 text-white shadow-sm' 
                    : 'text-gray-400 hover:text-gray-200'
                }`}
                title="速度极快，适合快速迭代"
              >
                <Zap className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Flash 3.0</span>
              </button>
              <button
                onClick={() => setSelectedModel('gemini-3-pro-preview')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-all ${
                  selectedModel === 'gemini-3-pro-preview' 
                    ? 'bg-brand-900/50 text-brand-300 shadow-sm border border-brand-500/20' 
                    : 'text-gray-400 hover:text-gray-200'
                }`}
                title="推理能力更强，适合复杂描述"
              >
                <Star className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Pro 3.0</span>
              </button>
            </div>

            {appState !== AppState.IDLE && (
              <button 
                onClick={handleReset}
                className="text-xs text-gray-500 hover:text-red-400 transition-colors px-2"
              >
                新项目
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative">
        {error && (
           <div className="max-w-xl mx-auto mt-4 p-4 bg-red-900/20 border border-red-800 text-red-200 rounded-lg text-center">
             {error}
           </div>
        )}

        {appState === AppState.IDLE || appState === AppState.GENERATING_STORYBOARD ? (
          <IdeaInput 
            onSubmit={handleIdeaSubmit}
            onScriptUpload={handleScriptUpload}
            isLoading={appState === AppState.GENERATING_STORYBOARD} 
            modelName={selectedModel === 'gemini-3-flash-preview' ? 'Flash 3.0' : 'Pro 3.0'}
          />
        ) : null}

        {appState === AppState.REVIEW_STORYBOARD && storyboard && (
          <StoryboardView 
            data={storyboard} 
            onConfirm={handleConfirmStoryboard} 
            onUpdateSetting={handleUpdateSetting}
            onUpdateGlobalSetting={handleUpdateGlobalSetting}
            onAddSetting={handleAddSetting}
            onDeleteSetting={handleDeleteSetting}
            onUpdateScript={handleUpdateScript}
            selectedModel={selectedModel}
          />
        )}

        {(appState === AppState.VIEW_PROMPTS || appState === AppState.GENERATING_PROMPTS) && storyboard && (
          <PromptDisplay 
            groups={storyboard.groups}
            prompts={prompts}
            currentGroupId={currentGroupId}
            onSelectGroup={handleSelectGroup}
            onUpdatePrompt={handleUpdatePromptData}
            isGenerating={appState === AppState.GENERATING_PROMPTS}
            selectedModel={selectedModel}
            onRegenerateAll={handleRegenerateAll}
            onRegenerateGroup={handleRegenerateGroup}
            onExportJSON={handleExportJSON}
            onExportTXT={handleExportTXT}
            batchProgress={batchProgress}
          />
        )}
      </main>
      
      {/* Footer */}
      <footer className="border-t border-gray-900 py-6 text-center text-gray-600 text-sm">
        <p>Current Engine: {selectedModel === 'gemini-3-flash-preview' ? 'Gemini 3.0 Flash' : 'Gemini 3.0 Pro'}</p>
      </footer>
    </div>
  );
};

export default App;
