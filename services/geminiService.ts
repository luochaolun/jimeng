import { GoogleGenAI, Type, Schema } from "@google/genai";
import { SYSTEM_INSTRUCTION } from "../constants";
import { Shot, StoryboardSettings } from "../types";

let genAI: GoogleGenAI | null = null;

const getAI = () => {
  if (!genAI) {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error("API_KEY is not set in environment variables.");
    }
    genAI = new GoogleGenAI({ apiKey });
  }
  return genAI;
};

// Define schemas for structured output with strict required fields to prevent malformed JSON
const shotSchema: Schema = { 
  type: Type.OBJECT, 
  properties: { 
    id: { type: Type.INTEGER }, 
    description: { type: Type.STRING, description: "Visual description of the scene" },
    voiceover: { type: Type.STRING, description: "Dialogue, monologue, or specific sound effects (SFX)" },
    movement: { type: Type.STRING, description: "Specific camera movement (e.g., Dolly In, Pan Right) and character blocking" }
  },
  required: ["id", "description", "voiceover", "movement"]
};

const scriptResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    script: { type: Type.ARRAY, items: shotSchema }
  },
  required: ["script"]
};

const groupSchema: Schema = { 
  type: Type.OBJECT, 
  properties: { 
    id: { type: Type.INTEGER }, 
    range: { type: Type.STRING }, 
    narrative: { type: Type.STRING } 
  },
  required: ["id", "range", "narrative"]
};

const aiPromptItemSchema: Schema = {
  type: Type.OBJECT, 
  properties: {
    name: { type: Type.STRING, description: "Name of character or scene" },
    description: { type: Type.STRING, description: "Detailed visual description in Chinese (中文)" },
    prompt: { type: Type.STRING, description: "Optimized AI generation prompt. MUST BE IN CHINESE (简体中文). No English allowed." }
  },
  required: ["name", "description", "prompt"]
};

const settingsSchema: Schema = {
  type: Type.OBJECT, 
  properties: {
    overview: { type: Type.STRING, description: "World view and tone overview in Chinese" },
    style: { type: Type.STRING, description: "Detailed visual style description (e.g., Cyberpunk, Watercolor, Noir) in Chinese" },
    characters: { type: Type.ARRAY, items: aiPromptItemSchema, description: "List of ALL characters appearing in the storyboard" },
    scenes: { type: Type.ARRAY, items: aiPromptItemSchema, description: "List of ALL scenes appearing in the storyboard" }
  },
  required: ["overview", "style", "characters", "scenes"]
};

const storyboardSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    script: { type: Type.ARRAY, items: shotSchema },
    groups: { type: Type.ARRAY, items: groupSchema },
    settings: settingsSchema,
  },
  required: ["script", "groups", "settings"]
};

const imagePromptsSchema: Schema = {
  type: Type.OBJECT, 
  properties: {
    shot: { type: Type.STRING },
    subject: { type: Type.STRING },
    environment: { type: Type.STRING, description: "Must be in Chinese" },
    lighting: { type: Type.STRING, description: "Must be in Chinese" },
    camera: { type: Type.STRING, description: "Must be in Chinese" },
    colorGrade: { type: Type.STRING, description: "Must be in Chinese" },
    style: { type: Type.STRING, description: "Must be in Chinese" },
    quality: { type: Type.STRING, description: "Must be in Chinese" },
  },
  required: ["shot", "subject", "environment", "lighting", "camera", "colorGrade", "style", "quality"]
};

const promptSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    groupId: { type: Type.INTEGER },
    imagePrompts: imagePromptsSchema,
    cameraPrompts: { type: Type.STRING }
  },
  required: ["groupId", "imagePrompts", "cameraPrompts"]
};

// Helper to strip markdown code blocks if the model outputs them despite JSON mime type
const cleanJsonString = (text: string) => {
  if (!text) return "{}";
  let clean = text.trim();
  if (clean.startsWith("```")) {
    clean = clean.replace(/^```(json)?/i, "").replace(/```$/, "");
  }
  return clean;
};

