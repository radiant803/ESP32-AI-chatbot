const fs=require('fs');
const src=fs.readFileSync(require('path').join(__dirname,'../src/02-api.js'),'utf8');
const pre=`const clamp=(v,a,b)=>Math.min(b,Math.max(a,v)); class ApiError extends Error{constructor(c,m,h,s){super(m);this.code=c;this.hint=h;this.status=s}}
const Store={settings:{maxTokens:4096},saveSettings(){}}; const safe=(f,d)=>{try{return f()}catch(_){return d}}; const fmtBytes=n=>n+'B'; const esc=x=>x; const Dev0={};`;
const fn=new Function(pre+src+`; return {reasoningSpec,levelFor,reasoningFor,buildRequest,modelCaps,adaptToRejection,applyQuirks,ApiError,Store,upstreamError};`);
const {reasoningSpec,reasoningFor,buildRequest,modelCaps,adaptToRejection,applyQuirks,ApiError,Store,upstreamError}=fn();
let fails=0; const ok=(c,m)=>{ if(!c){fails++;console.log('FAIL',m)} else console.log('ok  ',m)};
const msg=[{role:'user',text:'hi'}];
const B=(p,m,o={})=>buildRequest(p,{model:m,messages:msg,temperature:0.7,...o}).body;
// OpenAI
let b=B('openai','gpt-5-nano',{effort:'low',think:true}); ok(b.reasoning.effort==='low'&&b.reasoning.summary==='auto'&&b.temperature===undefined,'gpt-5-nano low');
b=B('openai','gpt-5-nano',{effort:'medium',think:false}); ok(b.reasoning.effort==='medium','gpt-5-nano cannot be off: chat flag ignored');
b=B('openai','gpt-5-nano',{effort:'high',quiet:true}); ok(b.reasoning.effort==='minimal'&&!b.reasoning.summary,'gpt-5-nano quiet -> minimal, no summary');
b=B('openai','gpt-5.6-luna',{effort:'high',quiet:true}); ok(b.reasoning.effort==='none','gpt-5.6-luna quiet -> none');
b=B('anthropic','claude-sonnet-5-5',{effort:'high',quiet:true}); ok(!b.thinking,'claude quiet -> no thinking');
ok(JSON.stringify(reasoningSpec('openai','gpt-5-nano').levels)==='["minimal","low","medium","high"]','gpt-5-nano levels');
b=B('openai','gpt-5.6-luna',{effort:'high',think:false}); ok(b.reasoning.effort==='none'&&!b.reasoning.summary,'gpt-5.6-luna off -> none');
b=B('openai','gpt-5.6-luna',{effort:'high',think:true}); ok(b.reasoning.effort==='high','gpt-5.6-luna high');
b=B('openai','gpt-5.1',{effort:'minimal',think:true}); ok(b.reasoning.effort==='low','gpt-5.1 minimal->low (nearest)');
b=B('openai','o4-mini',{effort:'low'}); ok(b.reasoning.effort==='low','o4-mini low');
b=B('openai','gpt-4o-mini',{effort:'high'}); ok(!b.reasoning&&b.temperature===0.7,'gpt-4o-mini no reasoning, temperature kept');
ok(reasoningSpec('openai','gpt-5-chat-latest')===null,'gpt-5-chat none');
ok(JSON.stringify(reasoningSpec('openai','gpt-5-pro').levels)==='["high"]','gpt-5-pro high only');
// Anthropic
b=B('anthropic','claude-sonnet-5-5',{effort:'high',think:true}); ok(b.thinking&&b.thinking.budget_tokens===12000&&b.max_tokens>=13024&&b.temperature===undefined,'claude thinking high');
b=B('anthropic','claude-sonnet-5-5',{effort:'high',think:false}); ok(!b.thinking&&b.temperature===0.7,'claude thinking off keeps temperature');
ok(reasoningSpec('anthropic','claude-3-5-haiku')===null,'claude 3.5 haiku no thinking');
// Google
b=B('google','gemini-2.5-flash',{effort:'medium',think:true}); ok(b.generationConfig.thinkingConfig.thinkingBudget===8192,'gemini flash medium budget');
b=B('google','gemini-2.5-flash',{think:false}); ok(b.generationConfig.thinkingConfig.thinkingBudget===0,'gemini flash off=0');
b=B('google','gemini-2.5-pro',{think:false}); ok(b.generationConfig.thinkingConfig.thinkingBudget===8192,'gemini pro cannot be off: chat flag ignored');
b=B('google','gemini-2.5-pro',{quiet:true}); ok(b.generationConfig.thinkingConfig.thinkingBudget===128,'gemini pro quiet -> 128');
b=B('google','gemini-2.5-flash',{quiet:true}); ok(b.generationConfig.thinkingConfig.thinkingBudget===0,'gemini flash quiet -> 0');
b=B('google','gemini-3-pro',{effort:'medium'}); ok(b.generationConfig.thinkingConfig.thinkingLevel==='low'||b.generationConfig.thinkingConfig.thinkingLevel==='high','gemini 3 level');
ok(reasoningSpec('google','gemini-1.5-flash')===null,'gemini 1.5 none');
// Ollama
b=B('ollama','qwen3:8b',{think:true}); ok(b.think===true,'qwen3 think on'); b=B('ollama','qwen3:8b',{think:false}); ok(b.think===false,'qwen3 think off');
b=B('ollama','gpt-oss:20b',{effort:'high'}); ok(b.think==='high','gpt-oss level');
b=B('ollama','llama3.2:3b',{}); ok(b.think===undefined,'llama no think');
ok(modelCaps('openai','gpt-5-nano').reasoning===true&&modelCaps('openai','gpt-4o').reasoning===false,'caps flags');
b=B('openai','gpt-6-luna',{effort:'low',think:false}); ok(b.reasoning.effort==='none','gpt-6-luna off -> none');
b=B('openai','gpt-6-luna',{effort:'high'}); ok(b.reasoning.effort==='high'&&b.reasoning.summary==='auto','gpt-6-luna high');
ok(reasoningSpec('openai','gpt-4.1')===null,'gpt-4.1 none');

// ---- Recovery from parameters a model refuses (real provider wording) ----
const rej=(status,detail)=>new ApiError('provider_request_failed','The provider rejected this request (HTTP '+status+').','Provider says: '+detail,status);
let body={model:'x',temperature:0.3,max_output_tokens:100,reasoning:{effort:'none',summary:'auto'}};
ok(adaptToRejection('openai','gpt-x',body,rej(400,"Unsupported parameter: 'temperature' is not supported with this model."))&&body.temperature===undefined,'drops temperature on OpenAI 400');
ok(Store.settings.quirks['openai|gpt-x'].includes('temperature'),'quirk remembered');
let b2={model:'x',temperature:0.3}; applyQuirks('openai','gpt-x',b2); ok(b2.temperature===undefined,'remembered quirk applied up front');
body={reasoning:{effort:'low',summary:'auto'}}; ok(adaptToRejection('openai','m1',body,rej(400,"Unsupported parameter: 'reasoning.summary' is not supported with this model."))&&body.reasoning.summary===undefined&&body.reasoning.effort==='low','drops nested reasoning.summary');
body={reasoning:{effort:'none'}}; ok(adaptToRejection('openai','m2',body,rej(400,"Unsupported value: 'reasoning.effort' does not support 'none' with this model."))&&body.reasoning.effort==='minimal','steps effort none -> minimal');
body={temperature:0.7,thinking:{type:'enabled'}}; ok(adaptToRejection('anthropic','c1',body,rej(400,'`temperature` may only be set to 1 when thinking is enabled'))&&body.temperature===undefined,'anthropic temperature with thinking');
body={generationConfig:{thinkingConfig:{thinkingBudget:0},temperature:1}}; ok(adaptToRejection('google','g1',body,rej(400,'Invalid JSON payload received. Unknown name "thinkingConfig" at generation_config'))&&body.generationConfig.thinkingConfig===undefined&&body.generationConfig.temperature===1,'gemini unknown thinkingConfig');
body={think:true,model:'llama3.2:3b'}; ok(adaptToRejection('ollama','llama3.2:3b',body,rej(400,'"llama3.2:3b" does not support thinking'))&&body.think===undefined,'ollama no thinking support');
body={temperature:1}; ok(!adaptToRejection('openai','m3',body,rej(401,'bad key'))&&body.temperature===1,'ignores non-400 errors');
body={temperature:1}; ok(!adaptToRejection('openai','m4',body,rej(400,'Your prompt was flagged')),'ignores unrelated 400s');
body={x:1}; ok(!adaptToRejection('openai','m5',body,rej(400,"Unsupported parameter: 'nothing_here'")),'unknown param not in body: no retry loop');
ok(upstreamError(404,'Not found').code==='gateway_mismatch','bare 404 means not a ChatESP device');
ok(upstreamError(404,'{"error":{"message":"The model x does not exist"}}').code==='model_or_endpoint_not_found','JSON 404 is a provider model error');
ok(upstreamError(429,'{"error":{"message":"slow down"}}').code==='rate_limited','429 stays rate_limited');
ok(upstreamError(503,'{"ok":false,"error":{"code":"low_memory","message":"m","hint":"h"}}').code==='low_memory','device envelope code preserved');

// ---- Output-token ceilings (real provider wording) ----
body={max_output_tokens:16000,model:'x'}; ok(adaptToRejection('openai','cap1',body,rej(400,"Invalid 'max_output_tokens': integer above maximum value. Expected a value <= 8192, but got 16000 instead."))&&body.max_output_tokens===8192,'openai output ceiling learned');
ok(Store.settings.tokenCaps['openai|cap1']===8192,'ceiling remembered'); let b3={max_output_tokens:16000}; applyQuirks('openai','cap1',b3); ok(b3.max_output_tokens===8192,'remembered ceiling applied up front');
body={max_tokens:32000,thinking:{type:'enabled',budget_tokens:12000}}; ok(adaptToRejection('anthropic','cap2',body,rej(400,'max_tokens: 32000 > 8192, which is the maximum allowed number of output tokens for claude-3-5-haiku'))&&body.max_tokens===8192&&body.thinking.budget_tokens<8192,'anthropic ceiling lowers max_tokens and thinking budget');
body={generationConfig:{maxOutputTokens:30000}}; ok(adaptToRejection('google','cap3',body,rej(400,'Unable to submit request because it has a maxOutputTokens value of 30000 but the supported range is from 1 (inclusive) to 8193 (exclusive).'))&&body.generationConfig.maxOutputTokens===8193,'gemini ceiling');
body={max_output_tokens:500}; ok(!adaptToRejection('openai','cap4',body,rej(400,'max_output_tokens too small, must be at least 16')),'no downward loop on unrelated token errors');
b=B('openai','gpt-5-nano',{effort:'high',noSummary:true}); ok(b.reasoning.effort==='high'&&b.reasoning.summary===undefined,'noSummary omits the reasoning summary');
b=B('openai','gpt-5-nano',{effort:'high'}); ok(b.reasoning.summary==='auto','summary kept when shown');
b=B('google','gemini-2.5-flash',{effort:'high',noSummary:true}); ok(b.generationConfig.thinkingConfig.includeThoughts===false,'gemini thoughts skipped with noSummary');
console.log(fails?`${fails} FAILED`:'ALL PASSED'); process.exit(fails?1:0);