// Helper function to handle API calls with retry logic for 429 errors
const safeGenerateContent = async (params: any) => {
  const ai = getAI();
  const maxRetries = 3;
  let delay = 2000; // Start with 2 seconds

  for (let i = 0; i < maxRetries + 1; i++) {
    try {
      return await ai.models.generateContent(params);
    } catch (error: any) {
      // Check for 429 or quota related errors
      const isQuotaError = 
        error?.status === 429 || 
        error?.code === 429 || 
        (error?.message && (
          error.message.includes('429') || 
          error.message.includes('quota') || 
          error.message.includes('RESOURCE_EXHAUSTED')
        ));
      
      if (isQuotaError && i < maxRetries) {
        console.warn(`Quota limit hit (Attempt ${i + 1}/${maxRetries}). Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
        continue;
      }
      
      // If it's not a quota error or we ran out of retries, throw the error
      throw error;
    }
  }
  throw new Error("API call failed after max retries");
};

// NEW: Analyze uploaded image/video to reverse-engineer creative idea
// Now accepts an array of media items to support batch analysis
export const generateIdeaFromMedia = async (mediaItems: { data: string, mimeType: string }[]) => {
  const count = mediaItems.length;
  const isSingle = count === 1;
  const hasVideo = mediaItems.some(item => item.mimeType.startsWith('video/'));
  
  let prompt = "";
  
  if (isSingle) {
     prompt = hasVideo 
      ? `请详细分析这段视频的内容、风格、运镜、光影和氛围。特别注意：如果视频中有字幕、对话或旁白，请务必将文字内容完整提取出来。将其转化为一段用于视频创作的灵感描述。描述应该包含：题材（如赛博朋克、纪录片等）、视觉风格、核心叙事、情感基调以及提取的台词文本。`
      : `请详细分析这张图片的内容、构图、光影、色彩和美术风格。特别注意：如果图片中有文字（如漫画气泡、海报标语），请务必将文字内容完整提取出来。将其转化为一段用于视频创作的灵感描述。描述应该包含：场景设定、可能的故事情节、视觉风格建议以及提取的文字信息。`;
  } else {
     prompt = `
      请详细分析用户上传的这 ${count} 个媒体文件（图片或视频）。
      这些文件按顺序排列，代表了一个视觉叙事或风格参考的序列。
      
      任务：
      1. 分析整体的视觉风格、色调、光影和构图的一致性与变化。
      2. 尝试分析它们之间的叙事逻辑、时间发展或情绪递进关系。
      3. **重要：文字提取**。如果画面中出现字幕、对话气泡或关键文字，请务必提取并整合到描述中。
      4. 将其综合转化为一段完整、连贯的视频创作灵感描述。
      
      描述应该包含：题材（如赛博朋克、悬疑、纪录片等）、核心视觉特征、根据画面推导出的故事情节梗概（包含对话）、以及情感基调。
    `;
  }

  // Use Gemini 3.0 Flash for multimodal analysis
  const response = await safeGenerateContent({
    model: 'gemini-3-flash-preview', 
    contents: {
      parts: [
        ...mediaItems.map(item => ({ inlineData: { mimeType: item.mimeType, data: item.data } })),
        { text: prompt }
      ]
    }
  });

  return response.text?.trim() || "";
};

// NEW: Parse unstructured document (PDF/Text) into structured storyboard JSON
// UPDATE: Added shotCount parameter to enforce specific length
export const parseDocumentToScript = async (base64Data: string, mimeType: string, shotCount: number) => {
  const prompt = `
    你是一个专业的分镜脚本转换器。
    
    用户上传了一个文档（PDF 或 文本），其中包含一个视频脚本或故事大纲。
    
    任务：
    1. 阅读并理解文档内容。
    2. 将其转换为严格符合以下 JSON 格式的结构化分镜数据。
    3. 【关键指令】：请生成 **${shotCount}** 个镜头。
       - 如果文档是纯故事大纲，请务必将其细化、拆解为 ${shotCount} 个具体镜头。不要因为情节简单就只生成少量镜头，请通过增加特写、环境空镜、情绪反应镜头等方式扩展。
       - 如果文档是已有剧本，请尝试适配 ${shotCount} 个镜头（如果原剧本过短，请进行艺术扩展；如果原剧本过长，请选取最精华的段落或进行概括，凑齐 ${shotCount} 个）。
       - 镜头总数必须是 4 的倍数。
       
    4. 如果文档中缺少某些具体信息（如具体的运镜指令 movement），请根据上下文进行合理的专业推断和补充。
    5. 确保镜头 ID 连续。
    6. 自动按 4 个镜头为一组生成 groups 数据。
    7. 自动提取并生成 settings（世界观、视觉风格、角色、场景）。
    
    请严格遵循 JSON 格式输出，不要包含任何 Markdown 格式标记以外的解释文字。
  `;

  // Use Flash 3.0 or Pro 3.0 (Pro is better for complex PDF layout parsing)
  // For better extraction quality, we use a capable model.
  const response = await safeGenerateContent({
    model: 'gemini-3-flash-preview', 
    contents: {
      parts: [
        { inlineData: { mimeType: mimeType, data: base64Data } },
        { text: prompt }
      ]
    },
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: storyboardSchema,
      temperature: 0.7, // Increased slightly to allow creative expansion to meet shot count
      maxOutputTokens: 8192,
    }
  });

  try {
    const cleanText = cleanJsonString(response.text || "{}");
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("JSON Parse Error", e);
    throw new Error("Failed to parse document to JSON script.");
  }
};

// NEW: Analyze uploaded image to reverse-engineer prompt
export const generatePromptFromImage = async (base64Image: string, type: 'character' | 'scene') => {
  const prompt = type === 'character' 
    ? `请分析这张图片，生成一段用于 AI 绘画的高质量中文提示词。
       格式要求：Midjourney 风格，**全程中文**关键词堆叠。
       【重要】：禁止出现英文。必须将“full body”, “cyberpunk”, “detailed”等词汇翻译为中文。
       必须包含：角色设定图，多视图，全身图，(正面，背面)，(面部特写，侧面特写)，以及图片中的具体外貌特征、服饰细节、体型、姿态、画风。
       请直接返回提示词文本，不要包含解释。`
    : `请分析这张图片，生成一段用于 AI 绘画的高质量中文提示词。
       格式要求：Midjourney 风格，**全程中文**关键词堆叠。
       【重要】：禁止出现英文。必须将“photorealistic”, “volumetric lighting”等词汇翻译为中文。
       必须包含：极度详细的环境描述，建筑风格，空间布局，光影，材质，色调，构图视角。
       请直接返回提示词文本，不要包含解释。`;

  // Use Gemini 3.0 Flash for image analysis as it is efficient and capable
  const response = await safeGenerateContent({
    model: 'gemini-3-flash-preview', 
    contents: {
      parts: [
        { inlineData: { mimeType: 'image/png', data: base64Image } },
        { text: prompt }
      ]
    }
  });

  return response.text?.trim() || "";
};

// NEW: Refine storyboard script (List of shots)
export const refineStoryboardScript = async (
  currentScript: Shot[],
  instruction: string,
  modelName: string
) => {
  const prompt = `
    你是一个专业的视频分镜编剧助手。
    
    当前分镜脚本:
    ${JSON.stringify(currentScript, null, 2)}
    
    用户修改指令: ${instruction}
    
    任务：
    1. 根据用户的指令修改分镜脚本。
    2. 如果用户指令是全局性的（例如“把所有白天改成黑夜”），请遍历修改所有相关镜头。
    3. 如果用户指令是针对特定镜头（例如“重写第3个镜头”），请只修改该镜头。
    4. 尽量保持镜头 ID 和总数量不变，除非用户明确要求增加或删除镜头。
    5. 保持镜头描述的专业性、画面感。
    6. **重要**：必须保留或生成新的 'voiceover' (台词/音效) 和 'movement' (运镜) 字段。
    
    请返回包含完整 script 数组的 JSON 对象。
  `;

  const result = await safeGenerateContent({
    model: modelName,
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: scriptResponseSchema, 
      temperature: 0.7,
    }
  });

  try {
    const cleanText = cleanJsonString(result.text || "{}");
    const parsed = JSON.parse(cleanText);
    return parsed.script;
  } catch (e) {
    console.error("JSON Parse Error", e);
    throw new Error("Failed to parse refined script JSON");
  }
};

// NEW: Refine existing image/camera prompts based on user instruction
export const refinePrompt = async (
  currentPrompts: any, 
  instruction: string, 
  modelName: string,
  targetField?: string
) => {
  const prompt = `
    你是一个 AI 提示词修改助手。
    
    当前 JSON 数据:
    ${JSON.stringify(currentPrompts, null, 2)}
    
    用户指令: ${instruction}
    ${targetField ? `特别注意：用户希望主要修改 "${targetField}" 字段，但请确保整体一致性。` : ''}

    任务：
    根据用户指令，智能修改上述 JSON 中的字段内容。
    - 保持 JSON 结构完全不变。
    - 只修改必要的内容。
    - **【最高优先级】全程强制使用中文**。
    - **禁止出现任何英文单词**。
    - 如果遇到 "Cinematic", "Unreal Engine", "Cyberpunk", "Noise" 等词汇，必须翻译为 "电影感", "虚幻引擎", "赛博朋克", "噪点"。
    
    请直接返回修改后的完整 JSON 对象。
  `;

  const result = await safeGenerateContent({
    model: modelName,
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: imagePromptsSchema, // We re-use the image prompts schema part
      temperature: 0.7,
    }
  });

  try {
    const cleanText = cleanJsonString(result.text || "{}");
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("JSON Parse Error", e);
    throw new Error("Failed to parse refined prompt JSON");
  }
};

// STEP 1: Generate Storyboard
export const generateStoryboard = async (userIdea: string, shotCount: number, modelName: string) => {
  const prompt = `
    你是一个专业的视频分镜导演。
    
    用户创意: ${userIdea}
    
    任务：
    1. 生成分镜脚本。
    【重要指令】：必须严格生成 **${shotCount}** 个镜头。
    - 当前请求数量：${shotCount}
    - 请不要生成 12 个或 16 个，必须是 ${shotCount} 个。
    - 如果创意较简单，请通过增加细节特写、动作拆解、环境空镜、情绪反应镜头等方式扩展，务必填满 ${shotCount} 个镜头。
    - 镜头总数必须是 4 的倍数。
    
    2. 按每组 4 个镜头分组（共 ${shotCount / 4} 组）。
    3. 输出设定信息：
       - 世界观概要 (overview)：使用中文。
       - **视觉风格 (style)**: 详细描述画面的美术风格、渲染质感、色彩倾向、光影特点（如：赛博朋克、吉卜力手绘、黑白电影、80年代复古等）。
       - 所有出场人物设定 (characters)：必须列出脚本中出现的**所有**人物。包含详细的中文外貌描述。
         **人物提示词 (prompt) 要求**：
         必须生成**中文**的“角色设定图”风格提示词。
         **禁止使用英文**。
         例如使用“全身图”而不是“Full body”。
       
       - 所有场景设定 (scenes)：必须列出脚本中出现的所有场景。包含详细的中文环境描述。
         **场景提示词 (prompt) 要求**：
         必须生成**极度详细的中文**环境提示词。
         **禁止使用英文**。
         必须包含："[核心建筑/地点]，[空间布局]，[环境细节与材质]，[天气与时间]，[光照与阴影效果]，[色彩氛围与色调]，[构图视角]，[渲染引擎/风格]"。
    
    4. **关键要求 - 分镜详情**：
       对于每一个镜头 (Shot)，除了视觉描述 (description) 外，必须额外生成：
       - **voiceover**: 该镜头的台词、旁白或关键音效。如果无台词，请标注环境音。
       - **movement**: 具体的摄影机运镜指令（如：推、拉、摇、移、跟拍）以及画面内主体的调度动作。确保画面是动态的。

    请严格遵循 JSON 格式输出。
  `;

  const result = await safeGenerateContent({
    model: modelName, 
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: storyboardSchema,
      temperature: 0.8, // Slightly increased temperature to encourage more creative expansion for longer scripts
      maxOutputTokens: 8192,
    }
  });

  try {
    const cleanText = cleanJsonString(result.text || "{}");
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("JSON Parse Error", e);
    throw new Error("Failed to parse storyboard JSON. The model output might be malformed or truncated.");
  }
};

// STEP 2: Generate Prompts
export const generatePromptsForGroup = async (
  groupId: number, 
  groupNarrative: string, 
  shots: Shot[],
  settings: StoryboardSettings,
  modelName: string,
  referenceImageBase64?: string
) => {
  const shotsContext = shots.map(s => `Shot ${s.id}:
  - 视觉: ${s.description}
  - 声音: ${s.voiceover}
  - 运镜与调度: ${s.movement}`).join('\n');
  
  // Serialize settings to JSON so the model knows the exact visual definitions
  const charactersContext = settings.characters.map(c => `- 角色名: ${c.name}, 视觉Prompt: ${c.prompt}`).join('\n');
  const scenesContext = settings.scenes.map(s => `- 场景名: ${s.name}, 视觉Prompt: ${s.prompt}`).join('\n');

  let prompt = `
    你是一个顶级 AI 视频提示词专家。
    
    当前任务：为第 ${groupId} 组分镜生成 Midjourney/Runway 提示词。
    该组剧情概要: ${groupNarrative}
    
    【全局语言强制要求 - 最高优先级】
    1. **所有输出必须严格使用简体中文 (Simplified Chinese)。**
    2. **禁止输出任何英文字母或单词**（除了 JSON key 本身和 "shot1", "shot2" 这种必要的结构标识符）。
    3. **必须翻译所有术语**。
       - ❌ 错误: "Cinematic lighting, 8k resolution, Cyberpunk style"
       - ✅ 正确: "电影级布光, 8k分辨率, 赛博朋克风格"
       - ❌ 错误: "Volumetric fog, Ray tracing"
       - ✅ 正确: "体积雾, 光线追踪"
    
    【强制性视觉约束 - 必须严格引用以下设定】
    **全局视觉风格 (Visual Style)**: ${settings.style || "无特殊指定，保持电影质感"}
    
    如果本组镜头中出现了以下角色或场景，必须直接使用下方提供的“视觉Prompt”中的描述词，确保画面一致性：
    
    [角色设定库]
    ${charactersContext}
    
    [场景设定库]
    ${scenesContext}
    
    【本组 4 个镜头详情】
    ${shotsContext}
    
    CRITICAL REQUIREMENT FOR IMAGE PROMPTS (JSON field "imagePrompts"):
    1. The fields MUST appear in this specific order: "shot", "subject", "environment", "lighting", "camera", "colorGrade", "style", "quality".
    2. "shot" 字段必须严格完全等于: "2*2 Grid storyboard layout,包含4个独立画面,无边框拼图,专业的影视制作场面分镜表,视觉布局严谨工整,16:9画幅"
    3. "subject" 字段必须严格遵循此格式: "[简短的整体画面描述]4个分镜内容依次为:shot1:[第1个镜头的详细视觉描述],shot2:[第2个镜头的详细视觉描述],shot3:[第3个镜头的详细视觉描述],shot4:[第4个镜头的详细视觉描述]"
    4. **Environment, Lighting, Camera, ColorGrade, Style, Quality**: 必须使用中文。并且**必须符合“全局视觉风格”的要求**。
       
    【BUG FIX INSTRUCTION】:
    - Ensure "shot1" description in the "subject" field is NEVER empty.
    - You MUST verify that "Shot ${shots[0]?.id}" from the context above is fully described in "shot1".
    
    CRITICAL REQUIREMENT FOR CAMERA PROMPTS (JSON field "cameraPrompts"):
    1. The content MUST start with the exact phrase: "根据参考图生成视频，顺序为从左到右，从上到下。只生成音效和台词，不要生成配乐，不要生成字幕"
    2. 必须生成极具影视感的运镜脚本，**消除死板感，增强连贯性**。
    3. 格式要求：
       对于每个镜头，必须包含以下部分：
       - **[运镜/Movement]**: 具体的推拉摇移指令 (e.g., 向前推镜头, 向左摇摄)。**必须使用中文**。
       - **[台词/Audio]**: 引用脚本中的 voiceover。
       - **[首尾帧逻辑/Transition]**: 明确描述该镜头的**结束画面 (Last Frame)** 和下一个镜头的**开始画面 (First Frame)**，确保视觉流动性。例如：“Shot 1 结束于主角的手部特写，Shot 2 从相同位置的手部特写开始拉开”。
    
    Template Example for "cameraPrompts":
    "根据参考图生成视频，顺序为从左到右，从上到下。只生成音效和台词，不要生成配乐，不要生成字幕
    
    Shot 1: [运镜: 缓慢推向主体] [台词: "..."] 画面描述... 结尾定格在...
    Shot 2: [衔接 Shot 1 结尾，起始帧为...] [运镜: 跟随动作摇摄] [台词: "..."] 画面描述...
    Shot 3: ...
    Shot 4: ...
    Transition Logic: 整体节奏从慢到快..."

    请 strictly return JSON matching the 'promptSchema'.
  `;

  let parts: any[] = [{ text: prompt }];

  // If a reference image is provided, add it to the request and update the prompt instruction
  if (referenceImageBase64) {
    prompt += `
      \n【额外视觉/运镜参考】
      用户上传了一张参考图片。请分析这张图片的构图、运镜角度或视觉风格，并将其应用到生成的 "imagePrompts" (style/camera) 和 "cameraPrompts" 中。
      这张图片是这组分镜的直接参考。
      
      IMPORTANT: You must return VALID JSON ONLY. No markdown, no explanations.
    `;
    // Re-assign text part with updated prompt
    parts = [
      { inlineData: { mimeType: 'image/png', data: referenceImageBase64 } },
      { text: prompt }
    ];
  }

  const config: any = {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.7,
      responseMimeType: "application/json",
      responseSchema: promptSchema,
  };

  const result = await safeGenerateContent({
    model: modelName, // Use the user-selected model (both Flash and Pro support images+text)
    contents: { parts },
    config: config
  });

  try {
    const cleanText = cleanJsonString(result.text || "{}");
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("JSON Parse Error", e);
    throw new Error("Failed to parse prompts JSON");
  }
};
